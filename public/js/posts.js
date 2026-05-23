function renderPostImage(post) {
  if (!post.image) return '';
  return `<img class="post-image" src="${escapeHtml(post.image)}" alt="Post image">`;
}

function renderPostText(post) {
  if (!post.content) return '';
  return `<p class="post-content">${escapeHtml(post.content)}</p>`;
}

function renderPostCard(post) {
  const author = post.author;
  const liked = post.likedByMe ? 'liked' : '';
  const likeLabel = post.likedByMe ? 'Unlike' : 'Like';

  return `
    <article class="post-card" data-post-id="${post._id}">
      <div class="post-header">
        ${renderAvatar(author)}
        <div class="post-meta">
          <strong>${escapeHtml(author.displayName || author.username)}</strong>
          <span>@${escapeHtml(author.username)} · ${formatDate(post.createdAt)}</span>
        </div>
      </div>
      ${renderPostText(post)}
      ${renderPostImage(post)}
      <div class="post-actions">
        <button type="button" class="action-btn like-btn ${liked}" data-id="${post._id}" aria-pressed="${post.likedByMe}">
          ♥ <span class="like-label">${likeLabel}</span>
          <span class="like-count">${post.likesCount}</span>
        </button>
        <button type="button" class="action-btn toggle-comments-btn" data-id="${post._id}">
          💬 <span class="comment-count">${post.commentsCount || 0}</span> Comments
        </button>
      </div>
      <div class="comments-section hidden" id="comments-${post._id}">
        <div class="comments-list"></div>
        <form class="comment-form" data-post-id="${post._id}">
          <input type="text" name="content" placeholder="Write a comment…" maxlength="300" required>
          <button type="submit" class="btn btn-primary btn-sm">Comment</button>
        </form>
      </div>
    </article>
  `;
}

async function toggleLike(btn) {
  const id = btn.dataset.id;
  const isLiked = btn.classList.contains('liked');
  const method = isLiked ? 'DELETE' : 'POST';

  const { liked, likesCount } = await api(`/posts/${id}/like`, { method });
  btn.classList.toggle('liked', liked);
  btn.setAttribute('aria-pressed', liked);
  btn.querySelector('.like-label').textContent = liked ? 'Unlike' : 'Like';
  btn.querySelector('.like-count').textContent = likesCount;
}

async function loadComments(postId, section) {
  const list = section.querySelector('.comments-list');
  list.innerHTML = '<p class="loading">Loading comments…</p>';

  const { comments, commentsCount } = await api(`/posts/${postId}/comments`);
  const countEl = section.closest('.post-card')?.querySelector('.comment-count');
  if (countEl) countEl.textContent = commentsCount;

  if (!comments.length) {
    list.innerHTML = '<p class="empty-state comments-empty">No comments yet. Be the first!</p>';
    return;
  }

  list.innerHTML = comments
    .map(
      (c) => `
    <div class="comment" data-comment-id="${c._id}">
      ${renderAvatar(c.author)}
      <div class="comment-body">
        <strong>${escapeHtml(c.author.displayName || c.author.username)}</strong>
        <span class="comment-time"> · ${formatDate(c.createdAt)}</span>
        <p>${escapeHtml(c.content)}</p>
      </div>
    </div>
  `
    )
    .join('');
}

function bindPostInteractions(root = document) {
  root.querySelectorAll('.like-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await toggleLike(btn);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  root.querySelectorAll('.toggle-comments-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const section = document.getElementById(`comments-${id}`);
      const opening = section.classList.contains('hidden');
      section.classList.toggle('hidden');
      if (opening) {
        try {
          await loadComments(id, section);
        } catch (err) {
          section.querySelector('.comments-list').innerHTML =
            `<p class="alert alert-error">${escapeHtml(err.message)}</p>`;
        }
      }
    });
  });

  root.querySelectorAll('.comment-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const postId = form.dataset.postId;
      const input = form.content;
      const content = input.value.trim();
      if (!content) return;

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        const { commentsCount } = await api('/comments', {
          method: 'POST',
          body: { postId, content },
        });
        input.value = '';
        const card = form.closest('.post-card');
        const countEl = card?.querySelector('.comment-count');
        if (countEl) countEl.textContent = commentsCount;

        const section = document.getElementById(`comments-${postId}`);
        if (!section.classList.contains('hidden')) {
          await loadComments(postId, section);
        }
      } catch (err) {
        alert(err.message);
      } finally {
        submitBtn.disabled = false;
      }
    });
  });
}
