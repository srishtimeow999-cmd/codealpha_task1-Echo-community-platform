document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  initAppChrome('search');

  const form = document.getElementById('search-form');
  const input = document.getElementById('search-input');
  const resultsEl = document.getElementById('search-results');
  const historyEl = document.getElementById('search-history');
  const clearHistoryBtn = document.getElementById('clear-history');

  await loadHistory();

  const params = new URLSearchParams(window.location.search);
  if (params.get('q')) {
    input.value = params.get('q');
    await runSearch(params.get('q'));
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q.length < 2) return;
    history.replaceState(null, '', `?q=${encodeURIComponent(q)}`);
    await runSearch(q);
    await loadHistory();
  });

  clearHistoryBtn?.addEventListener('click', async () => {
    try {
      await api('/search/history', { method: 'DELETE' });
      await loadHistory();
    } catch (err) {
      alert(err.message);
    }
  });

  async function loadHistory() {
    try {
      const { history } = await api('/search/history');
      if (!history.length) {
        historyEl.innerHTML = '<p class="muted-text">No recent searches</p>';
        clearHistoryBtn?.classList.add('hidden');
        return;
      }
      clearHistoryBtn?.classList.remove('hidden');
      historyEl.innerHTML = history
        .map(
          (h) => `
        <button type="button" class="history-chip" data-query="${escapeHtml(h.query)}">${escapeHtml(h.query)}</button>
      `
        )
        .join('');

      historyEl.querySelectorAll('.history-chip').forEach((chip) => {
        chip.addEventListener('click', async () => {
          input.value = chip.dataset.query;
          history.replaceState(null, '', `?q=${encodeURIComponent(chip.dataset.query)}`);
          await runSearch(chip.dataset.query);
        });
      });
    } catch {
      historyEl.innerHTML = '';
    }
  }

  async function runSearch(q) {
    resultsEl.innerHTML = '<p class="loading">Searching…</p>';
    try {
      const data = await api(`/search?q=${encodeURIComponent(q)}`);
      let html = '';

      if (data.users.length) {
        html += `<h2 class="section-title">Profiles</h2><div class="search-users">`;
        html += data.users
          .map(
            (u) => `
          <a href="/profile.html?u=${encodeURIComponent(u.username)}" class="search-user-card">
            ${renderAvatar(u)}
            <div>
              <strong>${escapeHtml(u.displayName)}</strong>
              <span class="muted-text">@${escapeHtml(u.username)}</span>
              ${u.bio ? `<p class="search-bio">${escapeHtml(u.bio)}</p>` : ''}
            </div>
          </a>
        `
          )
          .join('');
        html += '</div>';
      }

      if (data.posts.length) {
        html += `<h2 class="section-title">Posts</h2>`;
        html += data.posts.map(renderPostCard).join('');
      }

      if (!data.users.length && !data.posts.length) {
        html = '<div class="empty-state"><p>No results found.</p></div>';
      }

      resultsEl.innerHTML = html;
      bindPostInteractions(resultsEl);
    } catch (err) {
      resultsEl.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }
});
