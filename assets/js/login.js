/**
 * assets/js/login.js — Rands Vibe Login Controller
 */

import { signIn, getUserRole, redirectByRole } from '../../config/auth.js';

// DOM
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const loginBtnLabel = document.getElementById('loginBtnLabel');
const authError = document.getElementById('authError');

// ========== UI HELPERS ==========
function showAuthError(message) {
  if (!authError) return;
  authError.textContent = message;
  authError.classList.add('visible');
}

function hideAuthError() {
  authError?.classList.remove('visible');
}

function setLoading(state) {
  if (!loginBtn || !loginBtnLabel) return;

  loginBtn.disabled = state;
  loginBtn.classList.toggle('loading', state);
  loginBtnLabel.textContent = state ? 'SIGNING IN...' : 'SIGN IN';
}

// ========== LOGIN ==========
async function handleLogin() {
  hideAuthError();

  const email = emailInput?.value?.trim();
  const password = passwordInput?.value;

  if (!email || !password) {
    showAuthError('Enter email and password');
    return;
  }

  setLoading(true);

  try {
    const { user, error } = await signIn(email, password);

    if (error || !user) {
      throw new Error(error || 'Login failed');
    }

    // IMPORTANT: keep your role system intact
    const { role } = await getUserRole(user.id);

    redirectByRole(role);

  } catch (err) {
    showAuthError(err.message);
  } finally {
    setLoading(false);
  }
}

// ========== EVENTS ==========
loginBtn?.addEventListener('click', handleLogin);

// FIX: Enter key only when inputs are focused
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' &&
      (document.activeElement === emailInput || document.activeElement === passwordInput)) {
    handleLogin();
  }
});
