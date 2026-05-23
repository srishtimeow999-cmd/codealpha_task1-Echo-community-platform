const AVAILABLE_INTERESTS = [
  'technology', 'art', 'music', 'sports', 'travel', 'food', 'fashion', 'gaming',
];

document.addEventListener('DOMContentLoaded', () => {
  applyBrandMark();
  const isLogin = document.body.dataset.page === 'login';
  const isSignup = document.body.dataset.page === 'signup';
  const signupInterests = [];

  if (isLogin || isSignup) {
    redirectIfAuthed();
  }

  if (isSignup) {
    const picker = document.getElementById('signup-interests');
    if (picker) {
      picker.innerHTML = AVAILABLE_INTERESTS.map(
        (i) => `<button type="button" class="interest-chip" data-interest="${i}">${i}</button>`
      ).join('');
      picker.querySelectorAll('.interest-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          const val = chip.dataset.interest;
          const idx = signupInterests.indexOf(val);
          if (idx === -1) signupInterests.push(val);
          else signupInterests.splice(idx, 1);
          chip.classList.toggle('selected', signupInterests.includes(val));
        });
      });
    }
  }

  const form = document.getElementById('auth-form');
  const alertEl = document.getElementById('alert');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertEl?.classList.add('hidden');

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
      if (isSignup) {
        const username = form.username.value.trim();
        const email = form.email.value.trim();
        const password = form.password.value;
        const displayName = form.displayName?.value.trim() || username;

        const data = await api('/auth/register', {
          method: 'POST',
          body: { username, email, password, displayName, interests: signupInterests },
        });
        setToken(data.token);
        setStoredUser(data.user);
        window.location.href = '/home.html';
      } else {
        const email = form.email.value.trim();
        const password = form.password.value;

        const data = await api('/auth/login', {
          method: 'POST',
          body: { email, password },
        });
        setToken(data.token);
        setStoredUser(data.user);
        window.location.href = '/home.html';
      }
    } catch (err) {
      if (alertEl) {
        alertEl.textContent = err.message;
        alertEl.classList.remove('hidden');
      }
    } finally {
      btn.disabled = false;
    }
  });
});
