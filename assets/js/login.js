/**
 * assets/js/login.js — Rands Vibe Login Controller (FIXED)
 */

import { signIn, getUserRole, getRoleRedirectUrl } from '../../config/auth.js';

const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const loginBtnLabel = document.getElementById('loginBtnLabel');
const authError = document.getElementById('authError');
const registerLink = document.getElementById('registerLink');

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

    const { role, error: roleError } = await getUserRole(user.id);

    if (roleError === 'NO_ROLE' || !role) {
      throw new Error('Your account is not fully configured. Please contact support.');
    }
    if (roleError) {
      throw new Error('Unable to verify account permissions. Please try again.');
    }

    const redirectUrl = getRoleRedirectUrl(role);
    if (!redirectUrl) {
      console.error('Unknown role in database:', role);
      throw new Error(`Unknown role "${role}". Please contact support.`);
    }

    console.log(`✅ Login successful, redirecting to ${redirectUrl}`);
    window.location.href = redirectUrl;
  } catch (err) {
    console.error('Login error:', err);
    showAuthError(err.message);
  } finally {
    setLoading(false);
  }
}

if (registerLink) {
  registerLink.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'register.html';
  });
}

loginBtn?.addEventListener('click', handleLogin);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' &&
      (document.activeElement === emailInput || document.activeElement === passwordInput)) {
    handleLogin();
  }
});