/**
 * footprint.js — Echo Digital Footprint dashboard
 *
 * Talks exclusively to /api/footprint/* (authenticated).
 * Never uses hardcoded statistics or makes claims about unimplemented features.
 */

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  initAppChrome('footprint');

  // ── Tab navigation ─────────────────────────────────────────────────────
  const tabs = document.querySelectorAll('.fp-tab');
  const panels = document.querySelectorAll('.fp-panel');

  function activateTab(tabId) {
    tabs.forEach((t) => {
      const active = t.dataset.tab === tabId;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panels.forEach((p) => {
      p.hidden = p.id !== `panel-${tabId}`;
    });
    // Store last-visited tab in sessionStorage for convenience
    sessionStorage.setItem('fp_tab', tabId);
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });

  // ── Load data ──────────────────────────────────────────────────────────
  const loading = document.getElementById('fp-loading');

  try {
    const [summaryData, privacyData, securityData] = await Promise.all([
      api('/footprint/summary'),
      api('/footprint/privacy'),
      api('/footprint/security'),
    ]);

    loading.hidden = true;

    renderDashboard(summaryData);
    renderPrivacy(privacyData, summaryData.profile);
    renderSecurity(securityData);

    // Restore last tab
    const lastTab = sessionStorage.getItem('fp_tab');
    if (lastTab && [...tabs].some((t) => t.dataset.tab === lastTab)) {
      activateTab(lastTab);
    } else {
      activateTab('dashboard');
    }
  } catch (err) {
    loading.hidden = true;
    document.getElementById('fp-main').insertAdjacentHTML(
      'afterbegin',
      `<div class="alert alert-error" role="alert" style="margin-bottom:1rem;">Failed to load data: ${escapeHtml(err.message)}</div>`
    );
  }

  // ── DASHBOARD ──────────────────────────────────────────────────────────
  function renderDashboard(data) {
    const { profile, stats, recentPosts, recentComments, joinedCommunities } = data;

    // Stats bar
    const statsGrid = document.getElementById('fp-stats-grid');
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

    // Profile review
    const profileCard = document.getElementById('fp-profile-card');
    const memberSince = profile.createdAt
      ? new Date(profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
      : 'Unknown';

    profileCard.innerHTML = `
      <div class="fp-profile-inner">
        ${renderAvatar(profile, 'avatar--lg')}
        <div class="fp-profile-details">
          <strong class="fp-profile-name">${escapeHtml(profile.displayName)}</strong>
          <span class="fp-profile-username">@${escapeHtml(profile.username)}</span>
          ${profile.bio ? `<p class="fp-profile-bio">${escapeHtml(profile.bio)}</p>` : '<p class="fp-profile-bio fp-muted">No bio set.</p>'}
          <div class="fp-profile-interests">
            ${
              profile.interests?.length
                ? profile.interests
                    .map((i) => `<span class="interest-chip selected">${escapeHtml(i)}</span>`)
                    .join('')
                : '<span class="fp-muted">No interests selected.</span>'
            }
          </div>
          <div class="fp-profile-meta">
            <span>Joined: <strong>${memberSince}</strong></span>
          </div>
        </div>
      </div>`;

    // Posts list
    const postsList = document.getElementById('fp-posts-list');
    const postsEmpty = document.getElementById('fp-posts-empty');
    document.getElementById('posts-count-badge').textContent = `${stats.postsCount} total`;

    if (!recentPosts.length) {
      postsEmpty.hidden = false;
    } else {
      postsList.innerHTML = recentPosts
        .map(
          (p) => `
        <div class="fp-item" id="fp-post-${escapeHtml(p._id)}">
          <div class="fp-item-body">
            <p class="fp-item-content">${escapeHtml(p.content || '[Image post]')}</p>
            ${p.image ? `<img src="${escapeHtml(p.image)}" class="fp-item-image" alt="Post image">` : ''}
            <div class="fp-item-meta">
              <span>🤍 ${p.likesCount} likes</span>
              <span>💬 ${p.commentsCount} comments</span>
              <span>${formatDate(p.createdAt)}</span>
            </div>
          </div>
          <div class="fp-item-actions">
            <button class="btn btn-danger btn-sm fp-delete-post-btn" data-id="${escapeHtml(p._id)}" aria-label="Delete this post">Delete</button>
          </div>
        </div>`
        )
        .join('');

      postsList.querySelectorAll('.fp-delete-post-btn').forEach((btn) => {
        btn.addEventListener('click', () => deletePost(btn.dataset.id));
      });
    }

    // Comments list
    const commentsList = document.getElementById('fp-comments-list');
    const commentsEmpty = document.getElementById('fp-comments-empty');
    document.getElementById('comments-count-badge').textContent = `${stats.commentsCount} total`;

    if (!recentComments.length) {
      commentsEmpty.hidden = false;
    } else {
      commentsList.innerHTML = recentComments
        .map(
          (c) => `
        <div class="fp-item" id="fp-comment-${escapeHtml(c._id)}">
          <div class="fp-item-body">
            <p class="fp-item-content">${escapeHtml(c.content)}</p>
            ${
              c.postSnippet
                ? `<p class="fp-item-context">↩ On post: <em>${escapeHtml(c.postSnippet)}</em></p>`
                : ''
            }
            <div class="fp-item-meta">
              <span>${formatDate(c.createdAt)}</span>
            </div>
          </div>
          <div class="fp-item-actions">
            <button class="btn btn-danger btn-sm fp-delete-comment-btn" data-id="${escapeHtml(c._id)}" aria-label="Delete this comment">Delete</button>
          </div>
        </div>`
        )
        .join('');

      commentsList.querySelectorAll('.fp-delete-comment-btn').forEach((btn) => {
        btn.addEventListener('click', () => deleteComment(btn.dataset.id));
      });
    }

    // Communities grid
    const communitiesGrid = document.getElementById('fp-communities-list');
    const communitiesEmpty = document.getElementById('fp-communities-empty');
    document.getElementById('communities-count-badge').textContent = `${joinedCommunities.length} joined`;

    if (!joinedCommunities.length) {
      communitiesEmpty.hidden = false;
    } else {
      communitiesGrid.innerHTML = joinedCommunities
        .map(
          (c) => `
        <div class="fp-community-card">
          ${c.image ? `<img src="${escapeHtml(c.image)}" class="fp-community-img" alt="">` : `<div class="fp-community-img fp-community-placeholder" aria-hidden="true">🏘️</div>`}
          <div class="fp-community-info">
            <strong>${escapeHtml(c.name)}</strong>
            <span class="fp-muted fp-community-category">${escapeHtml(c.category)}</span>
          </div>
        </div>`
        )
        .join('');
    }
  }

  // ── Delete helpers ──────────────────────────────────────────────────────
  async function deletePost(id) {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    try {
      await api(`/footprint/posts/${id}`, { method: 'DELETE' });
      const el = document.getElementById(`fp-post-${id}`);
      el?.remove();
      // Update count visually
      const badge = document.getElementById('posts-count-badge');
      const current = parseInt(badge.textContent, 10);
      if (!isNaN(current)) badge.textContent = `${current - 1} total`;

      if (!document.getElementById('fp-posts-list').children.length) {
        document.getElementById('fp-posts-empty').hidden = false;
      }
    } catch (err) {
      alert(`Failed to delete post: ${err.message}`);
    }
  }

  async function deleteComment(id) {
    if (!confirm('Delete this comment? This cannot be undone.')) return;
    try {
      await api(`/footprint/comments/${id}`, { method: 'DELETE' });
      const el = document.getElementById(`fp-comment-${id}`);
      el?.remove();
      const badge = document.getElementById('comments-count-badge');
      const current = parseInt(badge.textContent, 10);
      if (!isNaN(current)) badge.textContent = `${current - 1} total`;

      if (!document.getElementById('fp-comments-list').children.length) {
        document.getElementById('fp-comments-empty').hidden = false;
      }
    } catch (err) {
      alert(`Failed to delete comment: ${err.message}`);
    }
  }

  // ── PRIVACY ────────────────────────────────────────────────────────────
  function renderPrivacy(privacyData, profile) {
    const { privacy, blockedUsersCount } = privacyData;

    // Set radio buttons to current values
    const visInput = document.querySelector(`input[name="profileVisibility"][value="${privacy?.profileVisibility ?? 'public'}"]`);
    const msgInput = document.querySelector(`input[name="messagingPermission"][value="${privacy?.messagingPermission ?? 'everyone'}"]`);
    if (visInput) visInput.checked = true;
    if (msgInput) msgInput.checked = true;

    // Save button
    const saveBtn = document.getElementById('save-privacy-btn');
    const saveStatus = document.getElementById('privacy-save-status');

    saveBtn.addEventListener('click', async () => {
      const profileVisibility = document.querySelector('input[name="profileVisibility"]:checked')?.value;
      const messagingPermission = document.querySelector('input[name="messagingPermission"]:checked')?.value;

      if (!profileVisibility || !messagingPermission) {
        setStatus(saveStatus, 'Please select a value for both settings.', 'error');
        return;
      }

      saveBtn.disabled = true;
      setStatus(saveStatus, 'Saving…', '');
      try {
        await api('/footprint/privacy', {
          method: 'PUT',
          body: { profileVisibility, messagingPermission },
        });
        setStatus(saveStatus, '✓ Privacy settings saved.', 'success');
      } catch (err) {
        setStatus(saveStatus, `Error: ${err.message}`, 'error');
      } finally {
        saveBtn.disabled = false;
      }
    });

    // Blocked users
    document.getElementById('blocked-count-badge').textContent = `${blockedUsersCount}`;
    loadBlockedUsers();
  }

  async function loadBlockedUsers() {
    try {
      const { blocked } = await api('/footprint/blocked');
      const list = document.getElementById('fp-blocked-list');
      const empty = document.getElementById('fp-blocked-empty');
      document.getElementById('blocked-count-badge').textContent = `${blocked.length}`;

      if (!blocked.length) {
        empty.hidden = false;
        list.innerHTML = '';
        return;
      }

      empty.hidden = true;
      list.innerHTML = blocked
        .map(
          (u) => `
        <div class="fp-item fp-blocked-item" id="fp-blocked-${escapeHtml(u._id)}">
          <div class="fp-item-body" style="display:flex;align-items:center;gap:0.75rem;">
            ${renderAvatar(u, '')}
            <div>
              <strong>${escapeHtml(u.displayName)}</strong>
              <span class="fp-muted"> @${escapeHtml(u.username)}</span>
            </div>
          </div>
          <div class="fp-item-actions">
            <button class="btn btn-secondary btn-sm fp-unblock-btn" data-id="${escapeHtml(u._id)}" aria-label="Unblock ${escapeHtml(u.username)}">Unblock</button>
          </div>
        </div>`
        )
        .join('');

      list.querySelectorAll('.fp-unblock-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await api(`/footprint/blocked/${btn.dataset.id}`, { method: 'DELETE' });
            document.getElementById(`fp-blocked-${btn.dataset.id}`)?.remove();
            const badge = document.getElementById('blocked-count-badge');
            const current = parseInt(badge.textContent, 10);
            if (!isNaN(current)) badge.textContent = `${Math.max(0, current - 1)}`;
            if (!list.children.length) {
              document.getElementById('fp-blocked-empty').hidden = false;
            }
          } catch (err) {
            alert(`Failed to unblock: ${err.message}`);
          }
        });
      });
    } catch (err) {
      // Non-fatal; leave the section empty
    }
  }

  // ── SECURITY ───────────────────────────────────────────────────────────
  function renderSecurity(data) {
    const { security, accountCreatedAt } = data;
    const grid = document.getElementById('fp-security-list');

    const checks = [
      {
        label: 'Password hashed (bcrypt)',
        ok: security.passwordHashed,
        desc: 'Your password is never stored in plain text.',
      },
      {
        label: 'JWT authentication',
        ok: security.jwtAuth,
        desc: `Tokens expire after ${security.tokenExpiry}.`,
      },
      {
        label: 'Email verified',
        ok: security.emailVerified,
        desc: 'Email verification is not yet implemented.',
      },
      {
        label: 'Two-factor authentication',
        ok: security.twoFactorEnabled,
        desc: '2FA is not yet available.',
      },
    ];

    const memberSince = accountCreatedAt
      ? new Date(accountCreatedAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'Unknown';

    grid.innerHTML = checks
      .map(
        (c) => `
      <div class="fp-security-item ${c.ok ? 'fp-security-item--ok' : 'fp-security-item--warn'}">
        <div class="fp-security-icon" aria-hidden="true">${c.ok ? '✓' : '○'}</div>
        <div>
          <strong>${c.label}</strong>
          <p class="fp-muted">${c.desc}</p>
        </div>
      </div>`
      )
      .join('');

    grid.insertAdjacentHTML(
      'beforeend',
      `<div class="fp-security-item fp-security-item--info">
        <div class="fp-security-icon" aria-hidden="true">📅</div>
        <div>
          <strong>Account created</strong>
          <p class="fp-muted">${memberSince}</p>
        </div>
      </div>`
    );

    // Password change form
    const form = document.getElementById('fp-password-form');
    const status = document.getElementById('password-save-status');
    const btn = document.getElementById('fp-password-btn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPw = document.getElementById('fp-new-password').value;
      const confirmPw = document.getElementById('fp-confirm-password').value;

      if (!newPw || newPw.length < 6) {
        setStatus(status, 'Password must be at least 6 characters.', 'error');
        return;
      }
      if (newPw !== confirmPw) {
        setStatus(status, 'Passwords do not match.', 'error');
        return;
      }

      btn.disabled = true;
      setStatus(status, 'Updating…', '');

      try {
        await api('/users/account', {
          method: 'PUT',
          body: { password: newPw },
        });
        form.reset();
        setStatus(status, '✓ Password updated. Note: existing tokens remain valid until they expire (7 days).', 'success');
      } catch (err) {
        setStatus(status, `Error: ${err.message}`, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function setStatus(el, msg, type) {
    el.textContent = msg;
    el.className = `fp-save-status ${type === 'success' ? 'fp-status--success' : type === 'error' ? 'fp-status--error' : ''}`;
  }
});
