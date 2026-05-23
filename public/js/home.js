const FACE_EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
  '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
  '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜',
  '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐',
  '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬',
  '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕',
  '🤢', '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '🤠',
  '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️',
  '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨',
  '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞',
  '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬',
];

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  initAppChrome('home');

  const feedEl = document.getElementById('home-feed');
  const suggestedEl = document.getElementById('suggested-users');
  const composeForm = document.getElementById('compose-form');
  const textarea = composeForm?.content;
  const imageInput = document.getElementById('post-image');
  const imagePreview = document.getElementById('image-preview');
  const imagePreviewWrap = document.getElementById('image-preview-wrap');
  const clearImageBtn = document.getElementById('clear-image');
  const emojiToggle = document.getElementById('emoji-toggle');
  const emojiPicker = document.getElementById('emoji-picker');

  initEmojiPicker();
  setupCompose();

  await Promise.all([loadSuggested(), loadHomeFeed()]);

  function setupCompose() {
    imageInput?.addEventListener('change', () => {
      const file = imageInput.files[0];
      if (!file) return hideImagePreview();
      imagePreview.src = URL.createObjectURL(file);
      imagePreviewWrap?.classList.remove('hidden');
    });

    clearImageBtn?.addEventListener('click', hideImagePreview);

    composeForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = composeForm.content.value.trim();
      const file = imageInput?.files[0];
      if (!content && !file) {
        alert('Add some text or an image to post.');
        return;
      }

      const btn = composeForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      closeEmojiPicker();
      try {
        const formData = new FormData();
        if (content) formData.append('content', content);
        if (file) formData.append('image', file);
        await apiUpload('/posts', formData);
        composeForm.reset();
        hideImagePreview();
        await loadHomeFeed();
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function hideImagePreview() {
    if (imagePreview?.src?.startsWith('blob:')) URL.revokeObjectURL(imagePreview.src);
    if (imageInput) imageInput.value = '';
    if (imagePreview) imagePreview.src = '';
    imagePreviewWrap?.classList.add('hidden');
  }

  function initEmojiPicker() {
    if (!emojiPicker) return;
    emojiPicker.innerHTML = FACE_EMOJIS.map(
      (emoji) =>
        `<button type="button" class="emoji-picker-btn" data-emoji="${emoji}">${emoji}</button>`
    ).join('');

    emojiToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      emojiPicker.classList.toggle('hidden');
      const isOpen = !emojiPicker.classList.contains('hidden');
      emojiToggle.setAttribute('aria-expanded', String(isOpen));
    });

    emojiPicker.addEventListener('click', (e) => {
      const btn = e.target.closest('.emoji-picker-btn');
      if (!btn || !textarea) return;
      insertAtCursor(textarea, btn.dataset.emoji);
      closeEmojiPicker();
    });

    document.addEventListener('click', (e) => {
      if (
        !emojiPicker.classList.contains('hidden') &&
        !emojiPicker.contains(e.target) &&
        !emojiToggle?.contains(e.target)
      ) {
        closeEmojiPicker();
      }
    });
  }

  function closeEmojiPicker() {
    emojiPicker?.classList.add('hidden');
    emojiToggle?.setAttribute('aria-expanded', 'false');
  }

  function insertAtCursor(field, text) {
    const start = field.selectionStart;
    const end = field.selectionEnd;
    field.value = field.value.slice(0, start) + text + field.value.slice(end);
    field.setSelectionRange(start + text.length, start + text.length);
  }

  async function loadSuggested() {
    suggestedEl.innerHTML = '<p class="loading">Loading suggestions…</p>';
    try {
      const { suggested } = await api('/users/suggested');
      if (!suggested.length) {
        suggestedEl.innerHTML = '<p class="muted-text">No suggestions right now. Add interests in your profile!</p>';
        return;
      }
      suggestedEl.innerHTML = suggested.map(renderSuggestedCard).join('');
      bindSuggestedFollow();
    } catch (err) {
      suggestedEl.innerHTML = `<p class="alert alert-error">${escapeHtml(err.message)}</p>`;
    }
  }

  function renderSuggestedCard(user) {
    const tags = user.sharedInterests?.length
      ? user.sharedInterests.map((t) => `<span class="interest-tag">${escapeHtml(t)}</span>`).join('')
      : '';
    return `
      <div class="suggested-card" data-user-id="${user._id}">
        <a href="/profile.html?u=${encodeURIComponent(user.username)}" class="suggested-card-link">
          ${renderAvatar(user)}
          <strong>${escapeHtml(user.displayName)}</strong>
          <span class="muted-text">@${escapeHtml(user.username)}</span>
          ${tags ? `<div class="interest-tags">${tags}</div>` : ''}
        </a>
        <button type="button" class="btn btn-primary btn-sm follow-suggest-btn" data-id="${user._id}">Follow</button>
      </div>
    `;
  }

  function bindSuggestedFollow() {
    suggestedEl.querySelectorAll('.follow-suggest-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/users/${btn.dataset.id}/follow`, { method: 'POST' });
          btn.textContent = 'Following';
          btn.disabled = true;
          btn.classList.replace('btn-primary', 'btn-secondary');
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  async function loadHomeFeed() {
    feedEl.innerHTML = '<p class="loading">Loading posts…</p>';
    try {
      const { posts } = await api('/posts/home');
      if (!posts.length) {
        feedEl.innerHTML = '<div class="empty-state"><p>No posts to discover yet. Check back soon!</p></div>';
        return;
      }
      feedEl.innerHTML = posts.map(renderPostCard).join('');
      bindPostInteractions(feedEl);
    } catch (err) {
      feedEl.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }
});
