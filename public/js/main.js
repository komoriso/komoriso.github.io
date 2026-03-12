document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    
    if (path === '/' || path.includes('index.html')) {
        initIndexPage();
    } else if (path.includes('label.html')) {
        initLabelPage();
    } else if (path.includes('admin.html')) {
        initAdminPage();
    }
});

// Utility to render book cards
function renderBooks(books, containerElement) {
    containerElement.innerHTML = '';
    
    if (books.length === 0) {
        containerElement.style.display = 'none';
        document.getElementById('empty-state').style.display = 'block';
        return;
    }
    
    books.forEach(book => {
        const card = document.createElement('div');
        card.className = 'book-card animate-fade-in';
        
        const labelHtml = book.label_name ? `<span class="book-label">${book.label_name}</span>` : '';
        const authorHtml = book.author ? `<div class="book-author">✍️ ${book.author}</div>` : '';
        
        card.innerHTML = `
            ${labelHtml}
            <h3 class="book-title">
                <a href="${book.url}" target="_blank" rel="noopener noreferrer">${book.title}</a>
            </h3>
            ${authorHtml}
            <div class="book-date">📅 発売: ${book.published_date}</div>
        `;
        
        containerElement.appendChild(card);
    });
    
    document.getElementById('empty-state').style.display = 'none';
    containerElement.style.display = 'grid';
}

const API_BASE = 'https://xin-kan-lan.onrender.com';

async function initIndexPage() {
    try {
        const response = await fetch('/public/books.json');
        if (!response.ok) throw new Error('books.json not found');
        const data = await response.json();

        document.getElementById('loading').style.display = 'none';
        document.getElementById('date-range').innerHTML = `
            対象期間: <strong>${data.range.start}</strong> 〜 <strong>${data.range.end}</strong>
        `;

        renderBooks(data.books, document.getElementById('book-container'));

    } catch (err) {
        document.getElementById('loading').innerHTML = 'エラーが発生しました。データを取得できません。';
        console.error(err);
    }
}

async function initLabelPage() {
    const params = new URLSearchParams(window.location.search);
    const labelId = params.get('id');
    
    if (!labelId) {
        window.location.href = '/index.html';
        return;
    }
    
    try {
        // Fetch label name
        const labelRes = await fetch(`${API_BASE}/api/labels/${labelId}`);
        if (labelRes.ok) {
            const labelData = await labelRes.json();
            document.getElementById('label-name').textContent = labelData.name;
        }

        const response = await fetch(`${API_BASE}/api/labels/${labelId}/books`);
        if (!response.ok) throw new Error('API Error');
        const data = await response.json();
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('date-range').innerHTML = `
            対象期間: <strong>${data.range.start}</strong> 〜 <strong>${data.range.end}</strong>
        `;
        
        renderBooks(data.books, document.getElementById('book-container'));
        
    } catch (err) {
        document.getElementById('loading').innerHTML = 'エラーが発生しました。データを取得できません。';
        console.error(err);
    }
}

function initAdminPage() {
    const loadLabels = async () => {
        const response = await fetch(`${API_BASE}/api/labels`);
        const labels = await response.json();
        const tbody = document.getElementById('label-table-body');
        tbody.innerHTML = '';
        
        labels.forEach(l => {
            const tr = document.createElement('tr');
            const statusClass = l.is_active ? 'status-active' : 'status-inactive';
            const statusText = l.is_active ? '有効' : '無効';
            const toggleText = l.is_active ? '無効にする' : '有効にする';
            
            tr.innerHTML = `
                <td>${l.id}</td>
                <td><strong>${l.name}</strong></td>
                <td><a href="${l.url}" target="_blank">${l.url.substring(0, 30)}...</a></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <button class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; margin-right: 0.5rem;" onclick="toggleLabel(${l.id}, ${l.is_active}, '${l.name}', '${l.url}')">${toggleText}</button>
                    <button class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="deleteLabel(${l.id})">削除</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    };

    window.toggleLabel = async (id, currentStatus, name, url) => {
        const newStatus = currentStatus === 1 ? 0 : 1;
        try {
            await fetch(`${API_BASE}/api/labels/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, url, is_active: newStatus })
            });
            loadLabels();
        } catch (e) {
            alert('更新に失敗しました');
        }
    };
    
    window.deleteLabel = async (id) => {
        if (!confirm('本当に削除しますか？')) return;
        try {
            await fetch(`${API_BASE}/api/labels/${id}`, {
                method: 'DELETE'
            });
            loadLabels();
        } catch (e) {
            alert('削除に失敗しました');
        }
    };

    document.getElementById('add-label-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-name').value;
        const url = document.getElementById('new-url').value;
        
        try {
            const res = await fetch(`${API_BASE}/api/labels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, url, is_active: 1 })
            });
            if (res.ok) {
                document.getElementById('new-name').value = '';
                document.getElementById('new-url').value = '';
                loadLabels();
            } else {
                alert('追加に失敗しました');
            }
        } catch (err) {
            alert('追加に失敗しました');
        }
    });

    // Init flow
    loadLabels();
}
