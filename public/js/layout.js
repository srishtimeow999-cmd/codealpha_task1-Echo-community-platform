// Initialize theme on script load
(function() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
})();

const NAV_ITEMS = [
  {
    page: 'home',
    href: '/home.html',
    label: 'Home',
    icon: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
  },
  {
    page: 'search',
    href: '/search.html',
    label: 'Search',
    icon: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
  },
  {
    page: 'notifications',
    href: '/notifications.html',
    label: 'Notifications',
    icon: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`
  },
  {
    page: 'messages',
    href: '/messages.html',
    label: 'Message',
    icon: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
  },
  {
    page: 'marketplace',
    href: '/marketplace.html',
    label: 'Marketplace',
    icon: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/></svg>`
  }
];

function buildSidebarNav(activePage) {
  return NAV_ITEMS.map(
    (item) =>
      `<li><a href="${item.href}" data-page="${item.page}" class="${item.page === activePage ? 'active' : ''}">${item.icon}<span>${item.label}</span></a></li>`
  ).join('');
}

function initAppChrome(activePage) {
  const navLinks = document.getElementById('nav-links');
  if (navLinks) {
    navLinks.innerHTML = buildSidebarNav(activePage);
  }

  // Inject sidebar-bottom dynamically
  const sidebar = document.getElementById('sidebar');
  if (sidebar && !document.getElementById('sidebar-bottom')) {
    const bottomDiv = document.createElement('div');
    bottomDiv.id = 'sidebar-bottom';
    bottomDiv.className = 'sidebar-bottom';
    bottomDiv.innerHTML = `
      <ul class="bottom-links">
        <li class="settings-nav-wrapper">
          <a href="/settings.html" data-page="settings" class="${activePage === 'settings' ? 'active' : ''}" id="settings-btn" title="Settings" aria-haspopup="true">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span>Settings</span>
            <span class="settings-nav-badge" aria-hidden="true">▾</span>
          </a>
          <div class="settings-hover-menu" id="settings-hover-menu" role="menu" aria-label="Settings quick options">
            <a href="/settings.html#profile" class="settings-hover-item" role="menuitem" data-tab-target="profile">
              <span class="settings-hover-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </span>
              <div class="settings-hover-text">
                <span class="settings-hover-title">Edit Profile</span>
                <span class="settings-hover-desc">Name, bio, avatar & credentials</span>
              </div>
            </a>
            <a href="/settings.html#footprints" class="settings-hover-item" role="menuitem" data-tab-target="footprints">
              <span class="settings-hover-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
              </span>
              <div class="settings-hover-text">
                <span class="settings-hover-title">Check Footprints</span>
                <span class="settings-hover-desc">Activity stats, privacy & security</span>
              </div>
            </a>
            <a href="/settings.html#saved" class="settings-hover-item" role="menuitem" data-tab-target="saved">
              <span class="settings-hover-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              </span>
              <div class="settings-hover-text">
                <span class="settings-hover-title">Saved Posts</span>
                <span class="settings-hover-desc">Your bookmarked posts & media</span>
              </div>
            </a>
          </div>
        </li>
        <li>
          <a href="#" id="logout-btn">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span>Log out</span>
          </a>
        </li>
      </ul>
    `;
    const navUser = document.getElementById('nav-user');
    if (navUser) {
      sidebar.insertBefore(bottomDiv, navUser);
    } else {
      sidebar.appendChild(bottomDiv);
    }
  }

  applyBrandMark();
  initSidebar(activePage);
}
