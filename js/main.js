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

function renderBooks(books) {
  const container = document.getElementById('book-container');
  const emptyState = document.getElementById('empty-state');

  if (!books.length) {
    container.hidden = true;
    emptyState.hidden = false;
    return;
  }

  const rows = books.map((book) => {
    const title = book.url
      ? `<a href="${book.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(book.title)}</a>`
      : escapeHtml(book.title);

    return `<tr>
      <td>${escapeHtml(book.label_name)}</td>
      <td>${title}</td>
      <td>${escapeHtml(book.author || '')}</td>
      <td>${escapeHtml(book.published_date)}</td>
    </tr>`;
  });

  container.innerHTML = `<table class="book-table">
    <thead><tr><th>レーベル</th><th>書名</th><th>著者</th><th>刊行日</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;
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

    document.getElementById('date-range').textContent = range
      ? `対象期間: ${range.start} \u2013 ${range.end}`
      : '';
    document.getElementById('loading').hidden = true;
    renderBooks(data.books || []);
  } catch (error) {
    document.getElementById('loading').textContent = '新刊データの読み込みに失敗しました。';
    console.error(error);
  }
}
