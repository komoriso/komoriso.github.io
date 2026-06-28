document.addEventListener('DOMContentLoaded', () => {
    initIndexPage();
});

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderGroupedBooks(books, container) {
    container.innerHTML = '';

    if (books.length === 0) {
        container.style.display = 'none';
        document.getElementById('empty-state').style.display = 'block';
        return;
    }

    // レーベルごとにグループ化
    const groups = new Map();
    books.forEach(book => {
        const label = book.label_name || 'その他';
        if (!groups.has(label)) {
            groups.set(label, []);
        }
        groups.get(label).push(book);
    });

    groups.forEach((groupBooks, label) => {
        const section = document.createElement('section');
        section.className = 'label-group';

        const heading = document.createElement('h2');
        heading.className = 'label-heading';
        heading.textContent = label;
        section.appendChild(heading);

        const list = document.createElement('ul');
        list.className = 'book-list';

        groupBooks
            .slice()
            .sort((a, b) => String(a.published_date).localeCompare(String(b.published_date)))
            .forEach(book => {
                const item = document.createElement('li');
                item.className = 'book-item';

                const titleHtml = book.url
                    ? `<a href="${escapeHtml(book.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(book.title)}</a>`
                    : escapeHtml(book.title);

                const metaParts = [];
                if (book.author) metaParts.push(escapeHtml(book.author));
                if (book.published_date) metaParts.push(escapeHtml(book.published_date));

                item.innerHTML = `
                    <div class="book-title">${titleHtml}</div>
                    <div class="book-meta">${metaParts.join(' / ')}</div>
                `;
                list.appendChild(item);
            });

        section.appendChild(list);
        container.appendChild(section);
    });

    document.getElementById('empty-state').style.display = 'none';
    container.style.display = 'block';
}

async function initIndexPage() {
    try {
        const response = await fetch('/books.json');
        if (!response.ok) throw new Error('Failed to load books.json');
        const data = await response.json();

        document.getElementById('loading').style.display = 'none';
        document.getElementById('date-range').innerHTML =
            `対象期間: ${data.date_range.start} 〜 ${data.date_range.end}`;

        renderGroupedBooks(data.books, document.getElementById('book-container'));
    } catch (err) {
        document.getElementById('loading').innerHTML = 'エラーが発生しました。データを取得できません。';
        console.error(err);
    }
}
