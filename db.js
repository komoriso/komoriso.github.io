const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'newbooks.sqlite');
const db = new sqlite3.Database(dbPath);

const DEFAULT_LABELS = [
  ['岩波新書', 'https://www.iwanami.co.jp/sin/'],
  ['岩波文庫', 'https://www.iwanami.co.jp/bun/'],
  ['岩波現代文庫', 'https://www.iwanami.co.jp/genbun/'],
  ['中公新書', 'https://www.chuko.co.jp/shinsho/'],
  ['ちくま新書', 'https://www.chikumashobo.co.jp/chikuma_shinsho/'],
  ['ちくま学芸文庫', 'https://www.chikumashobo.co.jp/chikuma_gakugei_bunko/'],
  ['講談社現代新書', 'https://www.kodansha.co.jp/book/labels/gendai-shinsho'],
  ['講談社学術文庫', 'https://www.kodansha.co.jp/book/labels/g-bunko'],
  ['ブルーバックス', 'https://www.kodansha.co.jp/book/labels/bluebacks'],
];

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve(this);
    });
  });
}

async function ensureBookColumns() {
  const columns = [
    ['thumbnail', 'TEXT'],
    ['isbn', 'TEXT'],
    ['description', 'TEXT'],
    ['page_count', 'INTEGER'],
  ];

  for (const [name, type] of columns) {
    await run(`ALTER TABLE books ADD COLUMN ${name} ${type}`).catch((error) => {
      if (!String(error.message).includes('duplicate column name')) {
        throw error;
      }
    });
  }
}

async function seedLabels() {
  for (const [name, url] of DEFAULT_LABELS) {
    await run('INSERT OR IGNORE INTO labels (name, url, is_active) VALUES (?, ?, 1)', [name, url]);
  }
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      author TEXT,
      published_date DATE,
      url TEXT,
      thumbnail TEXT,
      isbn TEXT,
      description TEXT,
      page_count INTEGER,
      is_visible INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (label_id) REFERENCES labels(id),
      UNIQUE(label_id, title)
    )
  `);

  await ensureBookColumns();
  await seedLabels();
}

module.exports = {
  db,
  initDb,
};

if (require.main === module) {
  initDb()
    .then(() => {
      console.log('Database initialized successfully.');
      db.close();
    })
    .catch((error) => {
      console.error('Error initializing database:', error);
      process.exit(1);
    });
}
