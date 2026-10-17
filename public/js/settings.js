/**
 * settings.js — Echo Settings, Footprints & Saved Posts Client
 *
 * Implements:
 * 1. Edit Profile & Account Credentials
 * 2. Footprints dashboard: activity stats, public profile/posts review,
 *    live privacy controls, blocked users, and honest security audit
 * 3. Saved Posts review and management
 * 4. Deep-link hash navigation (#profile, #footprints, #saved)
 */

'use strict';

const AVAILABLE_INTERESTS = [
  'technology', 'art', 'music', 'sports', 'travel', 'food', 'fashion', 'gaming',
];

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  initAppChrome('settings');

  // ── State ────────────────────────────────────────────────────────────────
  let currentUser = null;
  let selectedInterests = [];
  let footprintsLoaded = false;
  let savedPostsLoaded = false;

  // ── DOM References ───────────────────────────────────────────────────────
  const mainTabs = document.querySelectorAll('.settings-tab');
  const mainPanels = document.querySelectorAll('.settings-panel');
  const footprintsSubtabs = document.querySelectorAll('.footprints-subtab');
  const footprintsSubpanels = document.querySelectorAll('.footprints-subpanel');

  const accountForm = document.getElementById('account-settings-form');
  const profileForm = document.getElementById('profile-settings-form');
  const interestPicker = document.getElementById('interest-picker');
  const toastContainer = document.getElementById('settings-toast-container');

  // ── Toast Helper ─────────────────────────────────────────────────────────
  function showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `hh-toast hh-toast--${type}`;
    toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hh-toast--leaving');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ── HTML Escape Helper ───────────────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  // ── Main Tab Navigation (#profile, #footprints, #saved) ──────────────────
  function activateMainTab(tabId) {
    const validTabs = ['profile', 'footprints', 'saved'];
    const activeTab = validTabs.includes(tabId) ? tabId : 'profile';

    mainTabs.forEach((tab) => {
      const match = tab.dataset.tab === activeTab;
      tab.classList.toggle('active', match);
      tab.setAttribute('aria-selected', match ? 'true' : 'false');
    });

    mainPanels.forEach((panel) => {
      const match = panel.id === `panel-${activeTab}`;
      panel.hidden = !match;
      panel.classList.toggle('active', match);
    });

    // Lazy load data for tabs
    if (activeTab === 'footprints' && !footprintsLoaded) {
      loadFootprintsData();
    } else if (activeTab === 'saved' && !savedPostsLoaded) {
      loadSavedPosts();
    }
  }

  mainTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      window.location.hash = tab;
      activateMainTab(tab);
    });
  });

  // Listen to hash changes (from Settings hover menu clicks or back/forward)
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (['profile', 'footprints', 'saved'].includes(hash)) {
      activateMainTab(hash);
    }
  });

  // Footprints Sub-tabs
  footprintsSubtabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const subtab = btn.dataset.subtab;
      footprintsSubtabs.forEach((b) => b.classList.toggle('active', b.dataset.subtab === subtab));
      footprintsSubpanels.forEach((p) => {
        p.hidden = p.id !== `subpanel-${subtab}`;
      });
    });
  });

  document.getElementById('btn-goto-profile-edit')?.addEventListener('click', () => {
    window.location.hash = 'profile';
    activateMainTab('profile');
    document.getElementById('displayName')?.focus();
  });

  // ── Initial Tab Setup Based on URL Hash ──────────────────────────────────
  const initialHash = window.location.hash.replace('#', '');
  if (['footprints', 'saved', 'profile'].includes(initialHash)) {
    activateMainTab(initialHash);
  } else {
    activateMainTab('profile');
  }

  // ── 1. Load Profile & Account Info ───────────────────────────────────────
  await loadAccountSettings();

  async function loadAccountSettings() {
    try {
      const data = await api('/auth/me');
      currentUser = data.user;

      if (accountForm) {
        accountForm.email.value = currentUser.email || '';
      }

      if (profileForm) {
        profileForm.displayName.value = currentUser.displayName || '';
        profileForm.bio.value = currentUser.bio || '';
        profileForm.avatar.value = currentUser.avatar || '';
      }

      selectedInterests = [...(currentUser.interests || [])];
      buildInterestPicker(interestPicker, selectedInterests);
    } catch (err) {
      showToast('Failed to load profile data: ' + err.message, 'danger');
    }
  }

  function buildInterestPicker(container, selected) {
    if (!container) return;
    container.innerHTML = AVAILABLE_INTERESTS.map((interest) => {
      const isSelected = selected.includes(interest);
      return `
        <button type="button" class="interest-tag ${isSelected ? 'selected' : ''}" data-interest="${interest}">
          ${interest}
        </button>
      `;
    }).join('');

    container.querySelectorAll('.interest-tag').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.dataset.interest;
        if (selectedInterests.includes(item)) {
          selectedInterests = selectedInterests.filter((i) => i !== item);
          btn.classList.remove('selected');
        } else {
          selectedInterests.push(item);
          btn.classList.add('selected');
        }
      });
    });
  }

  // Profile update submit
  profileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-save-profile');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const { user } = await api('/users/profile', {
        method: 'PUT',
        body: {
          displayName: profileForm.displayName.value.trim(),
          bio: profileForm.bio.value.trim(),
          avatar: profileForm.avatar.value.trim(),
          interests: selectedInterests,
        },
      });
      setStoredUser(user);
      currentUser = user;
      showToast('Profile updated successfully!', 'success');
      initAppChrome('settings');
      // If footprints already loaded, refresh preview
      if (footprintsLoaded) loadFootprintsData();
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Profile';
    }
  });

  // Account update submit
  accountForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = accountForm.email.value.trim();
    const password = accountForm.password.value.trim();
    const body = { email };
    if (password) body.password = password;

    const btn = document.getElementById('btn-save-account');
    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
      const data = await api('/users/account', {
        method: 'PUT',
        body,
      });
      setStoredUser(data.user);
      accountForm.password.value = '';
      showToast('Account credentials updated successfully!', 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Update Account';
    }
  });

  // ── 2. FOOTPRINTS IMPLEMENTATION ─────────────────────────────────────────
  async function loadFootprintsData() {
    try {
      const [summaryData, privacyData, securityData] = await Promise.all([
        api('/footprint/summary'),
        api('/footprint/privacy'),
        api('/footprint/security'),
      ]);

      footprintsLoaded = true;
      renderFootprintsDashboard(summaryData);
      renderFootprintsPrivacy(privacyData, summaryData.profile);
      renderFootprintsSecurity(securityData);
    } catch (err) {
      showToast('Failed to load footprints: ' + err.message, 'danger');
    }
  }

  function renderFootprintsDashboard(data) {
    const { profile, stats, recentPosts, recentComments, joinedCommunities } = data;

    // Stats bar
    const statsGrid = document.getElementById('fp-stats-grid');
    if (statsGrid) {
      const statItems = [
        { label: 'Posts', value: stats.postsCount, icon: '📝' },
        { label: 'Comments', value: stats.commentsCount, icon: '💬' },
        { label: 'Followers', value: stats.followersCount, icon: '👥' },
        { label: 'Following', value: stats.followingCount, icon: '➕' },
        { label: 'Communities', value: stats.joinedCommunitiesCount, icon: '🏘️' },
        { label: 'Saved Posts', value: stats.savedPostsCount, icon: '🔖' },
      ];

      statsGrid.innerHTML = statItems
        .map(
          (s) => `
        <div class="fp-stat-card">
          <span class="fp-stat-icon" aria-hidden="true">${s.icon}</span>
          <strong class="fp-stat-value">${s.value}</strong>
          <span class="fp-stat-label">${s.label}</span>
        </div>`
        )
        .join('');
    }

    // Public Profile Preview Card
    const profileCard = document.getElementById('fp-profile-card');
    if (profileCard) {
      const memberSince = profile.createdAt
        ? new Date(profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
        : 'Unknown';

      const avatarHtml = profile.avatar
        ? `<img src="${escapeHtml(profile.avatar)}" alt="${escapeHtml(profile.username)}" class="avatar avatar--lg">`
        : `<div class="avatar avatar--lg avatar--placeholder">${escapeHtml(profile.displayName || profile.username).charAt(0).toUpperCase()}</div>`;

      profileCard.innerHTML = `
        <div class="fp-profile-inner">
          ${avatarHtml}
          <div class="fp-profile-details">
            <strong class="fp-profile-name">${escapeHtml(profile.displayName || profile.username)}</strong>
            <span class="fp-profile-username">@${escapeHtml(profile.username)}</span>
            ${profile.bio ? `<p class="fp-profile-bio">${escapeHtml(profile.bio)}</p>` : '<p class="fp-profile-bio fp-muted">No bio set.</p>'}
            <div class="fp-profile-meta">
              <span>Joined ${memberSince}</span>
              <span>·</span>
              <span>${profile.followersCount} followers</span>
              <span>·</span>
              <span>${profile.followingCount} following</span>
            </div>
            ${
              profile.interests?.length
                ? `<div class="fp-interests-list">${profile.interests.map((i) => `<span class="interest-tag">${escapeHtml(i)}</span>`).join('')}</div>`
                : ''
            }
          </div>
        </div>
      `;
    }

    // Public Posts List
    const postsList = document.getElementById('fp-posts-list');
    if (postsList) {
      if (!recentPosts?.length) {
        postsList.innerHTML = '<p class="fp-empty">You haven\'t published any posts yet.</p>';
      } else {
        postsList.innerHTML = recentPosts
          .map(
            (p) => `
          <div class="fp-item" id="fp-post-${p._id}">
            <div class="fp-item-body">
              <p class="fp-item-text">${escapeHtml(p.content || '(Image post)')}</p>
              ${p.image ? `<img src="${escapeHtml(p.image)}" alt="Post image" class="fp-item-thumb">` : ''}
              <div class="fp-item-meta">
                <span>${formatDate(p.createdAt)}</span>
                <span>♥ ${p.likesCount}</span>
                <span>💬 ${p.commentsCount}</span>
              </div>
            </div>
            <div class="fp-item-actions">
              <a href="/home.html" class="btn btn-ghost btn-xs">View</a>
              <button class="btn btn-danger btn-xs fp-delete-post" data-id="${p._id}">Delete</button>
            </div>
          </div>`
          )
          .join('');

        postsList.querySelectorAll('.fp-delete-post').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!confirm('Are you sure you want to permanently delete this post?')) return;
            try {
              await api(`/footprint/posts/${id}`, { method: 'DELETE' });
              document.getElementById(`fp-post-${id}`)?.remove();
              showToast('Post deleted', 'info');
              loadFootprintsData();
            } catch (err) {
              showToast(err.message, 'danger');
            }
          });
        });
      }
    }

    // Public Comments List
    const commentsList = document.getElementById('fp-comments-list');
    if (commentsList) {
      if (!recentComments?.length) {
        commentsList.innerHTML = '<p class="fp-empty">You haven\'t commented on any posts yet.</p>';
      } else {
        commentsList.innerHTML = recentComments
          .map(
            (c) => `
          <div class="fp-item" id="fp-comment-${c._id}">
            <div class="fp-item-body">
              <p class="fp-item-text">"${escapeHtml(c.content)}"</p>
              <div class="fp-item-meta">
                <span>${formatDate(c.createdAt)}</span>
                ${c.post ? `<span>on post by @${escapeHtml(c.post.author?.username || 'user')}</span>` : ''}
              </div>
            </div>
            <div class="fp-item-actions">
              <button class="btn btn-danger btn-xs fp-delete-comment" data-id="${c._id}">Delete</button>
            </div>
          </div>`
          )
          .join('');

        commentsList.querySelectorAll('.fp-delete-comment').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!confirm('Delete this comment?')) return;
            try {
              await api(`/footprint/comments/${id}`, { method: 'DELETE' });
              document.getElementById(`fp-comment-${id}`)?.remove();
              showToast('Comment deleted', 'info');
              loadFootprintsData();
            } catch (err) {
              showToast(err.message, 'danger');
            }
          });
        });
      }
    }

    // Joined Communities
    const commsList = document.getElementById('fp-communities-list');
    if (commsList) {
      if (!joinedCommunities?.length) {
        commsList.innerHTML = '<p class="fp-empty">You haven\'t joined any communities yet.</p>';
      } else {
        commsList.innerHTML = joinedCommunities
          .map(
            (c) => `
          <div class="fp-community-card">
            <strong>${escapeHtml(c.name)}</strong>
            <p>${escapeHtml(c.description || '')}</p>
            <span class="fp-community-members">${c.membersCount} members</span>
          </div>`
          )
          .join('');
      }
    }
  }

  // Render Footprints Privacy controls
  function renderFootprintsPrivacy(privacyData) {
    const { privacy } = privacyData;
    const form = document.getElementById('fp-privacy-form');
    if (!form) return;

    const visRadio = form.querySelector(`input[name="profileVisibility"][value="${privacy.profileVisibility || 'public'}"]`);
    if (visRadio) visRadio.checked = true;

    const msgRadio = form.querySelector(`input[name="messagingPermission"][value="${privacy.messagingPermission || 'everyone'}"]`);
    if (msgRadio) msgRadio.checked = true;

    // Update active highlight classes on radio cards
    form.querySelectorAll('.fp-radio-card').forEach((card) => {
      const input = card.querySelector('input');
      card.classList.toggle('active', input.checked);
      input.addEventListener('change', () => {
        form.querySelectorAll(`input[name="${input.name}"]`).forEach((other) => {
          other.closest('.fp-radio-card')?.classList.toggle('active', other.checked);
        });
      });
    });

    form.onsubmit = async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btn-save-privacy');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      const profileVisibility = form.querySelector('input[name="profileVisibility"]:checked')?.value;
      const messagingPermission = form.querySelector('input[name="messagingPermission"]:checked')?.value;

      try {
        await api('/footprint/privacy', {
          method: 'PUT',
          body: { profileVisibility, messagingPermission },
        });
        showToast('Privacy settings updated successfully!', 'success');
      } catch (err) {
        showToast(err.message, 'danger');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Privacy Settings';
      }
    };

    // Load blocked users
    loadBlockedUsers();
  }

  async function loadBlockedUsers() {
    const list = document.getElementById('fp-blocked-list');
    if (!list) return;

    try {
      const { blocked } = await api('/footprint/blocked');
      if (!blocked?.length) {
        list.innerHTML = '<p class="fp-empty">You have not blocked any users.</p>';
        return;
      }

      list.innerHTML = blocked
        .map(
          (u) => `
        <div class="fp-item fp-blocked-item" id="blocked-user-${u._id}">
          <div class="fp-item-body" style="display:flex;align-items:center;gap:0.75rem;">
            <div class="top-nav-avatar">${escapeHtml(u.displayName || u.username).charAt(0).toUpperCase()}</div>
            <div>
              <strong>${escapeHtml(u.displayName || u.username)}</strong>
              <span class="fp-item-meta">@${escapeHtml(u.username)}</span>
            </div>
          </div>
          <div class="fp-item-actions">
            <button class="btn btn-secondary btn-xs fp-unblock-btn" data-id="${u._id}">Unblock</button>
          </div>
        </div>`
        )
        .join('');

      list.querySelectorAll('.fp-unblock-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          try {
            await api(`/footprint/blocked/${id}`, { method: 'DELETE' });
            document.getElementById(`blocked-user-${id}`)?.remove();
            showToast('User unblocked', 'info');
            loadBlockedUsers();
          } catch (err) {
            showToast(err.message, 'danger');
          }
        });
      });
    } catch {
      list.innerHTML = '<p class="fp-empty">Failed to load blocked users.</p>';
    }
  }

  // Render Footprints Security audit
  function renderFootprintsSecurity(securityData) {
    const { security } = securityData;
    const checklist = document.getElementById('fp-security-checklist');
    if (!checklist) return;

    const items = [
      {
        title: 'Password encryption (bcrypt)',
        desc: 'Your password is cryptographically hashed with bcrypt (salt factor 10). It is never stored in plaintext.',
        ok: security.passwordHashed,
      },
      {
        title: 'Signed JWT authentication',
        desc: 'All requests use JSON Web Tokens signed with a secret key.',
        ok: security.jwtAuth,
      },
      {
        title: 'Two-Factor Authentication (2FA)',
        desc: '2FA is currently not supported on Echo. Your account relies on a strong password.',
        ok: security.twoFactorEnabled,
        neutral: true,
      },
      {
        title: 'Email verification',
        desc: 'Email addresses are not currently verified. Anyone with access to the email can register.',
        ok: security.emailVerified,
        neutral: true,
      },
    ];

    checklist.innerHTML = items
      .map(
        (item) => `
      <div class="fp-security-item ${item.neutral ? 'fp-security-item--neutral' : item.ok ? 'fp-security-item--ok' : 'fp-security-item--warn'}">
        <span class="fp-security-icon" aria-hidden="true">${item.neutral ? 'ℹ️' : item.ok ? '✓' : '⚠️'}</span>
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.desc)}</p>
        </div>
      </div>`
      )
      .join('');
  }

  // ── 3. SAVED POSTS IMPLEMENTATION ────────────────────────────────────────
  async function loadSavedPosts() {
    const container = document.getElementById('saved-posts-container');
    const emptyState = document.getElementById('saved-posts-empty');
    const countPill = document.getElementById('saved-posts-count-pill');
    if (!container) return;

    container.innerHTML = '<p class="loading">Loading saved posts...</p>';
    emptyState.style.display = 'none';

    try {
      const res = await api('/posts/saved');
      savedPostsLoaded = true;
      const posts = res.posts || [];

      if (countPill) {
        countPill.textContent = `${posts.length} ${posts.length === 1 ? 'saved post' : 'saved posts'}`;
      }

      if (posts.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'flex';
        return;
      }

      emptyState.style.display = 'none';
      container.innerHTML = posts.map(renderSavedPostCard).join('');

      // Bind interactions
      container.querySelectorAll('.btn-unsave-post').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const postId = btn.dataset.id;
          btn.disabled = true;
          try {
            await api(`/posts/${postId}/save`, { method: 'DELETE' });
            showToast('Post removed from saved items', 'info');

            const card = document.getElementById(`saved-post-${postId}`);
            if (card) {
              card.style.opacity = '0';
              card.style.transform = 'translateY(10px)';
              setTimeout(() => {
                card.remove();
                const remaining = container.querySelectorAll('.post-card').length;
                if (countPill) countPill.textContent = `${remaining} saved`;
                if (remaining === 0) {
                  emptyState.style.display = 'flex';
                }
              }, 250);
            }
          } catch (err) {
            showToast(err.message, 'danger');
            btn.disabled = false;
          }
        });
      });

      // Bind like buttons in saved posts
      container.querySelectorAll('.like-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const isLiked = btn.classList.contains('liked');
          const method = isLiked ? 'DELETE' : 'POST';
          try {
            const data = await api(`/posts/${id}/like`, { method });
            btn.classList.toggle('liked', data.liked);
            btn.querySelector('.like-label').textContent = data.liked ? 'Unlike' : 'Like';
            btn.querySelector('.like-count').textContent = data.likesCount;
          } catch (err) {
            showToast(err.message, 'danger');
          }
        });
      });
    } catch (err) {
      container.innerHTML = `<p class="fp-empty">Failed to load saved posts: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderSavedPostCard(post) {
    const author = post.author || {};
    const authorName = escapeHtml(author.displayName || author.username || 'User');
    const authorUsername = escapeHtml(author.username || 'user');
    const authorAvatar = author.avatar
      ? `<img src="${escapeHtml(author.avatar)}" alt="${authorUsername}" class="avatar">`
      : `<div class="avatar avatar--placeholder">${authorName.charAt(0).toUpperCase()}</div>`;

    const liked = post.likedByMe ? 'liked' : '';
    const likeLabel = post.likedByMe ? 'Unlike' : 'Like';

    return `
      <article class="post-card saved-post-card" id="saved-post-${post._id}">
        <div class="post-header">
          ${authorAvatar}
          <div class="post-meta">
            <strong>${authorName}</strong>
            <span>@${authorUsername} · ${formatDate(post.createdAt)}</span>
          </div>
          <button type="button" class="btn btn-ghost btn-sm btn-unsave-post" data-id="${post._id}" title="Remove from saved bookmarks">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
            <span>Saved</span>
          </button>
        </div>

        ${post.content ? `<p class="post-content">${escapeHtml(post.content)}</p>` : ''}
        ${post.image ? `<img class="post-image" src="${escapeHtml(post.image)}" alt="Post image">` : ''}

        <div class="post-actions">
          <button type="button" class="action-btn like-btn ${liked}" data-id="${post._id}">
            ♥ <span class="like-label">${likeLabel}</span>
            <span class="like-count">${post.likesCount || 0}</span>
          </button>
          <span class="action-btn" style="cursor:default;">
            💬 <span>${post.commentsCount || 0}</span> Comments
          </span>
        </div>
      </article>
    `;
  }
});
