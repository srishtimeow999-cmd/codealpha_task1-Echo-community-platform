/**
 * helphub.js — Echo Help Hub Frontend Client
 *
 * Implements community assistance, peer support requests & offers,
 * responses management, status transitions, search/filtering, and privacy safeguards.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Echo standard layout chrome
  if (typeof initAppChrome === 'function') {
    initAppChrome('helphub');
  }

  const currentUser = typeof getStoredUser === 'function' ? getStoredUser() : null;
  const token = typeof getToken === 'function' ? getToken() : null;

  // Show auth-only elements if logged in
  if (token) {
    document.querySelectorAll('.auth-only').forEach((el) => {
      el.style.display = '';
    });
  }

  // ── State ────────────────────────────────────────────────────────────────
  const state = {
    category: 'all',
    scope: 'all', // 'all' | 'need_help' | 'offer_help' | 'mine' | 'my_responses'
    status: 'active',
    urgency: 'all',
    sort: 'newest',
    search: '',
    location: '',
    page: 1,
    limit: 12,
    totalPages: 1,
    currentRequestId: null,
    currentRequestData: null,
  };

  // ── DOM References ───────────────────────────────────────────────────────
  const searchInput = document.getElementById('hh-search-input');
  const locationFilter = document.getElementById('hh-location-filter');
  const statusFilter = document.getElementById('filter-status');
  const urgencyFilter = document.getElementById('filter-urgency');
  const sortFilter = document.getElementById('filter-sort');
  const btnReset = document.getElementById('btn-reset-filters');

  const catCards = document.querySelectorAll('.hh-cat-card');
  const scopeTabs = document.querySelectorAll('.hh-scope-tab');

  const feedContainer = document.getElementById('hh-requests-grid');
  const loadingEl = document.getElementById('hh-loading');
  const emptyStateEl = document.getElementById('hh-empty-state');
  const resultsCountEl = document.getElementById('hh-results-count');

  const paginationEl = document.getElementById('hh-pagination');
  const btnPrevPage = document.getElementById('btn-prev-page');
  const btnNextPage = document.getElementById('btn-next-page');
  const pageIndicator = document.getElementById('hh-page-indicator');

  // Modals
  const modalRequest = document.getElementById('modal-request');
  const formRequest = document.getElementById('form-help-request');
  const modalRequestTitle = document.getElementById('modal-request-title');
  const btnCloseRequest = document.getElementById('btn-close-request-modal');
  const btnCancelRequest = document.getElementById('btn-cancel-req-modal');
  const btnCreateRequest = document.getElementById('btn-create-request');
  const btnOfferHeader = document.getElementById('btn-offer-help-header');
  const btnEmptyCreate = document.getElementById('btn-empty-create');

  const modalDetails = document.getElementById('modal-details');
  const btnCloseDetails = document.getElementById('btn-close-details-modal');
  const btnCloseDetailsFooter = document.getElementById('btn-close-details-footer');
  const formSubmitResponse = document.getElementById('form-submit-response');

  const modalReport = document.getElementById('modal-report');
  const formReport = document.getElementById('form-report-request');
  const btnCloseReport = document.getElementById('btn-close-report-modal');
  const btnCancelReport = document.getElementById('btn-cancel-report');
  const btnOpenReport = document.getElementById('btn-open-report');
  const btnBlockAuthor = document.getElementById('btn-block-author');

  const toastContainer = document.getElementById('hh-toast-container');

  // ── Helper: Toast Notifications ──────────────────────────────────────────
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `hh-toast hh-toast--${type}`;
    toast.innerHTML = `<span>${escapeHTML(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hh-toast--leaving');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ── Helper: Escape HTML & Relative Time ──────────────────────────────────
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function timeAgo(dateString) {
    const now = new Date();
    const past = new Date(dateString);
    const diffSec = Math.floor((now - past) / 1000);

    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return past.toLocaleDateString();
  }

  function getCategoryLabel(cat) {
    const map = {
      education: '📚 Education',
      community: '🌱 Community',
      personal: '🤝 Personal Help',
      offer_help: '🎁 Offer / Resource',
    };
    return map[cat] || cat;
  }

  function getStatusClass(status) {
    const norm = (status || '').toLowerCase().replace(/\s+/g, '-');
    return `hh-status--${norm}`;
  }

  // ── Load Real Category Counts / Stats ────────────────────────────────────
  async function loadStats() {
    try {
      const res = await api('/helphub/stats', { method: 'GET' });
      if (res && res.stats) {
        const s = res.stats;
        document.getElementById('count-all').textContent = s.totalActive || 0;
        document.getElementById('count-education').textContent = s.education || 0;
        document.getElementById('count-community').textContent = s.community || 0;
        document.getElementById('count-personal').textContent = s.personal || 0;
        document.getElementById('count-offer_help').textContent = s.offer_help || 0;
      }
    } catch {
      // Gracefully retain fallback
    }
  }

  // ── Load Requests ────────────────────────────────────────────────────────
  async function loadRequests() {
    loadingEl.style.display = 'grid';
    feedContainer.style.display = 'none';
    emptyStateEl.style.display = 'none';
    paginationEl.style.display = 'none';
    resultsCountEl.textContent = 'Searching...';

    const params = new URLSearchParams();
    if (state.category !== 'all') params.append('category', state.category);
    if (state.status !== 'all') params.append('status', state.status);
    if (state.urgency !== 'all') params.append('urgency', state.urgency);
    if (state.sort) params.append('sort', state.sort);
    if (state.search.trim()) params.append('search', state.search.trim());
    if (state.location.trim()) params.append('location', state.location.trim());

    if (state.scope === 'need_help') params.append('type', 'need_help');
    else if (state.scope === 'offer_help') params.append('type', 'offer_help');
    else if (state.scope === 'mine') params.append('mine', 'true');
    else if (state.scope === 'my_responses') params.append('myResponses', 'true');

    params.append('page', state.page);
    params.append('limit', state.limit);

    try {
      const res = await api(`/helphub/requests?${params.toString()}`, { method: 'GET' });
      loadingEl.style.display = 'none';

      const requests = res.requests || [];
      const total = res.pagination?.total || 0;
      state.totalPages = res.pagination?.totalPages || 1;

      resultsCountEl.textContent = `${total} ${total === 1 ? 'request' : 'requests'} found`;

      if (requests.length === 0) {
        emptyStateEl.style.display = 'flex';
        feedContainer.innerHTML = '';
        return;
      }

      feedContainer.style.display = 'grid';
      feedContainer.innerHTML = requests.map(renderRequestCard).join('');

      // Attach card listeners
      feedContainer.querySelectorAll('.hh-request-card').forEach((card) => {
        card.addEventListener('click', (e) => {
          // If clicked on an action button, don't trigger general card open
          if (e.target.closest('button') || e.target.closest('a')) return;
          const reqId = card.dataset.id;
          openDetailsModal(reqId);
        });

        const btnView = card.querySelector('.btn-view-req');
        if (btnView) {
          btnView.addEventListener('click', () => openDetailsModal(card.dataset.id));
        }

        const btnOffer = card.querySelector('.btn-card-offer');
        if (btnOffer) {
          btnOffer.addEventListener('click', () => openDetailsModal(card.dataset.id, true));
        }
      });

      // Pagination render
      if (state.totalPages > 1) {
        paginationEl.style.display = 'flex';
        pageIndicator.textContent = `Page ${state.page} of ${state.totalPages}`;
        btnPrevPage.disabled = state.page <= 1;
        btnNextPage.disabled = state.page >= state.totalPages;
      }
    } catch (err) {
      loadingEl.style.display = 'none';
      emptyStateEl.style.display = 'flex';
      resultsCountEl.textContent = 'Error loading requests';
      showToast(err.message || 'Failed to load requests', 'danger');
    }
  }

  // ── Render Single Request Card ───────────────────────────────────────────
  function renderRequestCard(req) {
    const authorName = escapeHTML(req.author.displayName || req.author.username);
    const authorUser = escapeHTML(req.author.username);
    const authorAvatar = req.author.avatar
      ? `<img src="${req.author.avatar}" alt="${authorUser}" class="top-nav-avatar">`
      : `<div class="top-nav-avatar">${authorName.charAt(0).toUpperCase()}</div>`;

    const categoryLabel = getCategoryLabel(req.category);
    const statusClass = getStatusClass(req.status);
    const isOwner = req.isOwner;
    const isOffer = req.requestType === 'offer_help';

    const tagsHtml = (req.tags || [])
      .slice(0, 4)
      .map((t) => `<span class="hh-tag">#${escapeHTML(t)}</span>`)
      .join('');

    const locationHtml = req.generalLocation
      ? `<span class="hh-card-meta-item" title="General location">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="hh-mini-icon"><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 1.89.77 4 2.2 6.17L12 22l5.8-5.83C19.23 14 20 11.89 20 10a8 8 0 0 0-8-8z"/></svg>
          ${escapeHTML(req.generalLocation)}
        </span>`
      : '';

    return `
      <article class="hh-request-card ${isOffer ? 'hh-card--offer' : ''}" data-id="${req._id}" tabindex="0" role="button" aria-label="${escapeHTML(req.title)}">
        <header class="hh-card-header">
          <div class="hh-card-badges">
            <span class="hh-badge hh-badge--cat">${categoryLabel}</span>
            <span class="hh-badge ${statusClass}">${escapeHTML(req.status)}</span>
            <span class="hh-badge hh-badge--urgency hh-urgency--${req.urgency}">${req.urgency} urgency</span>
          </div>
          <span class="hh-card-type-indicator">${isOffer ? 'Offering Help 🌟' : 'Needs Help 🙋'}</span>
        </header>

        <h3 class="hh-card-title">${escapeHTML(req.title)}</h3>
        <p class="hh-card-snippet">${escapeHTML(req.description)}</p>

        <div class="hh-card-meta">
          ${locationHtml}
          <span class="hh-card-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="hh-mini-icon"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${timeAgo(req.createdAt)}
          </span>
        </div>

        ${tagsHtml ? `<div class="hh-card-tags">${tagsHtml}</div>` : ''}

        <footer class="hh-card-footer">
          <div class="hh-card-author">
            ${authorAvatar}
            <div class="hh-card-author-info">
              <span class="hh-card-author-name">${authorName}</span>
              <span class="hh-card-author-sub">@${authorUser}</span>
            </div>
          </div>

          <div class="hh-card-actions">
            <span class="hh-card-responses-badge" title="Responses received">
              💬 ${req.responsesCount || 0}
            </span>
            ${
              isOwner
                ? `<button class="btn btn-secondary btn-sm btn-view-req">Manage</button>`
                : ['Open', 'Responses Received'].includes(req.status)
                ? `<button class="btn btn-primary btn-sm btn-card-offer">${isOffer ? 'Connect' : 'Offer Help'}</button>`
                : `<button class="btn btn-ghost btn-sm btn-view-req">View</button>`
            }
          </div>
        </footer>
      </article>
    `;
  }

  // ── Open Create / Edit Modal ─────────────────────────────────────────────
  function openRequestModal(editData = null) {
    if (!token) {
      showToast('Please sign in to publish a help request or offer', 'warning');
      setTimeout(() => (window.location.href = '/login.html'), 1200);
      return;
    }

    formRequest.reset();
    document.getElementById('req-edit-id').value = '';

    if (editData) {
      modalRequestTitle.textContent = 'Edit Help Request';
      document.getElementById('req-edit-id').value = editData._id;
      document.getElementById('req-title').value = editData.title || '';
      document.getElementById('req-desc').value = editData.description || '';
      document.getElementById('req-category').value = editData.category || 'education';
      document.getElementById('req-urgency').value = editData.urgency || 'medium';
      document.getElementById('req-location').value = editData.generalLocation || '';
      document.getElementById('req-tags').value = (editData.tags || []).join(', ');

      const typeRadio = formRequest.querySelector(`input[name="req-type"][value="${editData.requestType || 'need_help'}"]`);
      if (typeRadio) typeRadio.checked = true;
      document.getElementById('btn-submit-req').textContent = 'Update Request';
    } else {
      modalRequestTitle.textContent = 'Create Help Request';
      document.getElementById('btn-submit-req').textContent = 'Publish Request';
    }

    modalRequest.hidden = false;
  }

  function closeRequestModal() {
    modalRequest.hidden = true;
  }

  // ── Submit Create / Edit Request ─────────────────────────────────────────
  formRequest.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('req-edit-id').value;
    const reqType = formRequest.querySelector('input[name="req-type"]:checked')?.value || 'need_help';
    const category = document.getElementById('req-category').value;
    const title = document.getElementById('req-title').value.trim();
    const description = document.getElementById('req-desc').value.trim();
    const urgency = document.getElementById('req-urgency').value;
    const generalLocation = document.getElementById('req-location').value.trim();
    const rawTags = document.getElementById('req-tags').value;
    const tags = rawTags
      ? rawTags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    const submitBtn = document.getElementById('btn-submit-req');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
      const payload = {
        title,
        description,
        category,
        requestType: reqType,
        urgency,
        generalLocation,
        tags,
      };

      if (editId) {
        await api(`/helphub/requests/${editId}`, {
          method: 'PUT',
          body: payload,
        });
        showToast('Help request updated successfully!', 'success');
      } else {
        await api('/helphub/requests', {
          method: 'POST',
          body: payload,
        });
        showToast('Help request published! Community members can now offer assistance.', 'success');
      }

      closeRequestModal();
      loadStats();
      loadRequests();
    } catch (err) {
      showToast(err.message || 'Failed to save request', 'danger');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = editId ? 'Update Request' : 'Publish Request';
    }
  });

  // ── Open Details & Responses Modal ───────────────────────────────────────
  async function openDetailsModal(requestId, focusOfferForm = false) {
    state.currentRequestId = requestId;
    modalDetails.hidden = false;

    // Reset fields to loading state
    document.getElementById('detail-title').textContent = 'Loading request details...';
    document.getElementById('detail-description').textContent = '';
    document.getElementById('detail-tags').innerHTML = '';
    document.getElementById('hh-owner-toolbar').style.display = 'none';
    document.getElementById('hh-owner-responses-list').style.display = 'none';
    document.getElementById('hh-responder-view').style.display = 'none';
    document.getElementById('hh-closed-notice').style.display = 'none';
    document.getElementById('btn-message-author').style.display = 'none';

    try {
      const res = await api(`/helphub/requests/${requestId}`, { method: 'GET' });
      const req = res.request;
      state.currentRequestData = req;

      // Populate details
      document.getElementById('detail-title').textContent = req.title;
      document.getElementById('detail-description').textContent = req.description;
      document.getElementById('detail-category-badge').textContent = getCategoryLabel(req.category);

      const statusBadge = document.getElementById('detail-status-badge');
      statusBadge.textContent = req.status;
      statusBadge.className = `hh-badge ${getStatusClass(req.status)}`;

      const urgencyBadge = document.getElementById('detail-urgency-badge');
      urgencyBadge.textContent = `${req.urgency} urgency`;
      urgencyBadge.className = `hh-badge hh-badge--urgency hh-urgency--${req.urgency}`;

      // Author snippet
      const authorName = req.author.displayName || req.author.username;
      document.getElementById('detail-author-name').textContent = authorName;
      document.getElementById('detail-author-username').textContent = `@${req.author.username}`;

      const avatarEl = document.getElementById('detail-author-avatar');
      if (req.author.avatar) {
        avatarEl.innerHTML = `<img src="${req.author.avatar}" alt="${req.author.username}" class="top-nav-avatar">`;
      } else {
        avatarEl.textContent = authorName.charAt(0).toUpperCase();
      }

      // Location & Time
      const locWrap = document.getElementById('detail-location-wrap');
      if (req.generalLocation) {
        locWrap.style.display = 'inline-flex';
        document.getElementById('detail-location').textContent = req.generalLocation;
      } else {
        locWrap.style.display = 'none';
      }
      document.getElementById('detail-time').textContent = timeAgo(req.createdAt);

      // Tags
      const tagsEl = document.getElementById('detail-tags');
      tagsEl.innerHTML = (req.tags || [])
        .map((t) => `<span class="hh-tag">#${escapeHTML(t)}</span>`)
        .join('');

      document.getElementById('detail-responses-count').textContent = req.responsesCount || 0;

      // Setup Owner vs Helper views
      const isOwner = req.isOwner;
      const isClosedOrCancelled = ['Cancelled', 'Closed', 'Completed'].includes(req.status);

      // Report & Block buttons (hide for owner)
      btnOpenReport.style.display = isOwner ? 'none' : 'inline-flex';
      btnBlockAuthor.style.display = isOwner ? 'none' : 'inline-flex';

      // Direct message button to author
      const btnMessageAuthor = document.getElementById('btn-message-author');
      if (!isOwner && currentUser) {
        btnMessageAuthor.style.display = 'inline-flex';
        btnMessageAuthor.onclick = () => {
          window.location.href = `/messages.html?user=${req.author._id}`;
        };
      } else {
        btnMessageAuthor.style.display = 'none';
      }

      if (isOwner) {
        // OWNER VIEW
        const ownerToolbar = document.getElementById('hh-owner-toolbar');
        ownerToolbar.style.display = 'flex';
        document.getElementById('detail-status-select').value = req.status;

        // Render received responses
        const responsesList = document.getElementById('hh-owner-responses-list');
        responsesList.style.display = 'block';

        const responses = req.responses || [];
        if (responses.length === 0) {
          responsesList.innerHTML = `
            <div class="hh-no-responses">
              <p>No offers or responses received yet. Community members will be able to submit assistance offers soon.</p>
            </div>
          `;
        } else {
          responsesList.innerHTML = responses
            .map((resp) => renderOwnerResponseItem(resp, req._id))
            .join('');

          // Bind response action buttons (Accept / Decline / Message)
          attachResponseActionListeners(responsesList, req._id);
        }
      } else {
        // HELPER / VISITOR VIEW
        const responderView = document.getElementById('hh-responder-view');
        responderView.style.display = 'block';

        const myRespCard = document.getElementById('hh-my-response-card');
        const offerForm = document.getElementById('form-submit-response');

        if (req.myResponse) {
          // Current user already offered help
          offerForm.style.display = 'none';
          myRespCard.style.display = 'block';

          const r = req.myResponse;
          myRespCard.innerHTML = `
            <div class="hh-my-response-box hh-my-response--${r.status}">
              <div class="hh-my-response-header">
                <strong>Your Offer Status: <span class="hh-badge hh-badge--status">${escapeHTML(r.status.toUpperCase())}</span></strong>
                <span class="hh-response-time">${timeAgo(r.createdAt)}</span>
              </div>
              <p class="hh-my-response-msg">${escapeHTML(r.message)}</p>
              ${
                r.status === 'accepted'
                  ? `<div class="hh-accepted-notice">
                      🎉 <strong>Your offer was accepted by the owner!</strong> You can coordinate privately on Echo messages.
                      <button class="btn btn-primary btn-sm btn-chat-responder" data-user="${req.author._id}">Message Owner</button>
                    </div>`
                  : r.status === 'pending'
                  ? `<button class="btn btn-ghost btn-sm btn-withdraw-offer" data-response="${r._id}">Withdraw Offer</button>`
                  : ''
              }
            </div>
          `;

          const btnChat = myRespCard.querySelector('.btn-chat-responder');
          if (btnChat) {
            btnChat.onclick = () => (window.location.href = `/messages.html?user=${req.author._id}`);
          }

          const btnWithdraw = myRespCard.querySelector('.btn-withdraw-offer');
          if (btnWithdraw) {
            btnWithdraw.onclick = async () => {
              if (!confirm('Are you sure you want to withdraw your offer to help?')) return;
              try {
                await api(`/helphub/requests/${req._id}/responses/${r._id}`, {
                  method: 'PUT',
                  body: { action: 'withdraw' },
                });
                showToast('Offer withdrawn', 'info');
                openDetailsModal(req._id);
              } catch (err) {
                showToast(err.message, 'danger');
              }
            };
          }
        } else if (isClosedOrCancelled) {
          // Closed or Cancelled
          offerForm.style.display = 'none';
          document.getElementById('hh-closed-notice').style.display = 'block';
        } else {
          // Can submit an offer
          myRespCard.style.display = 'none';
          offerForm.style.display = 'block';
          if (focusOfferForm) {
            setTimeout(() => document.getElementById('offer-message')?.focus(), 200);
          }
        }
      }
    } catch (err) {
      showToast(err.message || 'Failed to load request details', 'danger');
      closeDetailsModal();
    }
  }

  function renderOwnerResponseItem(resp, reqId) {
    const user = resp.user || {};
    const name = escapeHTML(user.displayName || user.username || 'Helper');
    const uName = escapeHTML(user.username || 'user');
    const avatar = user.avatar
      ? `<img src="${user.avatar}" alt="${uName}" class="top-nav-avatar">`
      : `<div class="top-nav-avatar">${name.charAt(0).toUpperCase()}</div>`;

    const isPending = resp.status === 'pending';
    const isAccepted = resp.status === 'accepted';

    return `
      <div class="hh-response-item hh-response--${resp.status}" data-response-id="${resp._id}">
        <div class="hh-response-header">
          <div class="hh-response-user">
            ${avatar}
            <div>
              <strong>${name}</strong>
              <span class="hh-response-username">@${uName}</span>
            </div>
          </div>
          <div class="hh-response-meta">
            <span class="hh-badge hh-badge--status">${escapeHTML(resp.status)}</span>
            <span class="hh-response-time">${timeAgo(resp.createdAt)}</span>
          </div>
        </div>

        <p class="hh-response-text">${escapeHTML(resp.message)}</p>

        <div class="hh-response-actions">
          ${
            isPending
              ? `
                <button class="btn btn-primary btn-sm btn-accept-offer" data-id="${resp._id}" data-user="${user._id}">Accept Offer</button>
                <button class="btn btn-secondary btn-sm btn-decline-offer" data-id="${resp._id}">Decline</button>
              `
              : isAccepted
              ? `
                <span class="hh-accepted-tag">✓ Accepted helper</span>
                <button class="btn btn-primary btn-sm btn-chat-helper" data-user="${user._id}">Message Helper</button>
              `
              : `<span class="hh-declined-tag">${escapeHTML(resp.status)}</span>`
          }
        </div>
      </div>
    `;
  }

  function attachResponseActionListeners(container, reqId) {
    // Accept
    container.querySelectorAll('.btn-accept-offer').forEach((btn) => {
      btn.onclick = async () => {
        const respId = btn.dataset.id;
        const helperUserId = btn.dataset.user;
        btn.disabled = true;
        btn.textContent = 'Accepting...';

        try {
          const res = await api(`/helphub/requests/${reqId}/responses/${respId}`, {
            method: 'PUT',
            body: { action: 'accept' },
          });
          showToast(res.message || 'Offer accepted!', 'success');
          openDetailsModal(reqId);
          loadRequests();
        } catch (err) {
          showToast(err.message, 'danger');
          btn.disabled = false;
          btn.textContent = 'Accept Offer';
        }
      };
    });

    // Decline
    container.querySelectorAll('.btn-decline-offer').forEach((btn) => {
      btn.onclick = async () => {
        const respId = btn.dataset.id;
        if (!confirm('Are you sure you want to decline this offer?')) return;
        btn.disabled = true;

        try {
          await api(`/helphub/requests/${reqId}/responses/${respId}`, {
            method: 'PUT',
            body: { action: 'decline' },
          });
          showToast('Offer declined', 'info');
          openDetailsModal(reqId);
        } catch (err) {
          showToast(err.message, 'danger');
          btn.disabled = false;
        }
      };
    });

    // Message helper
    container.querySelectorAll('.btn-chat-helper').forEach((btn) => {
      btn.onclick = () => {
        const helperId = btn.dataset.user;
        window.location.href = `/messages.html?user=${helperId}`;
      };
    });
  }

  function closeDetailsModal() {
    modalDetails.hidden = true;
    state.currentRequestId = null;
    state.currentRequestData = null;
  }

  // ── Submit Offer / Response Form ─────────────────────────────────────────
  formSubmitResponse.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!token) {
      showToast('Please sign in to offer assistance', 'warning');
      setTimeout(() => (window.location.href = '/login.html'), 1200);
      return;
    }

    const message = document.getElementById('offer-message').value.trim();
    if (!message) return;

    const sendBtn = document.getElementById('btn-send-offer');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    try {
      const res = await api(`/helphub/requests/${state.currentRequestId}/responses`, {
        method: 'POST',
        body: { message },
      });
      showToast(res.message || 'Your offer was sent to the owner!', 'success');
      formSubmitResponse.reset();
      openDetailsModal(state.currentRequestId);
      loadRequests();
    } catch (err) {
      showToast(err.message || 'Failed to submit response', 'danger');
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send Offer';
    }
  });

  // ── Owner Toolbar Actions ────────────────────────────────────────────────
  document.getElementById('btn-save-status').addEventListener('click', async () => {
    const newStatus = document.getElementById('detail-status-select').value;
    try {
      await api(`/helphub/requests/${state.currentRequestId}/status`, {
        method: 'PUT',
        body: { status: newStatus },
      });
      showToast(`Status updated to ${newStatus}`, 'success');
      openDetailsModal(state.currentRequestId);
      loadStats();
      loadRequests();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  document.getElementById('btn-edit-request').addEventListener('click', () => {
    const data = state.currentRequestData;
    closeDetailsModal();
    openRequestModal(data);
  });

  document.getElementById('btn-cancel-request').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to cancel this request? Cancelled requests will no longer accept responses.')) {
      return;
    }
    try {
      await api(`/helphub/requests/${state.currentRequestId}/cancel`, {
        method: 'POST',
      });
      showToast('Help request has been cancelled', 'info');
      openDetailsModal(state.currentRequestId);
      loadStats();
      loadRequests();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  // ── Report Request Modal ─────────────────────────────────────────────────
  btnOpenReport.addEventListener('click', () => {
    if (!token) {
      showToast('Please sign in to report a request', 'warning');
      return;
    }
    document.getElementById('report-req-id').value = state.currentRequestId;
    formReport.reset();
    modalReport.hidden = false;
  });

  function closeReportModal() {
    modalReport.hidden = true;
  }

  formReport.addEventListener('submit', async (e) => {
    e.preventDefault();
    const reqId = document.getElementById('report-req-id').value;
    const reason = document.getElementById('report-reason').value;
    const details = document.getElementById('report-details').value.trim();

    try {
      const res = await api(`/helphub/requests/${reqId}/report`, {
        method: 'POST',
        body: { reason, details },
      });
      showToast(res.message || 'Report submitted. Thank you for keeping Echo safe.', 'success');
      closeReportModal();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  // ── Block Author Action ──────────────────────────────────────────────────
  btnBlockAuthor.addEventListener('click', async () => {
    if (!token) {
      showToast('Please sign in to block users', 'warning');
      return;
    }
    const author = state.currentRequestData?.author;
    if (!author) return;

    if (!confirm(`Block @${author.username}? You will no longer see their requests or messages, and they will not be able to interact with you.`)) {
      return;
    }

    try {
      const res = await api(`/helphub/users/${author._id}/block`, {
        method: 'POST',
      });
      showToast(res.message || 'User blocked', 'info');
      closeDetailsModal();
      loadRequests();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  // ── Filters & Search Handlers ────────────────────────────────────────────
  // Category cards click
  catCards.forEach((card) => {
    card.addEventListener('click', () => {
      catCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      state.category = card.dataset.category;
      state.page = 1;
      loadRequests();
    });
  });

  // Scope tabs click
  scopeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      scopeTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      state.scope = tab.dataset.scope;
      state.page = 1;
      loadRequests();
    });
  });

  // Debounced search
  let searchTimeout = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.search = searchInput.value;
      state.page = 1;
      loadRequests();
    }, 350);
  });

  // Debounced location
  let locationTimeout = null;
  locationFilter.addEventListener('input', () => {
    clearTimeout(locationTimeout);
    locationTimeout = setTimeout(() => {
      state.location = locationFilter.value;
      state.page = 1;
      loadRequests();
    }, 350);
  });

  // Select dropdowns
  statusFilter.addEventListener('change', () => {
    state.status = statusFilter.value;
    state.page = 1;
    loadRequests();
  });

  urgencyFilter.addEventListener('change', () => {
    state.urgency = urgencyFilter.value;
    state.page = 1;
    loadRequests();
  });

  sortFilter.addEventListener('change', () => {
    state.sort = sortFilter.value;
    state.page = 1;
    loadRequests();
  });

  btnReset.addEventListener('click', () => {
    searchInput.value = '';
    locationFilter.value = '';
    statusFilter.value = 'active';
    urgencyFilter.value = 'all';
    sortFilter.value = 'newest';

    catCards.forEach((c) => c.classList.toggle('active', c.dataset.category === 'all'));
    scopeTabs.forEach((t) => t.classList.toggle('active', t.dataset.scope === 'all'));

    state.category = 'all';
    state.scope = 'all';
    state.status = 'active';
    state.urgency = 'all';
    state.sort = 'newest';
    state.search = '';
    state.location = '';
    state.page = 1;
    loadRequests();
  });

  // Pagination buttons
  btnPrevPage.addEventListener('click', () => {
    if (state.page > 1) {
      state.page--;
      loadRequests();
      window.scrollTo({ top: 300, behavior: 'smooth' });
    }
  });

  btnNextPage.addEventListener('click', () => {
    if (state.page < state.totalPages) {
      state.page++;
      loadRequests();
      window.scrollTo({ top: 300, behavior: 'smooth' });
    }
  });

  // Modal open / close triggers
  btnCreateRequest.addEventListener('click', () => openRequestModal());
  btnOfferHeader.addEventListener('click', () => {
    // Select offer scope and open create in offer mode
    const offerRadio = formRequest.querySelector('input[name="req-type"][value="offer_help"]');
    if (offerRadio) offerRadio.checked = true;
    openRequestModal();
  });
  btnEmptyCreate.addEventListener('click', () => openRequestModal());

  btnCloseRequest.addEventListener('click', closeRequestModal);
  btnCancelRequest.addEventListener('click', closeRequestModal);

  btnCloseDetails.addEventListener('click', closeDetailsModal);
  btnCloseDetailsFooter.addEventListener('click', closeDetailsModal);

  btnCloseReport.addEventListener('click', closeReportModal);
  btnCancelReport.addEventListener('click', closeReportModal);

  // Close modals on escape key or backdrop click
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!modalReport.hidden) closeReportModal();
      else if (!modalRequest.hidden) closeRequestModal();
      else if (!modalDetails.hidden) closeDetailsModal();
    }
  });

  [modalRequest, modalDetails, modalReport].forEach((m) => {
    m.addEventListener('click', (e) => {
      if (e.target === m) {
        m.hidden = true;
      }
    });
  });

  // Initial load
  loadStats();
  loadRequests();
});
