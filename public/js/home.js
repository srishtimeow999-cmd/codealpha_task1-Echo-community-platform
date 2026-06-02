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

  // Existing Feed DOM Elements
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

  // Top Nav & Tabs DOM Elements
  const topNavBar = document.getElementById('top-nav-bar');
  const panels = document.querySelectorAll('.tab-panel');
  const topNavAvatarEl = document.getElementById('top-nav-avatar');

  // Communities Elements
  const communitiesList = document.getElementById('communities-list');
  const trendingCommunitiesEl = document.getElementById('trending-communities');
  const recommendedCommunitiesEl = document.getElementById('recommended-communities');
  const communitySearchInput = document.getElementById('community-search-input');
  const communitySearchBtn = document.getElementById('community-search-btn');
  const communityFilters = document.getElementById('community-filters');

  // Map Elements
  const mapSearchInput = document.getElementById('map-search-input');
  const mapSearchBtn = document.getElementById('map-search-btn');
  const mapFilters = document.getElementById('map-filters');
  const mapPinsContainer = document.getElementById('map-pins-container');
  const placesList = document.getElementById('places-list');
  const activePlaceDetail = document.getElementById('active-place-detail');
  const underratedFilterBtn = document.getElementById('underrated-filter-btn');

  // Events Elements
  const eventFilters = document.getElementById('event-filters');
  const eventLayoutToggleList = document.getElementById('event-layout-toggle-list');
  const eventLayoutToggleCalendar = document.getElementById('event-layout-toggle-calendar');
  const eventsGridLayout = document.getElementById('events-grid-layout');
  const eventsCalendarLayout = document.getElementById('events-calendar-layout');
  const calendarGridCells = document.getElementById('calendar-grid-cells');
  const calendarSelectedDayEvents = document.getElementById('calendar-selected-day-events');
  const calendarMonthYear = document.getElementById('calendar-month-year');

  // Profile Elements
  const dynProfileHeader = document.getElementById('dyn-profile-header');
  const dynEditProfileForm = document.getElementById('dyn-edit-profile-form');
  const dynProfileTabContent = document.getElementById('dyn-profile-tab-content');
  const profileSubTabs = document.getElementById('profile-sub-tabs');

  // States
  let activeTab = 'feed';
  let activeCommunityFilter = 'All';
  let activeMapFilter = 'All';
  let mapUnderratedFilter = false;
  let activeEventFilter = 'All';
  let eventLayoutMode = 'grid'; // grid or calendar
  let activeProfileSubtab = 'posts';
  let selectedPlace = null;
  let ratingInputVal = 5;

  // Real Leaflet Map States
  let leafletMap = null;
  let userMarker = null;
  let mapMarkers = [];
  let userCoords = null; // { lat, lng }

  // Initialize standard structures
  initEmojiPicker();
  setupCompose();
  updateTopNavAvatar();

  // Theme slider initialization and toggle listener
  const savedTheme = localStorage.getItem('theme') || 'dark';
  const themeSwitch = document.getElementById('theme-switch');
  if (themeSwitch) {
    themeSwitch.checked = (savedTheme === 'dark');
    themeSwitch.addEventListener('change', (e) => {
      const isDark = e.target.checked;
      const nextTheme = isDark ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', nextTheme);
      localStorage.setItem('theme', nextTheme);
      logActivity(`Switched to ${nextTheme} theme`, 'profile');
    });
  }

  // Load primary feed
  await Promise.all([loadSuggested(), loadHomeFeed()]);

  // Set up tab switching listeners
  topNavBar?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.top-nav-item');
    if (!btn) return;

    const targetTab = btn.dataset.tab;
    if (targetTab === activeTab) return;

    // Toggle nav active states
    topNavBar.querySelectorAll('.top-nav-item').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');

    // Toggle panels
    panels.forEach(panel => {
      if (panel.id === `panel-${targetTab}`) {
        panel.classList.remove('hidden');
      } else {
        panel.classList.add('hidden');
      }
    });

    activeTab = targetTab;
    await triggerTabLoad(targetTab);
  });

  async function triggerTabLoad(tab) {
    if (tab === 'feed') {
      await Promise.all([loadSuggested(), loadHomeFeed()]);
    } else if (tab === 'communities') {
      await loadCommunitiesData();
    } else if (tab === 'map') {
      await loadMapData();
    } else if (tab === 'events') {
      await loadEventsData();
    } else if (tab === 'profile') {
      await loadProfileData();
    }
  }

  function updateTopNavAvatar() {
    const user = getStoredUser();
    if (topNavAvatarEl && user) {
      const name = user.displayName || user.username;
      const initials = name.charAt(0).toUpperCase();
      if (user.avatar) {
        topNavAvatarEl.innerHTML = `<img src="${escapeHtml(user.avatar)}" alt="">`;
      } else {
        topNavAvatarEl.innerHTML = initials;
      }
    }
  }

  // ==========================================================================
  // FEED SUB-CONTROLLERS & COMPOSE
  // ==========================================================================
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
        // Record Activity
        logActivity('Created a new post', 'post');
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
          logActivity(`Followed a new user`, 'follow');
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

  // ==========================================================================
  // 1. COMMUNITIES TAB CONTROLLER
  // ==========================================================================
  async function loadCommunitiesData() {
    communitiesList.innerHTML = '<p class="loading">Loading communities...</p>';
    trendingCommunitiesEl.innerHTML = '<p class="loading">...</p>';
    recommendedCommunitiesEl.innerHTML = '<p class="loading">...</p>';

    try {
      // Fetch lists in parallel
      const q = communitySearchInput.value.trim();
      let path = '/communities';
      if (q) path += `?search=${encodeURIComponent(q)}`;
      else if (activeCommunityFilter !== 'All') path += `?search=${encodeURIComponent(activeCommunityFilter)}`;

      const [commRes, trendRes, recRes] = await Promise.all([
        api(path),
        api('/communities/trending'),
        api('/communities/recommendations')
      ]);

      renderCommunitiesFeed(commRes.communities);
      renderTrendingCommunities(trendRes.communities);
      renderRecommendedCommunities(recRes.communities);
    } catch (err) {
      communitiesList.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderCommunitiesFeed(communities) {
    if (!communities.length) {
      communitiesList.innerHTML = '<div class="empty-state"><p>No communities found. Search or filter to discover more!</p></div>';
      return;
    }

    communitiesList.innerHTML = communities.map(c => {
      const updateList = c.updates && c.updates.length > 0
        ? c.updates.slice(0, 2).map(u => `
            <div class="community-update-item">
              <div class="community-update-title">${escapeHtml(u.title)}</div>
              <div class="community-update-text">${escapeHtml(u.content)}</div>
              <div class="community-update-time">${formatDate(u.createdAt)}</div>
            </div>
          `).join('')
        : '<p class="muted-text" style="font-size: 0.8rem; padding: 0.5rem 0;">No updates posted yet.</p>';

      const badgeCount = c.updates && c.updates.length > 0 ? c.updates.length : 0;
      const badgeHtml = (c.isJoined && badgeCount > 0)
        ? `<span class="badge badge-success" style="background:#10b981; color:#fff; border-radius:10px; padding:0.15rem 0.4rem; font-size:0.75rem; margin-left:0.5rem;">${badgeCount} updates</span>`
        : '';

      const btnText = c.isJoined ? 'Leave Community' : 'Join Community';
      const btnClass = c.isJoined ? 'btn-secondary' : 'btn-primary';

      // Updates Compose Form for joined members to post announcements
      const composeAnnouncementFormHtml = c.isJoined
        ? `
          <form class="community-announce-box" data-id="${c._id}" style="margin-top: 0.75rem;">
            <div class="community-updates-header" style="border:none; margin-bottom: 0.25rem;">Post an Announcement</div>
            <input type="text" placeholder="Update Title" name="title" required style="padding: 0.4rem; font-size: 0.85rem; margin-bottom: 0.5rem;">
            <textarea placeholder="Update Content" name="content" required style="padding: 0.4rem; font-size: 0.85rem; min-height: 50px; margin-bottom: 0.5rem;"></textarea>
            <button type="submit" class="btn btn-primary btn-sm" style="width: auto;">Post Announcement</button>
          </form>
          `
        : '';

      return `
        <div class="community-card" data-id="${c._id}">
          <div class="community-hero" style="background-image: url('${c.image || 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=400&q=80'}')">
            <span class="community-category-badge">${escapeHtml(c.category)}</span>
          </div>
          <div class="community-body">
            <div class="community-title-row">
              <h3>${escapeHtml(c.name)} ${badgeHtml}</h3>
              <button class="btn ${btnClass} btn-sm join-comm-btn" data-id="${c._id}" data-joined="${c.isJoined}">${btnText}</button>
            </div>
            <div class="community-members-count">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <span>${c.memberCount} members</span>
            </div>
            <p class="community-desc">${escapeHtml(c.description)}</p>
            
            <div class="community-updates-header">Updates & Bulletins</div>
            <div class="community-updates-list">
              ${updateList}
            </div>
            
            ${composeAnnouncementFormHtml}
          </div>
        </div>
      `;
    }).join('');

    bindCommunitiesInteractions();
  }

  function renderTrendingCommunities(communities) {
    if (!communities.length) {
      trendingCommunitiesEl.innerHTML = '<p class="muted-text">None found</p>';
      return;
    }
    trendingCommunitiesEl.innerHTML = communities.map(c => `
      <div class="mini-community-item" data-id="${c._id}">
        <div class="mini-community-avatar" style="background-image: url('${c.image || 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=400&q=80'}')"></div>
        <div class="mini-community-info">
          <div class="mini-community-name">${escapeHtml(c.name)}</div>
          <div class="mini-community-meta">${c.memberCount} members • ${escapeHtml(c.category)}</div>
        </div>
      </div>
    `).join('');
  }

  function renderRecommendedCommunities(communities) {
    if (!communities.length) {
      recommendedCommunitiesEl.innerHTML = '<p class="muted-text">None found</p>';
      return;
    }
    recommendedCommunitiesEl.innerHTML = communities.map(c => `
      <div class="mini-community-item" data-id="${c._id}">
        <div class="mini-community-avatar" style="background-image: url('${c.image || 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=400&q=80'}')"></div>
        <div class="mini-community-info">
          <div class="mini-community-name">${escapeHtml(c.name)}</div>
          <div class="mini-community-meta">${c.memberCount} members • ${escapeHtml(c.category)}</div>
        </div>
      </div>
    `).join('');
  }

  function bindCommunitiesInteractions() {
    // Join/Leave buttons
    communitiesList.querySelectorAll('.join-comm-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const commId = btn.dataset.id;
        const joined = btn.dataset.joined === 'true';
        const path = `/communities/${commId}/${joined ? 'leave' : 'join'}`;
        try {
          const res = await api(path, { method: 'POST' });
          alert(res.message);
          await loadCommunitiesData();
          logActivity(joined ? `Left community` : `Joined community`, 'community');
        } catch (err) {
          alert(err.message);
        }
      });
    });

    // Compose Announcement Form Submit
    communitiesList.querySelectorAll('.community-announce-box').forEach(form => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const commId = form.dataset.id;
        const title = form.title.value.trim();
        const content = form.content.value.trim();
        try {
          await api(`/communities/${commId}/updates`, {
            method: 'POST',
            body: { title, content }
          });
          form.reset();
          await loadCommunitiesData();
          logActivity(`Posted announcement in a community`, 'announcement');
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  // Filter chips in communities
  communityFilters?.addEventListener('click', async (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    communityFilters.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeCommunityFilter = chip.dataset.category;
    await loadCommunitiesData();
  });

  communitySearchBtn?.addEventListener('click', loadCommunitiesData);
  communitySearchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadCommunitiesData();
  });

  // ==========================================================================
  // 2. LOCAL MAP TAB CONTROLLER WITH LIVE GEOLOCATION & REAL MAPS
  // ==========================================================================
  
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Radius of the Earth in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function getUserLiveLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        console.warn('Geolocation not supported by this browser.');
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.warn('Geolocation error:', error.message);
          resolve(null);
        },
        { timeout: 10000, enableHighAccuracy: true }
      );
    });
  }

  function getPlaceIcon(category, isActive = false) {
    let emoji = '🏢';
    if (category === 'Cafe') emoji = '☕';
    else if (category === 'Bookstore') emoji = '📚';
    else if (category === 'Thrift store') emoji = '👕';
    else if (category === 'Artist/Creator') emoji = '🎨';
    else if (category === 'Local vendor') emoji = '🏪';

    const activeClass = isActive ? 'active' : '';

    return L.divIcon({
      className: `custom-marker ${activeClass}`,
      html: `<span>${emoji}</span>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });
  }

  function initLeafletMap(centerLat, centerLng) {
    if (leafletMap) {
      leafletMap.setView([centerLat, centerLng], 14);
      leafletMap.invalidateSize();
      return;
    }

    // Clear mock roads elements
    const mapCanvas = document.getElementById('map-canvas');
    if (mapCanvas) {
      mapCanvas.innerHTML = '';
    }

    leafletMap = L.map('map-canvas', {
      zoomControl: true,
      attributionControl: false
    }).setView([centerLat, centerLng], 14);

    // Always use light (Voyager) tiles so the map is readable in both light & dark mode
    const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    L.tileLayer(LIGHT_TILES, { maxZoom: 19 }).addTo(leafletMap);
  }

  async function loadMapData() {
    placesList.innerHTML = '<p class="loading">Loading nearby directory...</p>';
    
    try {
      if (!userCoords) {
        userCoords = await getUserLiveLocation();
      }

      const centerLat = userCoords ? userCoords.lat : 40.7128;
      const centerLng = userCoords ? userCoords.lng : -74.0060;

      initLeafletMap(centerLat, centerLng);

      // Clear old place markers
      mapMarkers.forEach(m => leafletMap.removeLayer(m));
      mapMarkers = [];

      // Render glowing user position indicator
      if (userCoords) {
        if (userMarker) leafletMap.removeLayer(userMarker);
        
        const userIcon = L.divIcon({
          className: 'custom-marker user-location-marker',
          html: '',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        
        userMarker = L.marker([userCoords.lat, userCoords.lng], { icon: userIcon })
          .addTo(leafletMap)
          .bindPopup('<b>You are here</b>');
      }

      const q = mapSearchInput.value.trim();
      let path = '/places?';
      if (q) path += `search=${encodeURIComponent(q)}&`;
      if (activeMapFilter !== 'All') path += `category=${encodeURIComponent(activeMapFilter)}&`;
      if (mapUnderratedFilter) path += 'underrated=true&';
      
      const { places } = await api(path);

      // Relative coordinates offsets (NYC central reference to allow dynamic local relative placement)
      const defaultCenter = { lat: 40.7128, lng: -74.0060 };
      const enrichedPlaces = places.map(p => {
        let lat = p.coordinates.lat || defaultCenter.lat;
        let lng = p.coordinates.lng || defaultCenter.lng;

        if (userCoords) {
          const latOffset = lat - defaultCenter.lat;
          const lngOffset = lng - defaultCenter.lng;
          lat = userCoords.lat + latOffset;
          lng = userCoords.lng + lngOffset;
          
          const rawDist = calculateDistance(userCoords.lat, userCoords.lng, lat, lng);
          p.distance = `${rawDist.toFixed(2)} miles`;
          p.rawDistance = rawDist;
        } else {
          p.distance = p.distance || '0.5 miles';
          p.rawDistance = parseFloat(p.distance);
        }

        p.adjustedCoords = { lat, lng };
        return p;
      });

      if (userCoords) {
        enrichedPlaces.sort((a, b) => a.rawDistance - b.rawDistance);
      }

      // Add enriched place markers
      enrichedPlaces.forEach(p => {
        const isSelected = selectedPlace && selectedPlace._id === p._id;
        const icon = getPlaceIcon(p.category, isSelected);
        
        const marker = L.marker([p.adjustedCoords.lat, p.adjustedCoords.lng], { icon })
          .addTo(leafletMap);

        marker.on('click', () => {
          selectPlace(p);
          highlightPlaceCard(p._id);
          
          mapMarkers.forEach(m => {
            const el = m.getElement();
            if (el) el.classList.remove('active');
          });
          const markerEl = marker.getElement();
          if (markerEl) markerEl.classList.add('active');
        });

        marker.placeId = p._id;
        mapMarkers.push(marker);
      });

      renderPlacesList(enrichedPlaces);

      if (enrichedPlaces.length > 0 && !selectedPlace) {
        selectPlace(enrichedPlaces[0]);
      } else if (selectedPlace) {
        const updated = enrichedPlaces.find(p => p._id === selectedPlace._id);
        if (updated) selectPlace(updated);
      } else {
        activePlaceDetail.innerHTML = '<div class="muted-text" style="padding: 2rem; text-align:center;">Select a place on the map or directory to see details, bookmarks, and user reviews.</div>';
      }

      setTimeout(() => {
        if (leafletMap) leafletMap.invalidateSize();
      }, 100);

    } catch (err) {
      placesList.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderPlacesList(places) {
    if (!places.length) {
      placesList.innerHTML = '<div class="empty-state"><p>No locations matching search/filters found nearby.</p></div>';
      return;
    }

    placesList.innerHTML = places.map(p => {
      const highlightedClass = (selectedPlace && selectedPlace._id === p._id) ? 'highlighted' : '';
      
      const starsHtml = '★'.repeat(Math.round(p.rating)) + '☆'.repeat(5 - Math.round(p.rating));
      
      const tagsHtml = p.tags && p.tags.length > 0
        ? p.tags.map(t => {
            let styleClass = 'tag-hidden-gem';
            if (t.toLowerCase() === 'locally loved') styleClass = 'tag-locally-loved';
            if (t.toLowerCase() === 'student favorite') styleClass = 'tag-student-favorite';
            return `<span class="recommendation-tag ${styleClass}">${escapeHtml(t)}</span>`;
          }).join('')
        : '';
        
      const underratedBadge = p.isUnderrated
        ? '<span class="recommendation-tag tag-hidden-gem" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border-color: rgba(245, 158, 11, 0.2);">💎 Underrated</span>'
        : '';

      return `
        <div class="place-card ${highlightedClass}" data-id="${p._id}">
          <div class="place-image" style="background-image: url('${p.image || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=200&q=80'}')"></div>
          <div class="place-info-col">
            <div>
              <div class="place-card-title">
                <span>${escapeHtml(p.name)}</span>
              </div>
              <div class="place-card-meta">
                <span>${escapeHtml(p.category)}</span>
                <span>•</span>
                <span>${escapeHtml(p.distance)}</span>
              </div>
            </div>
            <div class="place-rating-stars">
              <span>${starsHtml}</span>
              <span style="color: var(--text-muted); font-size: 0.75rem;">(${p.reviewsCount} reviews)</span>
            </div>
            <div class="place-tags-row">
              ${tagsHtml}
              ${underratedBadge}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Bind place card clicks
    placesList.querySelectorAll('.place-card').forEach(card => {
      card.addEventListener('click', () => {
        const placeId = card.dataset.id;
        const placeObj = places.find(p => p._id === placeId);
        if (placeObj) {
          selectPlace(placeObj);
          highlightPin(placeId);
        }
      });
    });
  }

  function selectPlace(place) {
    selectedPlace = place;
    
    const starsHtml = '★'.repeat(Math.round(place.rating)) + '☆'.repeat(5 - Math.round(place.rating));
    
    // Save button HTML
    const saveBtnText = place.isSaved ? 'Bookmarked' : 'Bookmark';
    const saveBtnClass = place.isSaved ? 'btn-secondary' : 'btn-primary';

    // Review lists
    const reviewsHtml = place.reviews && place.reviews.length > 0
      ? place.reviews.map(r => `
          <div class="place-review-item">
            <div class="place-review-author-row">
              <span>${escapeHtml(r.author)}</span>
              <span style="color:#ffb800;">${'★'.repeat(r.rating)}</span>
            </div>
            <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.3;">${escapeHtml(r.content)}</p>
          </div>
        `).join('')
      : '<p class="muted-text" style="font-size:0.85rem; padding:0.5rem 0;">No reviews yet. Be the first to leave a review!</p>';

    activePlaceDetail.innerHTML = `
      <div class="place-detail-modal">
        <div class="place-detail-header">
          <div>
            <div class="place-detail-name">${escapeHtml(place.name)}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">${escapeHtml(place.category)} • ${escapeHtml(place.distance)}</div>
          </div>
          <button class="btn ${saveBtnClass} btn-sm save-place-btn" data-id="${place._id}" data-saved="${place.isSaved}">
            <svg viewBox="0 0 24 24" fill="${place.isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            <span>${saveBtnText}</span>
          </button>
        </div>
        
        <div style="display:flex; gap:1rem; align-items:center;">
          <div class="place-rating-stars" style="font-size:1.1rem; gap:0.2rem;">
            <span>${starsHtml}</span>
            <span style="font-size: 0.9rem; color: var(--text-muted); margin-left: 0.25rem;">${place.rating} / 5</span>
          </div>
        </div>

        <img src="${place.image || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&q=80'}" style="width:100%; height:120px; object-fit:cover; border-radius:8px; border:1px solid var(--border);">

        <div>
          <h4 class="sidebar-module-title" style="font-size: 0.85rem; border-bottom:1px solid var(--border); padding-bottom:0.25rem;">User Reviews</h4>
          <div style="max-height:180px; overflow-y:auto; padding-right:0.25rem; margin-top:0.5rem;">
            ${reviewsHtml}
          </div>
        </div>

        <!-- Add Review Form -->
        <form id="place-review-compose-form" style="border-top:1px solid var(--border); padding-top:0.75rem; display:flex; flex-direction:column; gap:0.5rem;">
          <div style="font-size:0.8rem; font-weight:700; color:var(--text-muted);">Write a Review</div>
          <div class="review-stars-input">
            <button type="button" class="star-btn active" data-rating="1">★</button>
            <button type="button" class="star-btn active" data-rating="2">★</button>
            <button type="button" class="star-btn active" data-rating="3">★</button>
            <button type="button" class="star-btn active" data-rating="4">★</button>
            <button type="button" class="star-btn active" data-rating="5">★</button>
          </div>
          <div style="display:flex; gap:0.5rem;">
            <input type="text" id="review-content-input" placeholder="Share your experience..." required style="padding:0.4rem; font-size:0.85rem;">
            <button type="submit" class="btn btn-primary btn-sm" style="width:auto;">Submit</button>
          </div>
        </form>
      </div>
    `;

    bindPlaceDetailsInteractions();
  }

  function highlightPlaceCard(placeId) {
    placesList.querySelectorAll('.place-card').forEach(card => {
      if (card.dataset.id === placeId) {
        card.classList.add('highlighted');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        card.classList.remove('highlighted');
      }
    });
  }

  function highlightPin(placeId) {
    mapMarkers.forEach(m => {
      const el = m.getElement();
      if (el) {
        if (m.placeId === placeId) {
          el.classList.add('active');
          if (leafletMap) leafletMap.setView(m.getLatLng(), 14);
        } else {
          el.classList.remove('active');
        }
      }
    });
  }

  function bindPlaceDetailsInteractions() {
    const detailBox = activePlaceDetail.querySelector('.place-detail-modal');
    if (!detailBox) return;

    // Save/Bookmark toggle button
    const saveBtn = detailBox.querySelector('.save-place-btn');
    saveBtn?.addEventListener('click', async () => {
      const placeId = saveBtn.dataset.id;
      const saved = saveBtn.dataset.saved === 'true';
      const path = `/places/${placeId}/save`;
      const method = saved ? 'DELETE' : 'POST';
      try {
        await api(path, { method });
        alert(saved ? 'Removed from bookmarks' : 'Added to bookmarks!');
        await loadMapData();
        logActivity(saved ? `Unbookmarked place` : `Bookmarked local place`, 'bookmark');
      } catch (err) {
        alert(err.message);
      }
    });

    // Star rating buttons in review composer
    const starBtns = detailBox.querySelectorAll('.star-btn');
    ratingInputVal = 5; // Default reset
    starBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const rating = Number(btn.dataset.rating);
        ratingInputVal = rating;
        starBtns.forEach(b => {
          const val = Number(b.dataset.rating);
          if (val <= rating) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
      });
    });

    // Review submit form
    const reviewForm = detailBox.querySelector('#place-review-compose-form');
    reviewForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = reviewForm.querySelector('#review-content-input').value.trim();
      const placeId = selectedPlace._id;
      try {
        await api(`/places/${placeId}/review`, {
          method: 'POST',
          body: { rating: ratingInputVal, content }
        });
        alert('Review posted successfully!');
        await loadMapData();
        logActivity(`Submitted review for a place`, 'review');
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // Filter chips in map
  mapFilters?.addEventListener('click', async (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    
    if (chip.id === 'underrated-filter-btn') {
      mapUnderratedFilter = !mapUnderratedFilter;
      chip.classList.toggle('active', mapUnderratedFilter);
    } else {
      mapFilters.querySelectorAll('.filter-chip:not(#underrated-filter-btn)').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeMapFilter = chip.dataset.category;
    }
    await loadMapData();
  });

  mapSearchBtn?.addEventListener('click', loadMapData);
  mapSearchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadMapData();
  });


  // ==========================================================================
  // 3. EVENTS TAB CONTROLLER
  // ==========================================================================
  async function loadEventsData() {
    eventsGridLayout.innerHTML = '<p class="loading">Loading events...</p>';
    try {
      let path = '/events?';
      if (activeEventFilter !== 'All') {
        path += `category=${encodeURIComponent(activeEventFilter)}`;
      }
      
      const { events } = await api(path);
      
      renderEventsGrid(events);
      renderEventsCalendar(events);
    } catch (err) {
      eventsGridLayout.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderEventsGrid(events) {
    if (!events.length) {
      eventsGridLayout.innerHTML = '<div class="empty-state"><p>No upcoming events matching filters are currently scheduled.</p></div>';
      return;
    }

    eventsGridLayout.innerHTML = events.map(e => {
      const activeGoingClass = e.isGoing ? 'active-going' : '';
      const activeInterestedClass = e.isInterested ? 'active-interested' : '';

      return `
        <div class="event-card" data-id="${e._id}">
          <div class="event-banner" style="background-image: url('${e.banner || 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=400&q=80'}')">
            <span class="event-category-badge">${escapeHtml(e.category)}</span>
          </div>
          <div class="event-card-body">
            <div class="event-date-badge">${escapeHtml(e.date)}</div>
            <h3 class="event-title">${escapeHtml(e.title)}</h3>
            <div class="event-organizer">Organized by ${escapeHtml(e.organizer)}</div>
            
            <div class="event-info-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              <span>${escapeHtml(e.time)}</span>
            </div>
            <div class="event-info-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>${escapeHtml(e.location)}</span>
            </div>
            
            <p class="event-desc">${escapeHtml(e.description)}</p>
            
            <div class="event-rsvp-row">
              <div class="rsvp-pill ${activeGoingClass}" data-id="${e._id}" data-type="going">Going</div>
              <div class="rsvp-pill ${activeInterestedClass}" data-id="${e._id}" data-type="interested">Interested</div>
            </div>
            <div class="event-counters">
              <span>${e.goingCount} going</span> • <span>${e.interestedCount} interested</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    bindEventsInteractions();
  }

  function renderEventsCalendar(events) {
    // Standard mock events for May 2026. The calendar grid represents May 2026.
    // May 1, 2026 is a Friday.
    // Calendar days count for May is 31.
    // Offset starting cells: May 1 starts on Friday (index 5 in 0-indexed Sun-Sat)
    calendarGridCells.innerHTML = '';
    
    // Add Sun-Sat headers
    const daysHeader = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    daysHeader.forEach(h => {
      const el = document.createElement('div');
      el.className = 'calendar-day-header';
      el.textContent = h;
      calendarGridCells.appendChild(el);
    });

    // May 1, 2026 starts on Friday (5 empty offset slots)
    for (let i = 0; i < 5; i++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell';
      cell.style.opacity = '0.2';
      calendarGridCells.appendChild(cell);
    }

    // Generate 31 cells
    for (let day = 1; day <= 31; day++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell';
      
      const dayNum = document.createElement('span');
      dayNum.className = 'calendar-day-number';
      dayNum.textContent = day;
      cell.appendChild(dayNum);

      // Find if any events fall on this day of May 2026
      // E.g., 'May 30, 2026' or 'May 30'
      const dateStr = `May ${day < 10 ? '0' + day : day}`;
      const dayEvents = events.filter(e => e.date.toLowerCase().includes(dateStr.toLowerCase()));
      
      if (dayEvents.length > 0) {
        cell.classList.add('has-events');
        
        const dot = document.createElement('div');
        dot.className = 'calendar-event-dot';
        cell.appendChild(dot);
        
        cell.addEventListener('click', () => {
          renderSelectedDayEvents(dayEvents, dateStr);
        });
      }

      calendarGridCells.appendChild(cell);
    }
  }

  function renderSelectedDayEvents(dayEvents, dateLabel) {
    if (!dayEvents.length) {
      calendarSelectedDayEvents.innerHTML = '';
      return;
    }
    
    calendarSelectedDayEvents.innerHTML = `
      <h4 class="sidebar-module-title" style="margin-bottom:0.75rem; font-size: 0.9rem;">Events on ${dateLabel}</h4>
      <div class="event-cards-grid">
        ${dayEvents.map(e => {
          const activeGoingClass = e.isGoing ? 'active-going' : '';
          const activeInterestedClass = e.isInterested ? 'active-interested' : '';
          return `
            <div class="event-card" data-id="${e._id}">
              <div class="event-banner" style="background-image: url('${e.banner || ''}')">
                <span class="event-category-badge">${escapeHtml(e.category)}</span>
              </div>
              <div class="event-card-body">
                <h3 class="event-title" style="font-size:0.95rem;">${escapeHtml(e.title)}</h3>
                <div class="event-info-item"><span>Time: ${escapeHtml(e.time)}</span></div>
                <div class="event-info-item"><span>Loc: ${escapeHtml(e.location)}</span></div>
                <div class="event-rsvp-row" style="margin-top:0.5rem; padding-top:0.5rem;">
                  <div class="rsvp-pill ${activeGoingClass}" data-id="${e._id}" data-type="going">Going</div>
                  <div class="rsvp-pill ${activeInterestedClass}" data-id="${e._id}" data-type="interested">Interested</div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    
    // Bind RSVP listeners inside selected day panel
    calendarSelectedDayEvents.querySelectorAll('.rsvp-pill').forEach(pill => {
      pill.addEventListener('click', async () => {
        const eventId = pill.dataset.id;
        const type = pill.dataset.type;
        const isActive = pill.classList.contains('active-going') || pill.classList.contains('active-interested');
        const finalType = isActive ? 'none' : type;

        try {
          const res = await api(`/events/${eventId}/rsvp`, {
            method: 'POST',
            body: { type: finalType }
          });
          alert(res.message);
          await loadEventsData();
          // Clear selecting day events to reload
          calendarSelectedDayEvents.innerHTML = '';
          logActivity(isActive ? `Cancelled RSVP for event` : `RSVPed to event`, 'rsvp');
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  function bindEventsInteractions() {
    // RSVP Pills
    eventsGridLayout.querySelectorAll('.rsvp-pill').forEach(pill => {
      pill.addEventListener('click', async (e) => {
        e.stopPropagation();
        const eventId = pill.dataset.id;
        const type = pill.dataset.type;
        
        const isGoing = pill.classList.contains('active-going');
        const isInterested = pill.classList.contains('active-interested');
        const isActive = isGoing || isInterested;
        
        // If they click 'Going' and they are already 'Going', we send 'none' to cancel
        // If they click 'Going' and they are 'Interested', we change to 'going'
        const finalType = isActive && ((type === 'going' && isGoing) || (type === 'interested' && isInterested))
          ? 'none'
          : type;

        try {
          const res = await api(`/events/${eventId}/rsvp`, {
            method: 'POST',
            body: { type: finalType }
          });
          alert(res.message);
          await loadEventsData();
          logActivity(finalType === 'none' ? `Cancelled RSVP for event` : `RSVPed ${finalType} to event`, 'rsvp');
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  // Event category filter
  eventFilters?.addEventListener('click', async (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    eventFilters.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeEventFilter = chip.dataset.category;
    await loadEventsData();
  });

  // Layout switcher
  eventLayoutToggleList?.addEventListener('click', () => {
    eventLayoutToggleList.classList.add('active');
    eventLayoutToggleCalendar.classList.remove('active');
    eventsGridLayout.classList.remove('hidden');
    eventsCalendarLayout.classList.add('hidden');
    eventLayoutMode = 'grid';
  });

  eventLayoutToggleCalendar?.addEventListener('click', () => {
    eventLayoutToggleCalendar.classList.add('active');
    eventLayoutToggleList.classList.remove('active');
    eventsGridLayout.classList.add('hidden');
    eventsCalendarLayout.classList.remove('hidden');
    eventLayoutMode = 'calendar';
  });


  // ==========================================================================
  // 4. PROFILE TAB CONTROLLER
  // ==========================================================================
  async function loadProfileData() {
    const user = getStoredUser();
    if (!user) return;

    dynProfileHeader.innerHTML = '<p class="loading">Loading profile...</p>';
    dynProfileTabContent.innerHTML = '';
    
    try {
      const data = await api(`/users/${user.username}`);
      const fullUser = data.user;
      
      const interestTags = (fullUser.interests || [])
        .map((t) => `<span class="interest-tag">${escapeHtml(t)}</span>`)
        .join('');

      dynProfileHeader.innerHTML = `
        <div class="profile-header" style="margin-bottom:1rem;">
          ${renderAvatar(fullUser, 'profile-avatar')}
          <div class="profile-info">
            <h1>${escapeHtml(fullUser.displayName || fullUser.username)}</h1>
            <p class="username">@${escapeHtml(fullUser.username)}</p>
            <div class="profile-stats">
              <span><strong>${fullUser.followersCount}</strong> Followers</span>
              <span><strong>${fullUser.followingCount}</strong> Following</span>
            </div>
            ${interestTags ? `<div class="interest-tags" style="margin-bottom:0.5rem;">${interestTags}</div>` : ''}
            ${fullUser.bio ? `<p class="profile-bio" style="margin-bottom:0.5rem; line-height:1.4;">${escapeHtml(fullUser.bio)}</p>` : ''}
            <div class="profile-actions">
              <button class="btn btn-secondary btn-sm" id="dyn-edit-btn">Edit profile</button>
            </div>
          </div>
        </div>
      `;

      // Set up Edit Profile listener
      document.getElementById('dyn-edit-btn')?.addEventListener('click', () => {
        dynEditProfileForm.displayName.value = fullUser.displayName || '';
        dynEditProfileForm.bio.value = fullUser.bio || '';
        dynEditProfileForm.avatar.value = fullUser.avatar || '';
        dynEditProfileForm.classList.remove('hidden');
      });

      await loadProfileSubtabContent();
    } catch (err) {
      dynProfileHeader.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }

  // Cancel edit buttons
  document.getElementById('dyn-cancel-edit')?.addEventListener('click', () => {
    dynEditProfileForm.classList.add('hidden');
  });

  dynEditProfileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { user } = await api('/users/profile', {
        method: 'PUT',
        body: {
          displayName: dynEditProfileForm.displayName.value.trim(),
          bio: dynEditProfileForm.bio.value.trim(),
          avatar: dynEditProfileForm.avatar.value.trim(),
        },
      });
      setStoredUser(user);
      updateTopNavAvatar();
      dynEditProfileForm.classList.add('hidden');
      await loadProfileData();
      logActivity('Edited profile details', 'profile');
    } catch (err) {
      alert(err.message);
    }
  });

  // Profile sub-tabs clicks
  profileSubTabs?.addEventListener('click', async (e) => {
    const tab = e.target.closest('.profile-sub-tab');
    if (!tab) return;

    profileSubTabs.querySelectorAll('.profile-sub-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeProfileSubtab = tab.dataset.subtab;
    await loadProfileSubtabContent();
  });

  async function loadProfileSubtabContent() {
    const user = getStoredUser();
    if (!user) return;
    
    dynProfileTabContent.innerHTML = '<p class="loading">Loading tab content...</p>';
    
    try {
      if (activeProfileSubtab === 'posts') {
        const { posts } = await api(`/users/${user.username}/posts`);
        if (!posts.length) {
          dynProfileTabContent.innerHTML = '<div class="empty-state"><p>You haven\'t published any posts yet.</p></div>';
          return;
        }
        dynProfileTabContent.innerHTML = posts.map(renderPostCard).join('');
        bindPostInteractions(dynProfileTabContent);
      } 
      else if (activeProfileSubtab === 'saved') {
        const { places } = await api('/places/saved');
        if (!places.length) {
          dynProfileTabContent.innerHTML = '<div class="empty-state"><p>No saved bookmarks. Check the map section to save neighborhood gems!</p></div>';
          return;
        }
        dynProfileTabContent.innerHTML = `
          <h4 class="sidebar-module-title" style="font-size:0.9rem;">Saved Nearby Places</h4>
          <div class="places-list-container">
            ${places.map(p => `
              <div class="place-card" style="cursor:default;">
                <div class="place-image" style="background-image: url('${p.image}')"></div>
                <div style="flex:1;">
                  <strong>${escapeHtml(p.name)}</strong>
                  <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(p.category)} • ${escapeHtml(p.distance)}</div>
                  <div class="place-rating-stars" style="margin-top:0.25rem;">${'★'.repeat(Math.round(p.rating))}</div>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      } 
      else if (activeProfileSubtab === 'communities') {
        const { communities } = await api('/communities/joined');
        if (!communities.length) {
          dynProfileTabContent.innerHTML = '<div class="empty-state"><p>You haven\'t joined any communities yet.</p></div>';
          return;
        }
        dynProfileTabContent.innerHTML = communities.map(c => `
          <div class="community-card" style="margin-bottom: 0.75rem;">
            <div class="community-body" style="padding:1rem;">
              <h3 style="font-size:1.05rem;">${escapeHtml(c.name)}</h3>
              <div class="community-members-count">${c.memberCount} members • ${escapeHtml(c.category)}</div>
              <p class="community-desc" style="margin-top:0.25rem; font-size:0.8rem;">${escapeHtml(c.description)}</p>
            </div>
          </div>
        `).join('');
      } 
      else if (activeProfileSubtab === 'events') {
        const { events } = await api('/events/joined');
        if (!events.length) {
          dynProfileTabContent.innerHTML = '<div class="empty-state"><p>You haven\'t RSVPed to any events yet.</p></div>';
          return;
        }
        dynProfileTabContent.innerHTML = events.map(e => `
          <div class="event-card" style="margin-bottom:0.75rem;">
            <div class="event-card-body" style="padding:1rem;">
              <div class="event-date-badge" style="font-size:0.7rem;">${escapeHtml(e.date)}</div>
              <h3 style="font-size:1rem; margin-bottom:0.25rem;">${escapeHtml(e.title)}</h3>
              <div class="event-info-item"><span>Organized by ${escapeHtml(e.organizer)}</span></div>
              <div class="event-info-item"><span>Location: ${escapeHtml(e.location)}</span></div>
              <div style="font-size:0.75rem; margin-top:0.5rem; font-weight:700; color:var(--accent);">
                ${e.isGoing ? '✓ RSVP - Going' : '✓ RSVP - Interested'}
              </div>
            </div>
          </div>
        `).join('');
      } 
      else if (activeProfileSubtab === 'comments') {
        // Since we retrieve the posts feed, let's render a custom list of comments they made.
        // We'll simulate comments or query if comment models exist. 
        // Let's retrieve a few of the community or place posts comments.
        // To be solid and dynamic, let's load a timeline of activities matching user logs!
        // We will pull the activity logs representing comments made.
        const activities = getActivities().filter(a => a.type === 'comment' || a.type === 'review');
        if (!activities.length) {
          dynProfileTabContent.innerHTML = '<div class="empty-state"><p>No comments or reviews written yet.</p></div>';
          return;
        }
        
        dynProfileTabContent.innerHTML = activities.map(a => `
          <div class="profile-activity-item">
            <div class="profile-activity-icon">💬</div>
            <div class="profile-activity-text">
              <strong>You</strong> commented: <em>"${escapeHtml(a.text)}"</em>
            </div>
            <span class="profile-activity-time">${formatDate(a.timestamp)}</span>
          </div>
        `).join('');
      } 
      else if (activeProfileSubtab === 'activity') {
        const activities = getActivities();
        if (!activities.length) {
          dynProfileTabContent.innerHTML = '<div class="empty-state"><p>No activity log found yet.</p></div>';
          return;
        }

        dynProfileTabContent.innerHTML = `
          <h4 class="sidebar-module-title" style="font-size:0.9rem;">Your Chronological Timeline</h4>
          <div style="display:flex; flex-direction:column; gap:0.5rem;">
            ${activities.map(a => {
              let icon = '⚡';
              if (a.type === 'post') icon = '✍️';
              if (a.type === 'community') icon = '👥';
              if (a.type === 'bookmark') icon = '🔖';
              if (a.type === 'rsvp') icon = '📅';
              if (a.type === 'follow') icon = '👤';
              if (a.type === 'profile') icon = '⚙️';
              if (a.type === 'review') icon = '⭐';
              if (a.type === 'announcement') icon = '📣';

              return `
                <div class="profile-activity-item">
                  <div class="profile-activity-icon">${icon}</div>
                  <div class="profile-activity-text">${escapeHtml(a.text)}</div>
                  <span class="profile-activity-time">${formatDate(a.timestamp)}</span>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }
    } catch (err) {
      dynProfileTabContent.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }

  // Chronological Activity Log Helpers using localStorage to survive reloads!
  function logActivity(text, type) {
    const key = `echo_activities_${getStoredUser()?.username || 'anonymous'}`;
    const raw = localStorage.getItem(key);
    const logs = raw ? JSON.parse(raw) : [];
    logs.unshift({
      text,
      type,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem(key, JSON.stringify(logs.slice(0, 50))); // Keep last 50
  }

  function getActivities() {
    const key = `echo_activities_${getStoredUser()?.username || 'anonymous'}`;
    const raw = localStorage.getItem(key);
    const defaults = [
      { text: 'Created Echo account', type: 'profile', timestamp: new Date(Date.now() - 3600000 * 24 * 2).toISOString() },
      { text: 'Updated display avatar', type: 'profile', timestamp: new Date(Date.now() - 3600000 * 24 * 1).toISOString() }
    ];
    return raw ? JSON.parse(raw) : defaults;
  }
});
