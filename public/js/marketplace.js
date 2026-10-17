/**
 * marketplace.js — Echo Facebook-style Marketplace Client
 */

(function () {
  'use strict';

  // Global UI State
  const state = {
    filter: 'all', // 'all' | 'free' | 'saved' | 'mine'
    category: 'all',
    condition: 'all',
    minPrice: '',
    maxPrice: '',
    freeOnly: false,
    delivery: 'all',
    search: '',
    sort: 'newest',
    page: 1,
    totalPages: 1,
    currentListingId: null,
    currentListing: null,
    newPhotos: [], // Array of File objects or URL strings for creation
  };

  let currentUser = null;
  let searchDebounceTimer = null;

  // DOM Elements
  const elGrid = document.getElementById('mp-listings-grid');
  const elEmpty = document.getElementById('mp-empty-state');
  const elFeedTitle = document.getElementById('mp-feed-title');
  const elResultsCount = document.getElementById('mp-results-count');
  const elSearchInput = document.getElementById('mp-search-input');
  const elSearchClear = document.getElementById('mp-search-clear');
  const elCategoriesList = document.getElementById('mp-categories-list');
  const elQuickChips = document.getElementById('mp-quick-chips');
  const elActiveFilters = document.getElementById('mp-active-filters-chips');
  const elSortSelect = document.getElementById('mp-sort-select');
  const elPagination = document.getElementById('mp-pagination');
  const elPageIndicator = document.getElementById('mp-page-indicator');
  const elBtnPrev = document.getElementById('btn-prev-page');
  const elBtnNext = document.getElementById('btn-next-page');

  // Modals
  const modalDetailBackdrop = document.getElementById('modal-detail-backdrop');
  const modalCreateBackdrop = document.getElementById('modal-create-backdrop');
  const modalReportBackdrop = document.getElementById('modal-report-backdrop');
  const formListing = document.getElementById('form-listing');
  const formInquire = document.getElementById('form-inquire');
  const formReport = document.getElementById('form-report-listing');

  // ── Init ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    initAppChrome('marketplace');
    currentUser = getStoredUser();

    bindEvents();
    parseUrlParams();

    await Promise.all([fetchCategories(), fetchStats()]);
    await loadListings();

    // If an item ID was passed in query parameter, open it immediately
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get('item');
    if (itemId) {
      openDetailModal(itemId);
    }
  });

  function parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('filter')) state.filter = params.get('filter');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('condition')) state.condition = params.get('condition');
    if (params.get('search')) {
      state.search = params.get('search');
      if (elSearchInput) {
        elSearchInput.value = state.search;
        elSearchClear.style.display = 'block';
      }
    }
  }

  // ── Event Bindings ────────────────────────────────────────────────────────
  function bindEvents() {
    // Search input debounced
    if (elSearchInput) {
      elSearchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        elSearchClear.style.display = val ? 'block' : 'none';
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          state.search = val;
          state.page = 1;
          loadListings();
        }, 350);
      });
    }

    if (elSearchClear) {
      elSearchClear.addEventListener('click', () => {
        elSearchInput.value = '';
        elSearchClear.style.display = 'none';
        state.search = '';
        state.page = 1;
        loadListings();
      });
    }

    // Navigation Pills (Browse All, Free, Saved, Your Listings)
    const viewTabs = document.getElementById('mp-view-tabs');
    if (viewTabs) {
      viewTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.mp-nav-pill');
        if (!btn) return;
        const filter = btn.dataset.filter;

        if ((filter === 'mine' || filter === 'saved') && !requireAuth()) {
          return;
        }

        viewTabs.querySelectorAll('.mp-nav-pill').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        state.filter = filter;
        state.page = 1;

        if (filter === 'free') {
          state.freeOnly = true;
          const freeCheck = document.getElementById('mp-free-only');
          if (freeCheck) freeCheck.checked = true;
        } else if (state.freeOnly && filter !== 'free') {
          state.freeOnly = false;
          const freeCheck = document.getElementById('mp-free-only');
          if (freeCheck) freeCheck.checked = false;
        }

        updateFeedTitle();
        loadListings();
      });
    }

    // Price Filter Apply
    const btnApplyPrice = document.getElementById('btn-apply-price');
    if (btnApplyPrice) {
      btnApplyPrice.addEventListener('click', () => {
        const minVal = document.getElementById('mp-price-min').value;
        const maxVal = document.getElementById('mp-price-max').value;
        state.minPrice = minVal;
        state.maxPrice = maxVal;
        state.page = 1;
        loadListings();
      });
    }

    // Free items checkbox
    const chkFree = document.getElementById('mp-free-only');
    if (chkFree) {
      chkFree.addEventListener('change', (e) => {
        state.freeOnly = e.target.checked;
        state.page = 1;
        loadListings();
      });
    }

    // Condition Pills
    const condContainer = document.getElementById('mp-condition-pills');
    if (condContainer) {
      condContainer.addEventListener('click', (e) => {
        const pill = e.target.closest('.mp-cond-pill');
        if (!pill) return;
        condContainer.querySelectorAll('.mp-cond-pill').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        state.condition = pill.dataset.condition;
        state.page = 1;
        loadListings();
      });
    }

    // Delivery method
    const deliveryFilter = document.getElementById('mp-delivery-filter');
    if (deliveryFilter) {
      deliveryFilter.addEventListener('change', (e) => {
        state.delivery = e.target.value;
        state.page = 1;
        loadListings();
      });
    }

    // Sort Dropdown
    if (elSortSelect) {
      elSortSelect.addEventListener('change', (e) => {
        state.sort = e.target.value;
        state.page = 1;
        loadListings();
      });
    }

    // Reset Filters button
    const btnReset = document.getElementById('btn-reset-filters');
    if (btnReset) {
      btnReset.addEventListener('click', resetAllFilters);
    }
    const btnEmptyClear = document.getElementById('btn-empty-clear');
    if (btnEmptyClear) {
      btnEmptyClear.addEventListener('click', resetAllFilters);
    }

    // Pagination
    if (elBtnPrev) {
      elBtnPrev.addEventListener('click', () => {
        if (state.page > 1) {
          state.page--;
          loadListings();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    }
    if (elBtnNext) {
      elBtnNext.addEventListener('click', () => {
        if (state.page < state.totalPages) {
          state.page++;
          loadListings();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    }

    // Create Listing Modal triggers
    const btnCreate = document.getElementById('btn-create-listing');
    if (btnCreate) {
      btnCreate.addEventListener('click', () => openCreateModal());
    }
    const btnMobileSell = document.getElementById('btn-mobile-sell');
    if (btnMobileSell) {
      btnMobileSell.addEventListener('click', () => openCreateModal());
    }
    const btnEmptyCreate = document.getElementById('btn-empty-create');
    if (btnEmptyCreate) {
      btnEmptyCreate.addEventListener('click', () => openCreateModal());
    }

    // Close Modals
    document.getElementById('btn-close-detail')?.addEventListener('click', closeDetailModal);
    document.getElementById('btn-close-create')?.addEventListener('click', closeCreateModal);
    document.getElementById('btn-cancel-create')?.addEventListener('click', closeCreateModal);
    document.getElementById('btn-close-report')?.addEventListener('click', closeReportModal);
    document.getElementById('btn-cancel-report')?.addEventListener('click', closeReportModal);

    // Backdrop click close
    [modalDetailBackdrop, modalCreateBackdrop, modalReportBackdrop].forEach((backdrop) => {
      if (!backdrop) return;
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          closeDetailModal();
          closeCreateModal();
          closeReportModal();
        }
      });
    });

    // Form: Create / Edit Listing
    if (formListing) {
      formListing.addEventListener('submit', handleListingSubmit);
    }

    // Free checkbox in form
    const formIsFree = document.getElementById('listing-is-free');
    const formPrice = document.getElementById('listing-price');
    if (formIsFree && formPrice) {
      formIsFree.addEventListener('change', (e) => {
        if (e.target.checked) {
          formPrice.value = '0';
          formPrice.disabled = true;
        } else {
          formPrice.disabled = false;
          if (formPrice.value === '0') formPrice.value = '';
        }
      });
    }

    // Photo file input & dropzone
    const dropzone = document.getElementById('mp-photo-dropzone');
    const fileInput = document.getElementById('listing-file-input');
    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files?.length) {
          handleFilesSelected(e.dataTransfer.files);
        }
      });
      fileInput.addEventListener('change', (e) => {
        if (e.target.files?.length) {
          handleFilesSelected(e.target.files);
        }
      });
    }

    // Add Image URL button
    const btnAddUrl = document.getElementById('btn-add-img-url');
    const inputImgUrl = document.getElementById('listing-image-url');
    if (btnAddUrl && inputImgUrl) {
      btnAddUrl.addEventListener('click', () => {
        const url = inputImgUrl.value.trim();
        if (url) {
          state.newPhotos.push({ type: 'url', src: url });
          inputImgUrl.value = '';
          renderPhotoPreviews();
        }
      });
      inputImgUrl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          btnAddUrl.click();
        }
      });
    }

    // Detail Modal: Facebook Inquire Prompts
    document.querySelectorAll('.mp-prompt-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const textarea = document.getElementById('inquire-message');
        if (textarea) {
          textarea.value = chip.dataset.msg;
          textarea.focus();
        }
      });
    });

    // Detail Modal: Form Inquire Submit
    if (formInquire) {
      formInquire.addEventListener('submit', handleInquireSubmit);
    }

    // Detail Modal: Save / Unsave
    const btnToggleSave = document.getElementById('btn-toggle-save');
    if (btnToggleSave) {
      btnToggleSave.addEventListener('click', handleToggleSave);
    }

    // Detail Modal: Share
    const btnShare = document.getElementById('btn-share-listing');
    if (btnShare) {
      btnShare.addEventListener('click', handleShareListing);
    }

    // Detail Modal: Report
    const btnReport = document.getElementById('btn-report-listing');
    if (btnReport) {
      btnReport.addEventListener('click', () => {
        if (!requireAuth()) return;
        document.getElementById('report-listing-id').value = state.currentListingId;
        modalReportBackdrop.style.display = 'flex';
      });
    }

    // Report Form Submit
    if (formReport) {
      formReport.addEventListener('submit', handleReportSubmit);
    }

    // Detail Modal: Owner Actions
    document.getElementById('btn-update-status')?.addEventListener('click', handleOwnerStatusUpdate);
    document.getElementById('btn-edit-listing')?.addEventListener('click', () => {
      closeDetailModal();
      openCreateModal(state.currentListing);
    });
    document.getElementById('btn-delete-listing')?.addEventListener('click', handleOwnerDeleteListing);
  }

  function handleFilesSelected(files) {
    Array.from(files).forEach((file) => {
      if (/image\//.test(file.type)) {
        state.newPhotos.push({
          type: 'file',
          file,
          src: URL.createObjectURL(file),
        });
      }
    });
    renderPhotoPreviews();
  }

  function renderPhotoPreviews() {
    const previewGrid = document.getElementById('mp-photo-previews');
    if (!previewGrid) return;
    previewGrid.innerHTML = state.newPhotos
      .map(
        (p, idx) => `
        <div class="mp-photo-thumb">
          <img src="${escapeHtml(p.src)}" alt="Thumbnail preview">
          <button type="button" class="mp-photo-remove" data-idx="${idx}" title="Remove photo">&times;</button>
        </div>
      `
      )
      .join('');

    previewGrid.querySelectorAll('.mp-photo-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        state.newPhotos.splice(idx, 1);
        renderPhotoPreviews();
      });
    });
  }

  // ── Fetch Categories & Stats ──────────────────────────────────────────────
  async function fetchCategories() {
    try {
      const res = await api('/marketplace/categories', { method: 'GET' });
      if (res?.categories) {
        renderCategories(res.categories);
      }
    } catch (err) {
      console.warn('Failed to fetch categories:', err);
    }
  }

  async function fetchStats() {
    try {
      const res = await api('/marketplace/stats', { method: 'GET' });
      // Update location or stats display if helpful
    } catch (err) {
      console.warn('Failed to fetch stats:', err);
    }
  }

  function renderCategories(categories) {
    if (elCategoriesList) {
      elCategoriesList.innerHTML = `
        <li>
          <button class="mp-cat-item ${state.category === 'all' ? 'active' : ''}" data-cat="all">
            <span class="mp-cat-name">All Categories</span>
          </button>
        </li>
        ${categories
          .map(
            (c) => `
          <li>
            <button class="mp-cat-item ${state.category === c.name ? 'active' : ''}" data-cat="${escapeHtml(c.name)}">
              <span class="mp-cat-name">${escapeHtml(c.name)}</span>
              <span class="mp-cat-badge">${c.count}</span>
            </button>
          </li>
        `
          )
          .join('')}
      `;

      elCategoriesList.querySelectorAll('.mp-cat-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          elCategoriesList.querySelectorAll('.mp-cat-item').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          state.category = btn.dataset.cat;
          state.page = 1;
          syncQuickChips();
          updateFeedTitle();
          loadListings();
        });
      });
    }

    if (elQuickChips) {
      elQuickChips.innerHTML = `
        <button class="mp-quick-chip ${state.category === 'all' ? 'active' : ''}" data-cat="all">
          <span>All Items</span>
        </button>
        ${categories
          .map(
            (c) => `
          <button class="mp-quick-chip ${state.category === c.name ? 'active' : ''}" data-cat="${escapeHtml(c.name)}">
            <span>${escapeHtml(c.name)}</span>
          </button>
        `
          )
          .join('')}
      `;

      elQuickChips.querySelectorAll('.mp-quick-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          state.category = chip.dataset.cat;
          state.page = 1;
          syncCategoriesSidebar();
          syncQuickChips();
          updateFeedTitle();
          loadListings();
        });
      });
    }
  }

  function syncCategoriesSidebar() {
    if (!elCategoriesList) return;
    elCategoriesList.querySelectorAll('.mp-cat-item').forEach((b) => {
      b.classList.toggle('active', b.dataset.cat === state.category);
    });
  }

  function syncQuickChips() {
    if (!elQuickChips) return;
    elQuickChips.querySelectorAll('.mp-quick-chip').forEach((c) => {
      c.classList.toggle('active', c.dataset.cat === state.category);
    });
  }

  function updateFeedTitle() {
    if (!elFeedTitle) return;
    if (state.filter === 'mine') {
      elFeedTitle.textContent = 'Your Listings';
    } else if (state.filter === 'saved') {
      elFeedTitle.textContent = 'Saved Items';
    } else if (state.filter === 'free') {
      elFeedTitle.textContent = 'Free Items';
    } else if (state.category !== 'all') {
      elFeedTitle.textContent = state.category;
    } else if (state.search) {
      elFeedTitle.textContent = `Results for "${state.search}"`;
    } else {
      elFeedTitle.textContent = "Today's Picks";
    }
  }

  // ── Load Listings Feed ───────────────────────────────────────────────────
  async function loadListings() {
    renderSkeleton();

    const params = new URLSearchParams();
    if (state.search) params.append('search', state.search);
    if (state.category !== 'all') params.append('category', state.category);
    if (state.condition !== 'all') params.append('condition', state.condition);
    if (state.minPrice !== '') params.append('minPrice', state.minPrice);
    if (state.maxPrice !== '') params.append('maxPrice', state.maxPrice);
    if (state.freeOnly) params.append('freeOnly', 'true');
    if (state.delivery !== 'all') params.append('deliveryType', state.delivery);
    if (state.filter !== 'all') params.append('filter', state.filter);
    if (state.sort) params.append('sort', state.sort);
    params.append('page', state.page);
    params.append('limit', 24);

    try {
      const res = await api(`/marketplace/listings?${params.toString()}`, { method: 'GET' });
      if (!res || !res.listings) {
        throw new Error('Failed to load listings');
      }

      state.totalPages = res.totalPages || 1;
      renderListingsGrid(res.listings);
      renderActiveFilterChips();

      if (elResultsCount) {
        const total = res.total || 0;
        elResultsCount.textContent = `${total} ${total === 1 ? 'item' : 'items'} available`;
      }

      // Update Pagination
      if (elPagination) {
        if (state.totalPages > 1) {
          elPagination.style.display = 'flex';
          elPageIndicator.textContent = `Page ${state.page} of ${state.totalPages}`;
          elBtnPrev.disabled = state.page <= 1;
          elBtnNext.disabled = state.page >= state.totalPages;
        } else {
          elPagination.style.display = 'none';
        }
      }
    } catch (err) {
      console.error('Error loading listings:', err);
      elGrid.innerHTML = '';
      elEmpty.style.display = 'flex';
      const desc = document.getElementById('mp-empty-desc');
      if (desc) desc.textContent = 'Could not load listings. Please check your connection and try again.';
    }
  }

  function renderSkeleton() {
    if (!elGrid) return;
    elEmpty.style.display = 'none';
    elGrid.innerHTML = Array(8)
      .fill(0)
      .map(
        () => `
        <div class="mp-card-skeleton">
          <div class="mp-skel-img"></div>
          <div class="mp-skel-body">
            <div class="mp-skel-line mp-skel-price"></div>
            <div class="mp-skel-line mp-skel-title"></div>
            <div class="mp-skel-line mp-skel-sub"></div>
          </div>
        </div>
      `
      )
      .join('');
  }

  function renderListingsGrid(listings) {
    if (!elGrid) return;

    if (!listings || listings.length === 0) {
      elGrid.innerHTML = '';
      elEmpty.style.display = 'flex';
      return;
    }

    elEmpty.style.display = 'none';
    elGrid.innerHTML = listings
      .map((item) => {
        const coverImg =
          item.images && item.images.length > 0
            ? item.images[0]
            : 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80';

        const isFree = item.price === 0;
        const priceDisplay = isFree
          ? `<span class="mp-free-badge">FREE</span>`
          : `$${Number(item.price).toLocaleString()}`;

        let statusBadge = '';
        if (item.status === 'Pending') {
          statusBadge = `<div class="mp-card-status mp-status--pending">Pending</div>`;
        } else if (item.status === 'Sold') {
          statusBadge = `<div class="mp-card-status mp-status--sold">Sold</div>`;
        }

        const heartActive = item.isSaved ? 'active' : '';

        return `
        <article class="mp-card" data-id="${item._id}" tabindex="0" role="button" aria-label="${escapeHtml(item.title)}">
          <div class="mp-card-img-wrap">
            <img src="${escapeHtml(coverImg)}" alt="${escapeHtml(item.title)}" loading="lazy" class="mp-card-img">
            ${statusBadge}
            <button class="mp-card-save-btn ${heartActive}" data-id="${item._id}" aria-label="Save listing" title="Save listing">
              <svg viewBox="0 0 24 24" fill="${item.isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
            <span class="mp-card-condition-pill">${escapeHtml(item.condition || 'Good')}</span>
          </div>

          <div class="mp-card-body">
            <div class="mp-card-price">${priceDisplay}</div>
            <h3 class="mp-card-title">${escapeHtml(item.title)}</h3>
            <div class="mp-card-location">
              <span>${escapeHtml(item.location || 'Local Campus')}</span>
              <span>•</span>
              <span>${timeAgo(item.createdAt)}</span>
            </div>
          </div>
        </article>
      `;
      })
      .join('');

    // Attach card click event
    elGrid.querySelectorAll('.mp-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        // Prevent trigger if clicking the save button
        if (e.target.closest('.mp-card-save-btn')) return;
        const id = card.dataset.id;
        openDetailModal(id);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          openDetailModal(card.dataset.id);
        }
      });
    });

    // Attach card save button event
    elGrid.querySelectorAll('.mp-card-save-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!requireAuth()) return;
        const id = btn.dataset.id;
        try {
          const res = await api(`/marketplace/listings/${id}/save`, { method: 'POST' });
          if (res) {
            btn.classList.toggle('active', res.saved);
            const svg = btn.querySelector('svg');
            if (svg) svg.setAttribute('fill', res.saved ? 'currentColor' : 'none');
            showToast(res.message, res.saved ? 'success' : 'info');
          }
        } catch (err) {
          showToast(err.message, 'danger');
        }
      });
    });
  }

  function renderActiveFilterChips() {
    if (!elActiveFilters) return;
    const chips = [];

    if (state.category !== 'all') {
      chips.push({ label: `Category: ${state.category}`, clear: () => (state.category = 'all') });
    }
    if (state.condition !== 'all') {
      chips.push({ label: `Condition: ${state.condition}`, clear: () => (state.condition = 'all') });
    }
    if (state.freeOnly) {
      chips.push({ label: 'Free Only', clear: () => (state.freeOnly = false) });
    }
    if (state.minPrice || state.maxPrice) {
      const priceText = `$${state.minPrice || 0} - $${state.maxPrice || '∞'}`;
      chips.push({
        label: `Price: ${priceText}`,
        clear: () => {
          state.minPrice = '';
          state.maxPrice = '';
        },
      });
    }
    if (state.delivery !== 'all') {
      chips.push({ label: state.delivery, clear: () => (state.delivery = 'all') });
    }

    if (chips.length === 0) {
      elActiveFilters.innerHTML = '';
      return;
    }

    elActiveFilters.innerHTML = chips
      .map(
        (chip, idx) => `
        <span class="mp-active-chip">
          <span>${escapeHtml(chip.label)}</span>
          <button type="button" class="mp-chip-remove" data-idx="${idx}" aria-label="Remove filter">&times;</button>
        </span>
      `
      )
      .join('');

    elActiveFilters.querySelectorAll('.mp-chip-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        chips[idx].clear();
        state.page = 1;
        syncCategoriesSidebar();
        syncQuickChips();
        loadListings();
      });
    });
  }

  function resetAllFilters() {
    state.filter = 'all';
    state.category = 'all';
    state.condition = 'all';
    state.minPrice = '';
    state.maxPrice = '';
    state.freeOnly = false;
    state.delivery = 'all';
    state.search = '';
    state.sort = 'newest';
    state.page = 1;

    if (elSearchInput) elSearchInput.value = '';
    if (elSearchClear) elSearchClear.style.display = 'none';
    const minInput = document.getElementById('mp-price-min');
    const maxInput = document.getElementById('mp-price-max');
    const freeCheck = document.getElementById('mp-free-only');
    if (minInput) minInput.value = '';
    if (maxInput) maxInput.value = '';
    if (freeCheck) freeCheck.checked = false;

    syncCategoriesSidebar();
    syncQuickChips();
    document.querySelectorAll('.mp-nav-pill').forEach((p) => {
      p.classList.toggle('active', p.dataset.filter === 'all');
    });
    document.querySelectorAll('.mp-cond-pill').forEach((p) => {
      p.classList.toggle('active', p.dataset.condition === 'all');
    });
    if (elSortSelect) elSortSelect.value = 'newest';
    const deliveryFilter = document.getElementById('mp-delivery-filter');
    if (deliveryFilter) deliveryFilter.value = 'all';

    updateFeedTitle();
    loadListings();
  }

  // ── Detail Modal ─────────────────────────────────────────────────────────
  async function openDetailModal(id) {
    state.currentListingId = id;
    state.currentListing = null;

    // Reset fields in modal
    document.getElementById('detail-hero-img').src = '';
    document.getElementById('detail-thumbs').innerHTML = '';
    document.getElementById('detail-price').textContent = '...';
    document.getElementById('detail-title').textContent = 'Loading...';
    document.getElementById('detail-description').textContent = '';
    document.getElementById('detail-more-seller').style.display = 'none';
    document.getElementById('inquire-feedback').style.display = 'none';

    modalDetailBackdrop.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Update URL query parameter without full reload
    const url = new URL(window.location);
    url.searchParams.set('item', id);
    window.history.replaceState({}, '', url);

    try {
      const res = await api(`/marketplace/listings/${id}`, { method: 'GET' });
      if (!res || !res.listing) {
        throw new Error('Listing not found');
      }

      state.currentListing = res.listing;
      populateDetailModal(res.listing, res.moreFromSeller || []);
    } catch (err) {
      showToast(err.message || 'Could not load listing details', 'danger');
      closeDetailModal();
    }
  }

  function populateDetailModal(item, moreFromSeller) {
    const isFree = item.price === 0;
    document.getElementById('detail-price').textContent = isFree
      ? 'FREE'
      : `$${Number(item.price).toLocaleString()}`;

    document.getElementById('detail-title').textContent = item.title;
    document.getElementById('detail-category').textContent = item.category;
    document.getElementById('detail-condition').textContent = item.condition || 'Good';
    document.getElementById('detail-delivery').textContent = item.deliveryType || 'Local pickup';

    document.getElementById('detail-location-text').textContent = item.location || 'Local Campus';
    document.getElementById('detail-date').textContent = `Listed ${timeAgo(item.createdAt)}`;
    document.getElementById('detail-views').textContent = `${item.views || 0} views`;

    document.getElementById('detail-description').textContent = item.description;

    // Status Badge
    const statusBadge = document.getElementById('detail-status-badge');
    if (statusBadge) {
      statusBadge.textContent = item.status;
      statusBadge.className = `mp-hero-badge mp-status-badge--${item.status.toLowerCase()}`;
    }

    // Images & Gallery
    const images =
      item.images && item.images.length > 0
        ? item.images
        : ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80'];

    const heroImg = document.getElementById('detail-hero-img');
    heroImg.src = images[0];

    const thumbsContainer = document.getElementById('detail-thumbs');
    thumbsContainer.innerHTML = images
      .map(
        (src, idx) => `
        <button class="mp-thumb-btn ${idx === 0 ? 'active' : ''}" data-src="${escapeHtml(src)}">
          <img src="${escapeHtml(src)}" alt="Thumbnail ${idx + 1}">
        </button>
      `
      )
      .join('');

    thumbsContainer.querySelectorAll('.mp-thumb-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        thumbsContainer.querySelectorAll('.mp-thumb-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        heroImg.src = btn.dataset.src;
      });
    });

    // Seller Info
    const seller = item.seller;
    if (seller) {
      const avatarEl = document.getElementById('detail-seller-avatar');
      avatarEl.src = seller.avatar || '/images/default-avatar.svg';
      const linkEl = document.getElementById('detail-seller-link');
      linkEl.textContent = seller.displayName || seller.username;
      linkEl.href = `/profile.html?u=${encodeURIComponent(seller.username)}`;
      document.getElementById('detail-seller-joined').textContent = `Echo member since ${new Date(
        seller.memberSince || item.createdAt
      ).getFullYear()}`;
    }

    // Save Button State
    const btnSave = document.getElementById('btn-toggle-save');
    const saveText = document.getElementById('save-btn-text');
    if (btnSave && saveText) {
      btnSave.classList.toggle('active', !!item.isSaved);
      saveText.textContent = item.isSaved ? 'Saved' : 'Save Item';
      const svg = btnSave.querySelector('svg');
      if (svg) svg.setAttribute('fill', item.isSaved ? 'currentColor' : 'none');
    }

    // Owner vs Buyer Panel
    const ownerPanel = document.getElementById('mp-owner-panel');
    const inquireBox = document.getElementById('mp-inquire-box');

    if (item.isOwner) {
      ownerPanel.style.display = 'block';
      inquireBox.style.display = 'none';
      const statusSelect = document.getElementById('detail-status-select');
      if (statusSelect) statusSelect.value = item.status;
    } else {
      ownerPanel.style.display = 'none';
      inquireBox.style.display = 'block';
    }

    // More from this seller
    const moreSection = document.getElementById('detail-more-seller');
    const moreGrid = document.getElementById('detail-more-seller-grid');
    if (moreSection && moreGrid) {
      if (moreFromSeller && moreFromSeller.length > 0) {
        moreSection.style.display = 'block';
        moreGrid.innerHTML = moreFromSeller
          .map((m) => {
            const mImg = m.images?.[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300&q=80';
            return `
            <div class="mp-more-card" data-id="${m._id}" role="button" tabindex="0">
              <img src="${escapeHtml(mImg)}" alt="${escapeHtml(m.title)}">
              <div class="mp-more-info">
                <strong>$${Number(m.price).toLocaleString()}</strong>
                <span>${escapeHtml(m.title)}</span>
              </div>
            </div>
          `;
          })
          .join('');

        moreGrid.querySelectorAll('.mp-more-card').forEach((mc) => {
          mc.addEventListener('click', () => openDetailModal(mc.dataset.id));
        });
      } else {
        moreSection.style.display = 'none';
      }
    }
  }

  function closeDetailModal() {
    if (modalDetailBackdrop) modalDetailBackdrop.style.display = 'none';
    document.body.style.overflow = '';
    state.currentListingId = null;

    // Remove ?item from URL
    const url = new URL(window.location);
    url.searchParams.delete('item');
    window.history.replaceState({}, '', url);
  }

  // ── Buyer Inquire ────────────────────────────────────────────────────────
  async function handleInquireSubmit(e) {
    e.preventDefault();
    if (!requireAuth()) return;
    if (!state.currentListingId) return;

    const textarea = document.getElementById('inquire-message');
    const msg = textarea.value.trim();
    if (!msg) return;

    const btnSubmit = document.getElementById('btn-send-inquire');
    const feedback = document.getElementById('inquire-feedback');
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Sending message...';

    try {
      const res = await api(`/marketplace/listings/${state.currentListingId}/inquire`, {
        method: 'POST',
        body: { message: msg },
      });

      if (res?.success) {
        feedback.style.display = 'block';
        feedback.className = 'mp-inquire-feedback mp-feedback--success';
        feedback.innerHTML = `
          <span>✓ Message sent to seller!</span>
          <a href="/chat.html?userId=${state.currentListing.seller._id}" class="btn btn-outline btn-sm">View in Messages</a>
        `;
        showToast('Message sent to seller!', 'success');
        textarea.value = '';
      }
    } catch (err) {
      feedback.style.display = 'block';
      feedback.className = 'mp-inquire-feedback mp-feedback--error';
      feedback.textContent = err.message || 'Failed to send message';
      showToast(err.message, 'danger');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
        <span>Send Message</span>
      `;
    }
  }

  // ── Save / Unsave ────────────────────────────────────────────────────────
  async function handleToggleSave() {
    if (!requireAuth()) return;
    if (!state.currentListingId) return;

    const btnSave = document.getElementById('btn-toggle-save');
    const saveText = document.getElementById('save-btn-text');

    try {
      const res = await api(`/marketplace/listings/${state.currentListingId}/save`, {
        method: 'POST',
      });

      if (res) {
        btnSave.classList.toggle('active', res.saved);
        saveText.textContent = res.saved ? 'Saved' : 'Save Item';
        const svg = btnSave.querySelector('svg');
        if (svg) svg.setAttribute('fill', res.saved ? 'currentColor' : 'none');
        showToast(res.message, res.saved ? 'success' : 'info');

        // Also update corresponding card in grid
        const cardBtn = document.querySelector(`.mp-card-save-btn[data-id="${state.currentListingId}"]`);
        if (cardBtn) {
          cardBtn.classList.toggle('active', res.saved);
          const cSvg = cardBtn.querySelector('svg');
          if (cSvg) cSvg.setAttribute('fill', res.saved ? 'currentColor' : 'none');
        }
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // ── Share Listing ────────────────────────────────────────────────────────
  function handleShareListing() {
    if (!state.currentListingId) return;
    const shareUrl = `${window.location.origin}/marketplace.html?item=${state.currentListingId}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        showToast('Listing link copied to clipboard!', 'success');
      });
    } else {
      prompt('Copy this listing link:', shareUrl);
    }
  }

  // ── Owner Status Update ──────────────────────────────────────────────────
  async function handleOwnerStatusUpdate() {
    if (!state.currentListingId) return;
    const statusSelect = document.getElementById('detail-status-select');
    const newStatus = statusSelect.value;

    try {
      const res = await api(`/marketplace/listings/${state.currentListingId}/status`, {
        method: 'PATCH',
        body: { status: newStatus },
      });

      if (res) {
        showToast(res.message, 'success');
        const statusBadge = document.getElementById('detail-status-badge');
        if (statusBadge) {
          statusBadge.textContent = res.status;
          statusBadge.className = `mp-hero-badge mp-status-badge--${res.status.toLowerCase()}`;
        }
        loadListings();
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // ── Owner Delete Listing ─────────────────────────────────────────────────
  async function handleOwnerDeleteListing() {
    if (!state.currentListingId) return;
    if (!confirm('Are you sure you want to permanently delete this listing? This action cannot be undone.')) {
      return;
    }

    try {
      const res = await api(`/marketplace/listings/${state.currentListingId}`, {
        method: 'DELETE',
      });
      showToast(res.message || 'Listing deleted successfully', 'success');
      closeDetailModal();
      loadListings();
      fetchCategories();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // ── Create / Edit Modal ──────────────────────────────────────────────────
  function openCreateModal(listingToEdit = null) {
    if (!requireAuth()) return;

    state.newPhotos = [];
    formListing.reset();

    const titleEl = document.getElementById('modal-listing-form-title');
    const submitBtn = document.getElementById('btn-submit-listing');
    const editIdInput = document.getElementById('edit-listing-id');
    const priceInput = document.getElementById('listing-price');
    const freeCheck = document.getElementById('listing-is-free');

    if (listingToEdit) {
      titleEl.textContent = 'Edit Listing';
      submitBtn.textContent = 'Save Changes';
      editIdInput.value = listingToEdit._id;

      document.getElementById('listing-title').value = listingToEdit.title || '';
      priceInput.value = listingToEdit.price !== undefined ? listingToEdit.price : '';
      if (listingToEdit.price === 0) {
        freeCheck.checked = true;
        priceInput.disabled = true;
      }
      document.getElementById('listing-category').value = listingToEdit.category || '';
      document.getElementById('listing-condition').value = listingToEdit.condition || 'Good';
      document.getElementById('listing-delivery').value = listingToEdit.deliveryType || 'Local pickup';
      document.getElementById('listing-location').value = listingToEdit.location || '';
      document.getElementById('listing-description').value = listingToEdit.description || '';

      if (listingToEdit.images && listingToEdit.images.length > 0) {
        state.newPhotos = listingToEdit.images.map((img) => ({
          type: 'url',
          src: img,
        }));
      }
    } else {
      titleEl.textContent = 'Create New Listing';
      submitBtn.textContent = 'Publish Listing';
      editIdInput.value = '';
      priceInput.disabled = false;
      freeCheck.checked = false;
    }

    renderPhotoPreviews();
    modalCreateBackdrop.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeCreateModal() {
    if (modalCreateBackdrop) modalCreateBackdrop.style.display = 'none';
    document.body.style.overflow = '';
    state.newPhotos = [];
  }

  async function handleListingSubmit(e) {
    e.preventDefault();
    if (!requireAuth()) return;

    const editId = document.getElementById('edit-listing-id').value;
    const isEdit = Boolean(editId);

    const title = document.getElementById('listing-title').value.trim();
    const priceStr = document.getElementById('listing-price').value;
    const isFree = document.getElementById('listing-is-free').checked;
    const price = isFree ? 0 : parseFloat(priceStr);
    const category = document.getElementById('listing-category').value;
    const condition = document.getElementById('listing-condition').value;
    const deliveryType = document.getElementById('listing-delivery').value;
    const location = document.getElementById('listing-location').value.trim();
    const description = document.getElementById('listing-description').value.trim();

    if (isNaN(price) || price < 0) {
      showToast('Please enter a valid price (or check Free)', 'danger');
      return;
    }

    const submitBtn = document.getElementById('btn-submit-listing');
    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? 'Saving...' : 'Publishing...';

    // Build FormData if we have files
    const hasFiles = state.newPhotos.some((p) => p.type === 'file');
    const existingUrls = state.newPhotos.filter((p) => p.type === 'url').map((p) => p.src);

    try {
      let res;
      if (hasFiles) {
        const formData = new FormData();
        formData.append('title', title);
        formData.append('price', price);
        formData.append('category', category);
        formData.append('condition', condition);
        formData.append('deliveryType', deliveryType);
        formData.append('location', location);
        formData.append('description', description);
        formData.append('existingImages', JSON.stringify(existingUrls));

        state.newPhotos
          .filter((p) => p.type === 'file')
          .forEach((p) => {
            formData.append('images', p.file);
          });

        const token = getToken();
        const uploadRes = await fetch(
          isEdit ? `/api/marketplace/listings/${editId}` : '/api/marketplace/listings',
          {
            method: isEdit ? 'PUT' : 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          }
        );
        res = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(res.message || 'Failed to submit listing');
      } else {
        const payload = {
          title,
          price,
          category,
          condition,
          deliveryType,
          location,
          description,
          images: existingUrls,
          existingImages: existingUrls,
        };

        res = await api(
          isEdit ? `/api/marketplace/listings/${editId}` : '/api/marketplace/listings',
          {
            method: isEdit ? 'PUT' : 'POST',
            body: payload,
          }
        );
      }

      showToast(res.message || 'Listing published successfully!', 'success');
      closeCreateModal();
      await fetchCategories();
      await loadListings();

      if (res.listing?._id) {
        openDetailModal(res.listing._id);
      }
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Save Changes' : 'Publish Listing';
    }
  }

  // ── Report Modal ─────────────────────────────────────────────────────────
  function closeReportModal() {
    if (modalReportBackdrop) modalReportBackdrop.style.display = 'none';
    formReport.reset();
  }

  async function handleReportSubmit(e) {
    e.preventDefault();
    if (!requireAuth()) return;

    const id = document.getElementById('report-listing-id').value;
    const reason = document.getElementById('report-reason').value;
    const details = document.getElementById('report-details').value.trim();

    try {
      const res = await api(`/marketplace/listings/${id}/report`, {
        method: 'POST',
        body: { reason, details },
      });
      showToast(res.message || 'Listing reported', 'success');
      closeReportModal();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function showToast(msg, type = 'info') {
    const container = document.getElementById('mp-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `mp-toast mp-toast--${type}`;
    toast.textContent = msg;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('mp-toast--leaving');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function timeAgo(dateString) {
    if (!dateString) return '';
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now - past;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return past.toLocaleDateString();
  }
})();
