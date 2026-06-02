document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  initAppChrome('notifications');

  const listEl = document.getElementById('notifications-list');
  const markReadBtn = document.getElementById('mark-read-btn');

  await loadNotifications();

  markReadBtn?.addEventListener('click', async () => {
    try {
      await api('/notifications/read', { method: 'PUT' });
      await loadNotifications();
    } catch (err) {
      alert(err.message);
    }
  });

  async function loadNotifications() {
    listEl.innerHTML = '<p class="loading">Loading notifications…</p>';
    try {
      const { notifications } = await api('/notifications');
      
      if (!notifications || !notifications.length) {
        listEl.innerHTML = `
          <div class="empty-state">
            <p>You have no notifications yet.</p>
          </div>
        `;
        markReadBtn?.classList.add('hidden');
        return;
      }

      // Check if there are any unread notifications
      const hasUnread = notifications.some(n => !n.isRead);
      if (hasUnread) {
        markReadBtn?.classList.remove('hidden');
      } else {
        markReadBtn?.classList.add('hidden');
      }

      listEl.innerHTML = notifications.map(renderNotification).join('');
    } catch (err) {
      listEl.innerHTML = `<p class="alert alert-error">${escapeHtml(err.message)}</p>`;
    }
  }

  function renderNotification(n) {
    const sender = n.sender;
    const isUnread = !n.isRead ? 'unread' : '';
    const dateStr = formatDate(n.createdAt);
    
    const senderLink = `/profile.html?u=${encodeURIComponent(sender.username)}`;
    const senderAvatar = renderAvatar(sender);

    let contentHtml = '';
    let actionBtnHtml = '';

    if (n.type === 'like') {
      contentHtml = `
        <a href="${senderLink}">${escapeHtml(sender.displayName || sender.username)}</a> 
        liked your post
        ${n.post ? `<span class="muted-text">"${escapeHtml(truncate(n.post.content, 40))}"</span>` : ''}
      `;
      actionBtnHtml = `<a href="/profile.html" class="notification-meta-btn">View Post</a>`;
    } else if (n.type === 'comment') {
      contentHtml = `
        <a href="${senderLink}">${escapeHtml(sender.displayName || sender.username)}</a> 
        commented on your post: 
        <span class="muted-text">"${escapeHtml(truncate(n.comment?.content || '', 40))}"</span>
      `;
      actionBtnHtml = `<a href="/profile.html" class="notification-meta-btn">View Post</a>`;
    } else if (n.type === 'follow') {
      contentHtml = `
        <a href="${senderLink}">${escapeHtml(sender.displayName || sender.username)}</a> 
        started following you
      `;
      actionBtnHtml = `<a href="${senderLink}" class="notification-meta-btn">View Profile</a>`;
    }

    return `
      <div class="notification-card ${isUnread}">
        ${senderAvatar}
        <div class="notification-body">
          <p>${contentHtml}</p>
          <span class="notification-time">${dateStr}</span>
        </div>
        <div>
          ${actionBtnHtml}
        </div>
      </div>
    `;
  }

  function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max) + '…' : str;
  }
});
