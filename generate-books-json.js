const fs = require('fs');
const path = require('path');

const NDL_OPEN_SEARCH_ENDPOINT = 'https://ndlsearch.ndl.go.jp/api/opensearch';
const PAGE_SIZE = 20;
const MAX_PAGES_PER_LABEL = 10;

const LABELS = [
  { name: '岩波新書', publisher: '岩波書店', excludePatterns: [] },
  { name: '岩波文庫', publisher: '岩波書店', excludePatterns: [] },
  { name: '岩波現代文庫', publisher: '岩波書店', excludePatterns: [] },
  { name: '中公新書', publisher: '中央公論新社', excludePatterns: ['中公新書ラクレ'] },
  { name: 'ちくま新書', publisher: '筑摩書房', excludePatterns: [] },
  { name: 'ちくま学芸文庫', publisher: '筑摩書房', excludePatterns: [] },
  { name: '講談社現代新書', publisher: '講談社', excludePatterns: [] },
  { name: '講談社学術文庫', publisher: '講談社', excludePatterns: [] },
  { name: 'ブルーバックス', publisher: '講談社', excludePatterns: [] },
];

function getDateRange(baseDate = new Date()) {
  const start = new Date(baseDate);
  start.setMonth(start.getMonth() - 1);

  const end = new Date(baseDate);
  end.setMonth(end.getMonth() + 1);

  return {
    startText: toDateText(start),
    endText: toDateText(end),
  };
}

function toDateText(value) {
  return value.toISOString().split('T')[0];
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function stripTags(value) {
  return decodeXml(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchAll(content, pattern) {
  return [...content.matchAll(pattern)].map((match) => decodeXml(match[1]));
}

function getFirst(content, pattern) {
  const match = content.match(pattern);
  return match ? decodeXml(match[1]) : '';
}

function normalizeIssuedDate(rawValue) {
  const value = String(rawValue || '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    return `${value}-01`;
  }

  if (/^\d{4}\.\d{1,2}\.\d{1,2}/.test(value)) {
    const [year, month, day] = value.split(/[^\d]/).filter(Boolean);
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  if (/^\d{4}\.\d{1,2}$/.test(value)) {
    const [year, month] = value.split('.');
    return `${year}-${month.padStart(2, '0')}-01`;
  }

  return null;
}

function withinRange(dateText, range) {
  return dateText >= range.startText && dateText <= range.endText;
}

function extractDescription(itemXml) {
  const descriptions = matchAll(itemXml, /<dc:description(?: [^>]*)?>([\s\S]*?)<\/dc:description>/g);
  const usefulDescriptions = descriptions.filter((entry) => {
    return !/^\s*\d{4}(?:-\d{2}-\d{2})?\s*$/.test(entry) && entry !== '出版' && entry !== '発売';
  });

  if (usefulDescriptions.length > 0) {
    return usefulDescriptions.join(' / ');
  }

  const rawDescription = getFirst(itemXml, /<description>([\s\S]*?)<\/description>/);
  return stripTags(rawDescription).replace(/^.*?シリーズ名[:：]/, '').trim();
}

function extractAuthor(itemXml) {
  const author = getFirst(itemXml, /<author>([\s\S]*?)<\/author>/);
  if (!author) {
    return getFirst(itemXml, /<dc:creator>([\s\S]*?)<\/dc:creator>/);
  }

  return author.split(',')[0].trim();
}

function parseItems(xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  return items.map((itemXml) => {
    const identifiers = matchAll(itemXml, /<dc:identifier(?: [^>]*)?>([\s\S]*?)<\/dc:identifier>/g);
    const issued = getFirst(itemXml, /<dcterms:issued>([\s\S]*?)<\/dcterms:issued>/);
    const date = getFirst(itemXml, /<dc:date(?: [^>]*)?>([\s\S]*?)<\/dc:date>/);
    const seriesTitle = getFirst(itemXml, /<dcndl:seriesTitle>([\s\S]*?)<\/dcndl:seriesTitle>/);

    return {
      title: getFirst(itemXml, /<dc:title>([\s\S]*?)<\/dc:title>/),
      author: extractAuthor(itemXml),
      publisher: getFirst(itemXml, /<dc:publisher>([\s\S]*?)<\/dc:publisher>/),
      published_date: normalizeIssuedDate(issued) || normalizeIssuedDate(date),
      url: getFirst(itemXml, /<link>([\s\S]*?)<\/link>/),
      isbn: identifiers.find((value) => /^(97[89][-0-9]+|97[89]\d+)$/.test(value)) || '',
      description: extractDescription(itemXml),
      page_count: null,
      series_title: seriesTitle,
      label_hint: `${seriesTitle} ${stripTags(getFirst(itemXml, /<description>([\s\S]*?)<\/description>/))}`.trim(),
    };
  });
}

function dedupeBooks(books) {
  const seen = new Set();

  return books.filter((book) => {
    const key = book.isbn || `${book.label_name}::${book.title}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function fetchLabelBooks(label, range) {
  const books = [];
  const fromYear = range.startText.slice(0, 4);

  for (let page = 0; page < MAX_PAGES_PER_LABEL; page += 1) {
    const url = new URL(NDL_OPEN_SEARCH_ENDPOINT);
    url.searchParams.set('title', label.name);
    url.searchParams.set('from', fromYear);
    url.searchParams.set('cnt', String(PAGE_SIZE));
    url.searchParams.set('idx', String(page * PAGE_SIZE + 1));

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`NDL OpenSearch request failed for ${label.name}: ${response.status}`);
    }

    const xml = await response.text();
    const items = parseItems(xml);

    if (items.length === 0) {
      break;
    }

    for (const item of items) {
      const hint = `${item.label_hint} ${item.title}`.toLowerCase();
      const normalizedSeriesTitle = String(item.series_title || '').toLowerCase();

      if (!item.published_date || !withinRange(item.published_date, range)) {
        continue;
      }

      if (label.excludePatterns.some((pattern) => hint.includes(pattern.toLowerCase()))) {
        continue;
      }

      if (normalizedSeriesTitle) {
        if (!normalizedSeriesTitle.startsWith(label.name.toLowerCase())) {
          continue;
        }
      } else if (!hint.includes(label.name.toLowerCase())) {
        continue;
      }

      if (item.publisher && item.publisher !== label.publisher) {
        continue;
      }

      books.push({
        label_name: label.name,
        title: item.title,
        author: item.author,
        published_date: item.published_date,
        url: item.url,
        isbn: item.isbn,
        description: item.description,
        page_count: item.page_count,
      });
    }

    if (items.length < PAGE_SIZE) {
      break;
    }
  }

  return books;
}

async function main() {
  const range = getDateRange();
  const allBooks = [];

  for (const label of LABELS) {
    const labelBooks = await fetchLabelBooks(label, range);
    allBooks.push(...labelBooks);
  }

  const books = dedupeBooks(allBooks).sort((left, right) => {
    return left.published_date.localeCompare(right.published_date) || left.title.localeCompare(right.title, 'ja');
  });

  const output = {
    generated_at: new Date().toISOString(),
    date_range: {
      start: range.startText,
      end: range.endText,
    },
    books,
  };

  const outputPath = path.join(__dirname, 'public', 'books.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${books.length} books to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
