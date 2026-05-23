document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  initAppChrome('messages');

  const params = new URLSearchParams(window.location.search);
  const userId = params.get('user');
  if (!userId) {
    window.location.href = '/messages.html';
    return;
  }

  const headerEl = document.getElementById('chat-header');
  const messagesEl = document.getElementById('chat-messages');
  const form = document.getElementById('chat-form');

  let conversation = null;

  await loadChat();

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = form.text.value.trim();
    if (!text) return;

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await api(`/messages/with/${userId}`, { method: 'POST', body: { text } });
      form.reset();
      await loadChat();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  async function loadChat() {
    messagesEl.innerHTML = '<p class="loading">Loading chat…</p>';
    try {
      const data = await api(`/messages/with/${userId}`);
      conversation = data.conversation;
      const u = conversation.otherUser;

      document.title = `${u.displayName} — Echo`;
      headerEl.innerHTML = `
        <a href="/profile.html?u=${encodeURIComponent(u.username)}" class="chat-header-profile">
          ${renderAvatar(u)}
          <div>
            <strong>${escapeHtml(u.displayName)}</strong>
            <span class="muted-text">@${escapeHtml(u.username)}</span>
          </div>
        </a>
      `;

      const me = getStoredUser();
      if (!data.messages.length) {
        messagesEl.innerHTML = '<p class="empty-state muted-text">Say hello!</p>';
        return;
      }

      messagesEl.innerHTML = data.messages
        .map((m) => {
          const mine = String(m.sender._id) === String(me?._id);
          return `
            <div class="chat-bubble ${mine ? 'chat-bubble-mine' : 'chat-bubble-theirs'}">
              <p>${escapeHtml(m.text)}</p>
              <span class="chat-bubble-time">${formatDate(m.createdAt)}</span>
            </div>
          `;
        })
        .join('');

      messagesEl.scrollTop = messagesEl.scrollHeight;
    } catch (err) {
      messagesEl.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }
});
