const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir);
}

const dbPath = path.join(dbDir, 'newbooks.sqlite');
const db = new sqlite3.Database(dbPath);

const initDb = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // labels table
            db.run(`
                CREATE TABLE IF NOT EXISTS labels (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    url TEXT NOT NULL,
                    is_active INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // books table
            db.run(`
                CREATE TABLE IF NOT EXISTS books (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    label_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    author TEXT,
                    published_date DATE,
                    url TEXT,
                    is_visible INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (label_id) REFERENCES labels(id),
                    UNIQUE(label_id, title) -- Duplicate prevention rule
                )
            `);

            // Seed default labels if they don't exist
            const insertLabel = db.prepare(`
                INSERT OR IGNORE INTO labels (name, url) VALUES (?, ?)
            `);
            insertLabel.run('岩波新書', 'https://www.iwanami.co.jp/search/g8910.html');
            insertLabel.run('中公新書', 'https://www.chuko.co.jp/shinsho/');
            insertLabel.run('ちくま新書', 'https://www.chikumashobo.co.jp/chikuma_shinsho/');
            insertLabel.run('ちくま学芸文庫', 'http://chikumashobo.co.jp/chikuma_gakugei_bunko/');
            insertLabel.run('岩波文庫', 'https://www.iwanami.co.jp/bun/');
            insertLabel.run('岩波現代文庫', 'https://www.iwanami.co.jp/genbun/');
            insertLabel.run('講談社学術文庫', 'https://www.kodansha.co.jp/book/labels/g-bunko');
            insertLabel.run('講談社現代新書', 'https://www.kodansha.co.jp/book/labels/gendai-shinsho');
            insertLabel.run('ブルーバックス', 'https://www.kodansha.co.jp/book/labels/bluebacks');
            insertLabel.finalize();

            resolve();
        });
    });
};

module.exports = {
    db,
    initDb
};

// Run initialization if called directly
if (require.main === module) {
    initDb().then(() => {
        console.log('Database initialized successfully.');
        db.close();
    }).catch(err => {
        console.error('Error initializing database:', err);
    });
}
