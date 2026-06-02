const AVAILABLE_INTERESTS = [
  'technology', 'art', 'music', 'sports', 'travel', 'food', 'fashion', 'gaming',
];

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  initAppChrome('settings');

  const accountForm = document.getElementById('account-settings-form');
  const profileForm = document.getElementById('profile-settings-form');
  const interestPicker = document.getElementById('interest-picker');

  let selectedInterests = [];
  let currentUser = null;

  await loadSettings();

  accountForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = accountForm.email.value.trim();
    const password = accountForm.password.value.trim();

    const body = { email };
    if (password) {
      body.password = password;
    }

    const btn = accountForm.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
      const data = await api('/users/account', {
        method: 'PUT',
        body,
      });
      alert('Account credentials updated successfully.');
      setStoredUser(data.user);
      accountForm.password.value = ''; // clear password field
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  profileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const displayName = profileForm.displayName.value.trim();
    const bio = profileForm.bio.value.trim();
    const avatar = profileForm.avatar.value.trim();

    const btn = profileForm.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
      const { user } = await api('/users/profile', {
        method: 'PUT',
        body: {
          displayName,
          bio,
          avatar,
          interests: selectedInterests,
        },
      });
      alert('Profile updated successfully.');
      setStoredUser(user);
      // Reload page chrome to reflect any displayName change instantly
      initAppChrome('settings');
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  async function loadSettings() {
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
      alert('Failed to load settings: ' + err.message);
    }
  }

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
        if (idx === -1) {
          selected.push(val);
        } else {
          selected.splice(idx, 1);
        }
        chip.classList.toggle('selected', selected.includes(val));
      });
    });
  }
});
