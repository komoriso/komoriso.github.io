const page = document.body.dataset.page;
const apiBase = document.body.dataset.apiBase || '';

document.addEventListener('DOMContentLoaded', () => {
  if (page === 'index') {
    initIndexPage();
  } else if (page === 'label') {
    initLabelPage();
  } else if (page === 'admin') {
    initAdminPage();
  }
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
    const label = book.label_id
      ? `<a class="book-label" href="/label.html?id=${encodeURIComponent(book.label_id)}">${escapeHtml(book.label_name)}</a>`
      : `<span class="book-label">${escapeHtml(book.label_name)}</span>`;
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

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

async function initIndexPage() {
  try {
    const data = await loadJson('/books.json');
    const range = data.date_range || data.range;

    document.getElementById('date-range').textContent = formatRange(range);
    document.getElementById('loading').hidden = true;
    renderBooks(data.books || []);
  } catch (error) {
    document.getElementById('loading').textContent = '新刊データの読み込みに失敗しました。';
    console.error(error);
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
    const [label, data] = await Promise.all([
      loadJson(`${apiBase}/api/labels/${labelId}`),
      loadJson(`${apiBase}/api/labels/${labelId}/books`),
    ]);

    document.getElementById('label-name').textContent = label.name;
    document.getElementById('date-range').textContent = formatRange(data.date_range || data.range);
    document.getElementById('loading').hidden = true;
    renderBooks(data.books || []);
  } catch (error) {
    document.getElementById('loading').textContent = 'レーベル別データの読み込みに失敗しました。';
    console.error(error);
  }
}

function adminRow(label) {
  const active = Number(label.is_active) === 1;
  const nextStatusLabel = active ? '無効化' : '有効化';

  return `
    <tr>
      <td>${label.id}</td>
      <td>${escapeHtml(label.name)}</td>
      <td><a href="${label.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(label.url)}</a></td>
      <td><span class="status ${active ? 'status-on' : 'status-off'}">${active ? '有効' : '無効'}</span></td>
      <td class="actions">
        <button type="button" data-action="toggle" data-id="${label.id}" data-name="${escapeHtml(label.name)}" data-url="${escapeHtml(label.url)}" data-active="${active ? 1 : 0}">${nextStatusLabel}</button>
        <button type="button" class="danger" data-action="delete" data-id="${label.id}">削除</button>
      </td>
    </tr>
  `;
}

async function refreshLabels() {
  const labels = await loadJson(`${apiBase}/api/labels`);
  document.getElementById('label-table-body').innerHTML = labels.map(adminRow).join('');
  document.getElementById('admin-status').textContent = `${labels.length}件のレーベルを表示中`;
}

async function initAdminPage() {
  const tableBody = document.getElementById('label-table-body');
  const form = document.getElementById('add-label-form');

  try {
    await refreshLabels();
  } catch (error) {
    document.getElementById('admin-status').textContent = 'レーベル一覧の読み込みに失敗しました。';
    console.error(error);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      name: document.getElementById('new-name').value.trim(),
      url: document.getElementById('new-url').value.trim(),
      is_active: 1,
    };

    try {
      const response = await fetch(`${apiBase}/api/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Create failed: ${response.status}`);
      }

      form.reset();
      await refreshLabels();
    } catch (error) {
      alert('レーベルの追加に失敗しました。');
      console.error(error);
    }
  });

  tableBody.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    const labelId = button.dataset.id;

    if (action === 'delete') {
      if (!window.confirm('このレーベルを削除しますか？')) {
        return;
      }

      try {
        const response = await fetch(`${apiBase}/api/labels/${labelId}`, { method: 'DELETE' });
        if (!response.ok) {
          throw new Error(`Delete failed: ${response.status}`);
        }

        await refreshLabels();
      } catch (error) {
        alert('レーベルの削除に失敗しました。');
        console.error(error);
      }

      return;
    }

    if (action === 'toggle') {
      const payload = {
        name: button.dataset.name,
        url: button.dataset.url,
        is_active: Number(button.dataset.active) === 1 ? 0 : 1,
      };

      try {
        const response = await fetch(`${apiBase}/api/labels/${labelId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`Update failed: ${response.status}`);
        }

        await refreshLabels();
      } catch (error) {
        alert('レーベル状態の更新に失敗しました。');
        console.error(error);
      }
    }
  });
}
