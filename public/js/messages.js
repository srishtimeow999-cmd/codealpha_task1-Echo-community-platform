document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  initAppChrome('messages');

  const listEl = document.getElementById('chat-list');
  listEl.innerHTML = '<p class="loading">Loading messages…</p>';

  try {
    const { conversations } = await api('/messages');
    if (!conversations.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <p>No messages yet.</p>
          <p class="muted-text">Search for someone and start a conversation from their profile.</p>
          <a href="/search.html" class="btn btn-primary btn-sm" style="margin-top:1rem;display:inline-flex;width:auto">Find people</a>
        </div>
      `;
      return;
    }

    listEl.innerHTML = conversations.map(renderChatItem).join('');
    listEl.querySelectorAll('.chat-item').forEach((item) => {
      item.addEventListener('click', () => {
        window.location.href = `/chat.html?user=${item.dataset.userId}`;
      });
    });
  } catch (err) {
    listEl.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
});

function renderChatItem(conv) {
  const u = conv.otherUser;
  const preview = conv.lastMessage
    ? escapeHtml(conv.lastMessage.slice(0, 60)) + (conv.lastMessage.length > 60 ? '…' : '')
    : '<span class="muted-text">No messages yet</span>';

  return `
    <article class="chat-item" data-user-id="${u._id}" role="button" tabindex="0">
      ${renderAvatar(u)}
      <div class="chat-item-body">
        <div class="chat-item-top">
          <strong>${escapeHtml(u.displayName)}</strong>
          <span class="chat-time">${formatDate(conv.lastMessageAt)}</span>
        </div>
        <p class="chat-preview">${preview}</p>
      </div>
    </article>
  `;
}
