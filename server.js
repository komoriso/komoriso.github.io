const express = require('express');
const cors = require('cors');
const path = require('path');
const { db } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));



// Utils: get date range (1 month before and after today)
const getDateRange = () => {
    const today = new Date();
    
    const startDate = new Date(today);
    startDate.setMonth(startDate.getMonth() - 1);
    
    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + 1);

    return {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
    };
};

// API: Get all books within 1 month range (grouped or ordered by date)
app.get('/api/books', (req, res) => {
    const range = getDateRange();
    
    const query = `
        SELECT books.*, labels.name as label_name 
        FROM books 
        JOIN labels ON books.label_id = labels.id
        WHERE books.published_date >= ? AND books.published_date <= ? AND books.is_visible = 1 AND labels.is_active = 1
        ORDER BY books.published_date ASC
    `;
    
    db.all(query, [range.start, range.end], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ range, books: rows });
    });
});

// API: Get books for a specific label within 1 month range
app.get('/api/labels/:id/books', (req, res) => {
    const { id } = req.params;
    const range = getDateRange();
    
    const query = `
        SELECT books.*, labels.name as label_name 
        FROM books 
        JOIN labels ON books.label_id = labels.id
        WHERE label_id = ? AND books.published_date >= ? AND books.published_date <= ? AND books.is_visible = 1
        ORDER BY books.published_date ASC
    `;
    
    db.all(query, [id, range.start, range.end], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ range, books: rows });
    });
});

// API: Get all labels
app.get('/api/labels', (req, res) => {
    db.all('SELECT * FROM labels ORDER BY id ASC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// API: Get single label
app.get('/api/labels/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM labels WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Label not found' });
        res.json(row);
    });
});

// Admin API: Create Label
app.post('/api/labels', (req, res) => {
    const { name, url, is_active } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'Name and URL are required' });

    const query = 'INSERT INTO labels (name, url, is_active) VALUES (?, ?, ?)';
    db.run(query, [name, url, is_active === undefined ? 1 : is_active], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, name, url, is_active });
    });
});

// Admin API: Update Label
app.put('/api/labels/:id', (req, res) => {
    const { id } = req.params;
    const { name, url, is_active } = req.body;
    
    const query = 'UPDATE labels SET name = ?, url = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    db.run(query, [name, url, is_active, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Label updated', changes: this.changes });
    });
});

// Admin API: Delete Label
app.delete('/api/labels/:id', (req, res) => {
    const { id } = req.params;
    
    const query = 'DELETE FROM labels WHERE id = ?';
    db.run(query, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Label deleted', changes: this.changes });
    });
});

// Start Server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

module.exports = app;
