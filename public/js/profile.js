const AVAILABLE_INTERESTS = [
  'technology', 'art', 'music', 'sports', 'travel', 'food', 'fashion', 'gaming',
];

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  initAppChrome('profile');

  const params = new URLSearchParams(window.location.search);
  const username = params.get('u') || getStoredUser()?.username;

  const profileEl = document.getElementById('profile-header');
  const postsEl = document.getElementById('profile-posts');
  const editForm = document.getElementById('edit-profile-form');
  const interestPicker = document.getElementById('interest-picker');
  let selectedInterests = [];

  buildInterestPicker(interestPicker, selectedInterests);

  document.getElementById('cancel-edit')?.addEventListener('click', () => {
    editForm.classList.add('hidden');
  });

  let profileUser = null;

  await loadProfile();

  editForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { user } = await api('/users/profile', {
        method: 'PUT',
        body: {
          displayName: editForm.displayName.value.trim(),
          bio: editForm.bio.value.trim(),
          avatar: editForm.avatar.value.trim(),
          interests: selectedInterests,
        },
      });
      setStoredUser(user);
      editForm.classList.add('hidden');
      await loadProfile();
    } catch (err) {
      alert(err.message);
    }
  });

  async function loadProfile() {
    profileEl.innerHTML = '<p class="loading">Loading profile…</p>';
    postsEl.innerHTML = '';

    try {
      const data = await api(`/users/${username}`);
      profileUser = data.user;

      const interestTags = (profileUser.interests || [])
        .map((t) => `<span class="interest-tag">${escapeHtml(t)}</span>`)
        .join('');

      profileEl.innerHTML = `
        <div class="profile-header">
          ${renderAvatar(profileUser, 'profile-avatar')}
          <div class="profile-info">
            <h1>${escapeHtml(profileUser.displayName || profileUser.username)}</h1>
            <p class="username">@${escapeHtml(profileUser.username)}</p>
            <div class="profile-stats">
              <span><strong>${profileUser.followersCount}</strong> Followers</span>
              <span><strong>${profileUser.followingCount}</strong> Following</span>
            </div>
            ${interestTags ? `<div class="interest-tags">${interestTags}</div>` : ''}
            ${profileUser.bio ? `<p>${escapeHtml(profileUser.bio)}</p>` : ''}
            <div class="profile-actions" id="profile-actions"></div>
          </div>
        </div>
      `;

      const actions = document.getElementById('profile-actions');
      if (data.isOwnProfile) {
        actions.innerHTML = `<button class="btn btn-secondary" id="edit-btn">Edit profile</button>`;
        document.getElementById('edit-btn').addEventListener('click', () => {
          editForm.displayName.value = profileUser.displayName || '';
          editForm.bio.value = profileUser.bio || '';
          editForm.avatar.value = profileUser.avatar || '';
          selectedInterests = [...(profileUser.interests || [])];
          buildInterestPicker(interestPicker, selectedInterests);
          editForm.classList.remove('hidden');
        });
      } else {
        const label = data.isFollowing ? 'Unfollow' : 'Follow';
        const cls = data.isFollowing ? 'btn-danger' : 'btn-primary';
        actions.innerHTML = `
          <button class="btn ${cls} btn-sm" id="follow-btn">${label}</button>
          <a href="/chat.html?user=${profileUser._id}" class="btn btn-secondary btn-sm">Message</a>
        `;
        document.getElementById('follow-btn').addEventListener('click', () => toggleFollow(data.isFollowing));
      }

      await loadUserPosts();
    } catch (err) {
      profileEl.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }

  async function toggleFollow(isFollowing) {
    const method = isFollowing ? 'DELETE' : 'POST';
    try {
      await api(`/users/${profileUser._id}/follow`, { method });
      await loadProfile();
    } catch (err) {
      alert(err.message);
    }
  }

  async function loadUserPosts() {
    postsEl.innerHTML = '<p class="loading">Loading posts…</p>';
    try {
      const { posts } = await api(`/users/${username}/posts`);
      if (!posts.length) {
        postsEl.innerHTML = '<div class="empty-state"><p>No posts yet.</p></div>';
        return;
      }
      postsEl.innerHTML = '<h2 class="section-title">Posts</h2>' + posts.map(renderPostCard).join('');
      bindPostInteractions(postsEl);
    } catch (err) {
      postsEl.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }
});

function buildInterestPicker(container, selected) {
  if (!container) return;
  container.innerHTML = AVAILABLE_INTERESTS.map((interest) => {
    const on = selected.includes(interest);
    return `<button type="button" class="interest-chip ${on ? 'selected' : ''}" data-interest="${interest}">${interest}</button>`;
  }).join('');

  container.querySelectorAll('.interest-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.interest;
      const idx = selected.indexOf(val);
      if (idx === -1) selected.push(val);
      else selected.splice(idx, 1);
      chip.classList.toggle('selected', selected.includes(val));
    });
  });
}
