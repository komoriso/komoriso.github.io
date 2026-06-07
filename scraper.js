const axios = require('axios');
const cheerio = require('cheerio');
const { db } = require('./db');

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
                
                books.push({
                    title: title || parts[0],
                    author: author || '',
                    published_date: new Date().toISOString().split('T')[0],
                    url: bookUrl
                });
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
                    let beforeAuthor = parts[0].replace(/ちくま(プリマー)?新書/g, '').trim();
                    beforeAuthor = beforeAuthor.replace(/ちくま学芸文庫/g, '').trim();
                    const titleAuthor = beforeAuthor.split(' ');
                    const author = titleAuthor.length > 1 ? titleAuthor.pop() : '';
                    const title = titleAuthor.join(' ') || beforeAuthor;
                    
                    const label = rawText.includes('ちくま学芸文庫') ? 'ちくま学芸文庫' : 'ちくま新書';
                    
                    books.push({
                        labelName: label,
                        title: title.trim(),
                        author: author.trim(),
                        published_date: new Date().toISOString().split('T')[0],
                        url: bookUrl
                    });
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
    // Setup targets for Iwanami
    const targets = [
        { name: '岩波新書', url: 'https://www.iwanami.co.jp/search/g8316.html' },
        { name: '岩波文庫', url: 'https://www.iwanami.co.jp/search/g8608.html' },
        { name: '岩波現代文庫', url: 'https://www.iwanami.co.jp/search/g8610.html' }
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
                    const authorPart = parentText.replace(linkText, '').replace(/著|編|訳|監修/g, '').trim();
                    const bookUrl = href.startsWith('http') ? href : 'https://www.iwanami.co.jp' + href;
                    
                    books.push({
                        labelName: target.name,
                        title: linkText,
                        author: authorPart,
                        published_date: new Date().toISOString().split('T')[0],
                        url: bookUrl
                    });
                }
            });
        } catch (err) {
            console.error(`Iwanami Scrape Error (${target.name}):`, err.message);
        }
    }
    
    // Remove duplicates
    const uniqueBooks = [];
    const seen = new Set();
    for (const b of books) {
        const key = b.labelName + b.title;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueBooks.push(b);
        }
    }
    return uniqueBooks;
}

async function saveBooksToDb(labelName, books) {
    return new Promise((resolve, reject) => {
        db.get('SELECT id FROM labels WHERE name = ?', [labelName], (err, row) => {
            if (err) return reject(err);
            if (!row) return resolve(); // Label not found, skip
            
            const labelId = row.id;
            let successCount = 0;
            let skipCount = 0;
            
            const stmt = db.prepare('INSERT OR IGNORE INTO books (label_id, title, author, published_date, url) VALUES (?, ?, ?, ?, ?)');
            
            db.serialize(() => {
                books.forEach(book => {
                    stmt.run(labelId, book.title, book.author, book.published_date, book.url, function(err) {
                        if (err) {
                            console.error('DB Insert Error:', err.message);
                        } else if (this.changes > 0) {
                            successCount++;
                        } else {
                            skipCount++;
                        }
                    });
                });
                stmt.finalize(() => {
                    resolve({ successCount, skipCount });
                });
            });
        });
    });
}

async function runScraper() {
    console.log('Starting scraper job at', new Date().toISOString());
    // Execute all scrapers
    const chukoBooks = await scrapeChuko();
    const chikumaBooksGroup = await scrapeChikuma();
    const iwanamiBooksGroup = await scrapeIwanami();

    // Map results to labels
    const results = {
        '中公新書': chukoBooks,
        'ちくま新書': chikumaBooksGroup.filter(b => b.labelName === 'ちくま新書'),
        'ちくま学芸文庫': chikumaBooksGroup.filter(b => b.labelName === 'ちくま学芸文庫'),
        '岩波新書': iwanamiBooksGroup.filter(b => b.labelName === '岩波新書'),
        '岩波文庫': iwanamiBooksGroup.filter(b => b.labelName === '岩波文庫'),
        '岩波現代文庫': iwanamiBooksGroup.filter(b => b.labelName === '岩波現代文庫')
    };
    
    let report = [];
    for (const [label, books] of Object.entries(results)) {
        if (!books || books.length === 0) {
            report.push(`- ${label}: Failed or no new books found.`);
            continue;
        }
        try {
            const { successCount, skipCount } = await saveBooksToDb(label, books);
            report.push(`- ${label}: ${successCount} new books added, ${skipCount} skipped (duplicates).`);
        } catch (err) {
             report.push(`- ${label}: DB Save Failed (${err.message})`);
        }
    }
    
    console.log('Scraping job completed.');
    console.log(report.join('\n'));
    return report.join('\n');
}

if (require.main === module) {
    runScraper().then(report => {
        console.log('Run standalone finished.');
    });
}

module.exports = { runScraper, scrapeIwanami, scrapeChuko, scrapeChikuma };
