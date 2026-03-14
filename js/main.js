document.addEventListener('DOMContentLoaded', () => {
  initIndexPage();
});

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRange(range) {
  if (!range) {
    return '対象期間を表示できません。';
  }

  return `対象期間: ${range.start} - ${range.end}`;
}

function resolveThumbnail(book) {
  if (book.thumbnail) {
    return `<img class="book-thumb" src="${book.thumbnail}" alt="${escapeHtml(book.title)} の表紙">`;
  }

  return '<div class="book-thumb placeholder">NO IMAGE</div>';
}

function renderBooks(books) {
  const container = document.getElementById('book-container');
  const emptyState = document.getElementById('empty-state');

  container.innerHTML = '';

  if (!books.length) {
    container.hidden = true;
    emptyState.hidden = false;
    return;
  }

  const cards = books.map((book) => {
    const label = `<span class="book-label">${escapeHtml(book.label_name)}</span>`;
    const isbn = book.isbn ? `<p class="book-meta">ISBN ${escapeHtml(book.isbn)}</p>` : '';
    const description = book.description
      ? `<p class="book-description">${escapeHtml(book.description)}</p>`
      : '';
    const pages = Number.isInteger(book.page_count)
      ? `<p class="book-meta">${book.page_count}ページ</p>`
      : '';

    return `
      <article class="book-card">
        <div class="book-cover-wrap">
          ${resolveThumbnail(book)}
        </div>
        <div class="book-body">
          ${label}
          <h2 class="book-title">
            <a href="${book.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(book.title)}</a>
          </h2>
          <p class="book-meta">${escapeHtml(book.author || '著者情報なし')}</p>
          <p class="book-meta">${escapeHtml(book.published_date)}</p>
          ${isbn}
          ${pages}
          ${description}
        </div>
      </article>
    `;
  });

  container.innerHTML = cards.join('');
  container.hidden = false;
  emptyState.hidden = true;
}

async function initIndexPage() {
  try {
    const response = await fetch('books.json');
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    const data = await response.json();
    const range = data.date_range;

    document.getElementById('date-range').textContent = formatRange(range);
    document.getElementById('loading').hidden = true;
    renderBooks(data.books || []);
  } catch (error) {
    document.getElementById('loading').textContent = '新刊データの読み込みに失敗しました。';
    console.error(error);
  }
}
