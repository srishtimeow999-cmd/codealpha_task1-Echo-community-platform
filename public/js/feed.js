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
  initSidebar('feed');

  const feedEl = document.getElementById('feed');
  const composeForm = document.getElementById('compose-form');
  const textarea = composeForm?.content;
  const imageInput = document.getElementById('post-image');
  const imagePreview = document.getElementById('image-preview');
  const imagePreviewWrap = document.getElementById('image-preview-wrap');
  const clearImageBtn = document.getElementById('clear-image');
  const emojiToggle = document.getElementById('emoji-toggle');
  const emojiPicker = document.getElementById('emoji-picker');

  initEmojiPicker();

  imageInput?.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file) {
      hideImagePreview();
      return;
    }
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
      await loadFeed();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  await loadFeed();

  function hideImagePreview() {
    if (imagePreview?.src?.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview.src);
    }
    if (imageInput) imageInput.value = '';
    if (imagePreview) imagePreview.src = '';
    imagePreviewWrap?.classList.add('hidden');
  }

  function initEmojiPicker() {
    if (!emojiPicker) return;

    emojiPicker.innerHTML = FACE_EMOJIS.map(
      (emoji) =>
        `<button type="button" class="emoji-picker-btn" data-emoji="${emoji}" role="option" aria-label="${emoji}">${emoji}</button>`
    ).join('');

    emojiToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      emojiPicker.classList.toggle('hidden');
      const isOpen = !emojiPicker.classList.contains('hidden');
      emojiToggle.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) emojiPicker.querySelector('.emoji-picker-btn')?.focus();
    });

    emojiPicker.addEventListener('click', (e) => {
      const btn = e.target.closest('.emoji-picker-btn');
      if (!btn || !textarea) return;
      insertAtCursor(textarea, btn.dataset.emoji);
      textarea.focus();
      closeEmojiPicker();
    });

    document.addEventListener('click', (e) => {
      if (
        !emojiPicker.classList.contains('hidden') &&
        !emojiPicker.contains(e.target) &&
        e.target !== emojiToggle &&
        !emojiToggle?.contains(e.target)
      ) {
        closeEmojiPicker();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeEmojiPicker();
    });
  }

  function closeEmojiPicker() {
    emojiPicker?.classList.add('hidden');
    emojiToggle?.setAttribute('aria-expanded', 'false');
  }

  function insertAtCursor(field, text) {
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const before = field.value.slice(0, start);
    const after = field.value.slice(end);
    field.value = before + text + after;
    const pos = start + text.length;
    field.setSelectionRange(pos, pos);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function loadFeed() {
    feedEl.innerHTML = '<p class="loading">Loading feed…</p>';
    try {
      const { posts } = await api('/posts/feed');
      if (!posts.length) {
        feedEl.innerHTML =
          '<div class="empty-state"><p>No posts yet. Follow someone or create your first post!</p></div>';
        return;
      }
      feedEl.innerHTML = posts.map(renderPostCard).join('');
      bindPostInteractions(feedEl);
    } catch (err) {
      feedEl.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }
});
