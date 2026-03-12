const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

const today = new Date();
const start = new Date(today); start.setMonth(start.getMonth() - 1);
const end = new Date(today); end.setMonth(end.getMonth() + 1);
const startStr = start.toISOString().split('T')[0];
const endStr = end.toISOString().split('T')[0];

async function scrapeChuko() {
    const books = [];
    try {
        const url = 'https://www.chuko.co.jp/shinsho/';
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        $('li.linkbox').each((i, el) => {
            const rawText = $(el).text().replace(/\s+/g, ' ').trim();
            const urlMatch = $(el).find('a').attr('href');
            const bookUrl = urlMatch ? (urlMatch.startsWith('http') ? urlMatch : 'https://www.chuko.co.jp' + urlMatch) : url;
            const parts = rawText.split('著');
            if (parts.length >= 2) {
                const titleAuthor = parts[0].trim().split(' ');
                const author = titleAuthor.pop();
                const title = titleAuthor.join(' ');
                books.push({ label_name: '中公新書', title: title || parts[0], author: author || '', published_date: today.toISOString().split('T')[0], url: bookUrl });
            }
        });
    } catch (err) {
        console.error('Chuko Scrape Error:', err.message);
    }
    return books;
}

async function scrapeChikuma() {
    const books = [];
    try {
        const url = 'https://www.chikumashobo.co.jp/search/?cat=newbook';
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(response.data);
        $('article').each((i, el) => {
            const rawText = $(el).text().replace(/\s+/g, ' ').trim();
            const urlMatch = $(el).find('a').attr('href');
            const bookUrl = urlMatch ? (urlMatch.startsWith('http') ? urlMatch : 'https://www.chikumashobo.co.jp' + urlMatch) : url;
            if (rawText.includes('ちくま新書') || rawText.includes('ちくまプリマー新書') || rawText.includes('ちくま学芸文庫')) {
                const parts = rawText.split('著');
                if (parts.length >= 2) {
                    let beforeAuthor = parts[0].replace(/ちくま(プリマー)?新書/g, '').replace(/ちくま学芸文庫/g, '').trim();
                    const titleAuthor = beforeAuthor.split(' ');
                    const author = titleAuthor.length > 1 ? titleAuthor.pop() : '';
                    const title = titleAuthor.join(' ') || beforeAuthor;
                    const label_name = rawText.includes('ちくま学芸文庫') ? 'ちくま学芸文庫' : 'ちくま新書';
                    books.push({ label_name, title: title.trim(), author: author.trim(), published_date: today.toISOString().split('T')[0], url: bookUrl });
                }
            }
        });
    } catch (err) {
        console.error('Chikuma Scrape Error:', err.message);
    }
    return books;
}

async function scrapeIwanami() {
    const books = [];
    const targets = [
        { label_name: '岩波新書', url: 'https://www.iwanami.co.jp/search/g8316.html' },
        { label_name: '岩波文庫', url: 'https://www.iwanami.co.jp/search/g8608.html' },
        { label_name: '岩波現代文庫', url: 'https://www.iwanami.co.jp/search/g8610.html' }
    ];
    for (const target of targets) {
        try {
            const response = await axios.get(target.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const $ = cheerio.load(response.data);
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                const linkText = $(el).text().trim().replace(/\s+/g, ' ');
                if (href && href.includes('/book/b') && linkText.length > 2) {
                    const parentText = $(el).parent().parent().text().replace(/\s+/g, ' ').trim();
                    const author = parentText.replace(linkText, '').replace(/著|編|訳|監修/g, '').trim();
                    const bookUrl = href.startsWith('http') ? href : 'https://www.iwanami.co.jp' + href;
                    books.push({ label_name: target.label_name, title: linkText, author, published_date: today.toISOString().split('T')[0], url: bookUrl });
                }
            });
        } catch (err) {
            console.error(`Iwanami Scrape Error (${target.label_name}):`, err.message);
        }
    }
    // Remove duplicates
    const seen = new Set();
    return books.filter(b => {
        const key = b.label_name + b.title;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

async function main() {
    console.log('Scraping started at', new Date().toISOString());
    const [chuko, chikuma, iwanami] = await Promise.all([scrapeChuko(), scrapeChikuma(), scrapeIwanami()]);
    const allBooks = [...chuko, ...chikuma, ...iwanami];

    const output = {
        range: { start: startStr, end: endStr },
        books: allBooks,
        generated_at: new Date().toISOString()
    };

    const outPath = path.join(__dirname, 'public', 'books.json');
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`Done. ${allBooks.length} books written to ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
