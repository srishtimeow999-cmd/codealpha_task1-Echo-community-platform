const API_BASE = '/api';
const BRAND_NAME = 'Echo';

function applyBrandMark() {
  document.querySelectorAll('.logo').forEach((el) => {
    if (el.dataset.echoBuilt) return;
    el.dataset.echoBuilt = '1';
    el.setAttribute('aria-label', BRAND_NAME);
    el.classList.add('echo-logo');
    el.innerHTML = [...BRAND_NAME]
      .map((ch, i) => `<span class="logo-letter" style="--i:${i}">${ch}</span>`)
      .join('');
  });
}

function getToken() {
  return localStorage.getItem('link_token');
}

function setToken(token) {
  localStorage.setItem('link_token', token);
}

function clearToken() {
  localStorage.removeItem('link_token');
  localStorage.removeItem('link_user');
}

function getStoredUser() {
  const raw = localStorage.getItem('link_user');
  return raw ? JSON.parse(raw) : null;
}

function setStoredUser(user) {
  localStorage.setItem('link_user', JSON.stringify(user));
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

function redirectIfAuthed() {
  if (getToken()) {
    window.location.href = '/home.html';
  }
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && !path.includes('/auth/login')) {
    clearToken();
    window.location.href = '/login.html';
    throw new Error(data.message || 'Session expired');
  }

  if (!res.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

async function apiUpload(path, formData) {
  const headers = {};
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login.html';
    throw new Error(data.message || 'Session expired');
  }

  if (!res.ok) {
    throw new Error(data.message || 'Upload failed');
  }

  return data;
}

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

function avatarInitials(name) {
  return (name || '?').charAt(0).toUpperCase();
}

function renderAvatar(user, sizeClass = '') {
  const name = user.displayName || user.username;
  const letter = avatarInitials(name);
  if (user.avatar) {
    return `<div class="avatar ${sizeClass}"><img src="${escapeHtml(user.avatar)}" alt=""></div>`;
  }
  return `<div class="avatar ${sizeClass}">${letter}</div>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function initSidebar(activePage) {
  const user = getStoredUser();
  const navUser = document.getElementById('nav-user');
  if (navUser && user) {
    navUser.innerHTML = `<strong>${escapeHtml(user.displayName || user.username)}</strong><span>@${escapeHtml(user.username)}</span>`;
  }

  document.querySelectorAll('.nav-links a').forEach((a) => {
    a.classList.toggle('active', a.dataset.page === activePage);
  });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      clearToken();
      window.location.href = '/login.html';
    });
  }

  const menuToggle = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');

  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay?.classList.toggle('visible');
    });
  }
  overlay?.addEventListener('click', () => {
    sidebar?.classList.remove('open');
    overlay.classList.remove('visible');
  });
}
