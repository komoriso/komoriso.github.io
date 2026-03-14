const cors = require('cors');
const express = require('express');
const path = require('path');
require('dotenv').config();
const { db, initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getDateRange(baseDate = new Date()) {
  const start = new Date(baseDate);
  start.setMonth(start.getMonth() - 1);

  const end = new Date(baseDate);
  end.setMonth(end.getMonth() + 1);

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

function respondWithBooks(res, error, rows, range) {
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({
    range,
    date_range: range,
    books: rows,
  });
}

app.get('/api/books', (req, res) => {
  const range = getDateRange();
  const query = `
    SELECT books.*, labels.name AS label_name
    FROM books
    INNER JOIN labels ON labels.id = books.label_id
    WHERE books.published_date >= ?
      AND books.published_date <= ?
      AND books.is_visible = 1
      AND labels.is_active = 1
    ORDER BY books.published_date ASC, books.title ASC
  `;

  db.all(query, [range.start, range.end], (error, rows) => {
    respondWithBooks(res, error, rows, range);
  });
});

app.get('/api/labels/:id/books', (req, res) => {
  const range = getDateRange();
  const query = `
    SELECT books.*, labels.name AS label_name
    FROM books
    INNER JOIN labels ON labels.id = books.label_id
    WHERE books.label_id = ?
      AND books.published_date >= ?
      AND books.published_date <= ?
      AND books.is_visible = 1
      AND labels.is_active = 1
    ORDER BY books.published_date ASC, books.title ASC
  `;

  db.all(query, [req.params.id, range.start, range.end], (error, rows) => {
    respondWithBooks(res, error, rows, range);
  });
});

app.get('/api/labels', (req, res) => {
  db.all('SELECT * FROM labels ORDER BY id ASC', [], (error, rows) => {
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(rows);
  });
});

app.get('/api/labels/:id', (req, res) => {
  db.get('SELECT * FROM labels WHERE id = ?', [req.params.id], (error, row) => {
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!row) {
      res.status(404).json({ error: 'Label not found' });
      return;
    }

    res.json(row);
  });
});

app.post('/api/labels', (req, res) => {
  const { name, url, is_active: isActive = 1 } = req.body;

  if (!name || !url) {
    res.status(400).json({ error: 'Name and URL are required' });
    return;
  }

  db.run(
    'INSERT INTO labels (name, url, is_active) VALUES (?, ?, ?)',
    [name, url, isActive ? 1 : 0],
    function onInsert(error) {
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.status(201).json({
        id: this.lastID,
        name,
        url,
        is_active: isActive ? 1 : 0,
      });
    },
  );
});

app.put('/api/labels/:id', (req, res) => {
  const { name, url, is_active: isActive } = req.body;

  db.run(
    `
      UPDATE labels
      SET name = ?, url = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [name, url, isActive ? 1 : 0, req.params.id],
    function onUpdate(error) {
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({ message: 'Label updated', changes: this.changes });
    },
  );
});

app.delete('/api/labels/:id', (req, res) => {
  db.run('DELETE FROM labels WHERE id = ?', [req.params.id], function onDelete(error) {
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ message: 'Label deleted', changes: this.changes });
  });
});

if (require.main === module) {
  initDb().then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  });
}

module.exports = app;
