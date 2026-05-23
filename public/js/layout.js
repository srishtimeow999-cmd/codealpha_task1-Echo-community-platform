const NAV_ITEMS = [
  { page: 'home', href: '/home.html', label: 'Home' },
  { page: 'search', href: '/search.html', label: 'Search' },
  { page: 'messages', href: '/messages.html', label: 'Messages' },
  { page: 'profile', href: '/profile.html', label: 'Profile' },
];

function buildSidebarNav(activePage) {
  const links = NAV_ITEMS.map(
    (item) =>
      `<li><a href="${item.href}" data-page="${item.page}" class="${item.page === activePage ? 'active' : ''}">${item.label}</a></li>`
  ).join('');
  return `${links}<li><a href="#" id="logout-btn">Log out</a></li>`;
}

function initAppChrome(activePage) {
  const navLinks = document.getElementById('nav-links');
  if (navLinks) {
    navLinks.innerHTML = buildSidebarNav(activePage);
  }
  applyBrandMark();
  initSidebar(activePage);
}
