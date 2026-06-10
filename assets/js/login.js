/**
 * assets/js/login.js — Rands Vibe Login Controller
 * v2 — Added: Google OAuth, Passkey sign-in
 */

import {
  signIn,
  signInWithGoogle,
  signInWithPasskey,
  isPasskeySupported,
  getUserRole,
  getRoleRedirectUrl,
} from '../../config/auth.js';

// ── Existing elements ──────────────────────────────────────────────────────
const emailInput    = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn      = document.getElementById('loginBtn');
const loginBtnLabel = document.getElementById('loginBtnLabel');
const authError     = document.getElementById('authError');
const registerLink  = document.getElementById('registerLink');

// ── New elements (injected by login.html v2) ───────────────────────────────
const googleBtn   = document.getElementById('googleBtn');
const passkeyBtn  = document.getElementById('passkeyBtn');
const passkeyWrap = document.getElementById('passkeyWrap');

// ── Helpers ────────────────────────────────────────────────────────────────
function showAuthError(message) {
  if (!authError) return;
  authError.textContent = message;
  authError.classList.add('visible');
}

function hideAuthError() {
  authError?.classList.remove('visible');
}

function setLoading(state, btn, labelEl, loadingText, defaultText) {
  if (!btn || !labelEl) return;
  btn.disabled = state;
  btn.classList.toggle('loading', state);
  labelEl.textContent = state ? loadingText : defaultText;
}

// ── Role redirect helper ───────────────────────────────────────────────────
async function finishLogin(user) {
  const { role, error: roleError } = await getUserRole(user.id);

  if (roleError === 'NO_ROLE' || !role) {
    throw new Error('Your account is not fully configured. Please contact support.');
  }
  if (roleError) {
    throw new Error('Unable to verify account permissions. Please try again.');
  }

  const redirectUrl = getRoleRedirectUrl(role);
  if (!redirectUrl) {
    throw new Error(`Unknown role "${role}". Please contact support.`);
  }

  console.log(`✅ Login successful, redirecting to ${redirectUrl}`);
  window.location.href = redirectUrl;
}

// ── EMAIL / PASSWORD ───────────────────────────────────────────────────────
async function handleLogin() {
  hideAuthError();

  const email    = emailInput?.value?.trim();
  const password = passwordInput?.value;

  if (!email || !password) {
    showAuthError('Enter email and password');
    return;
  }

  setLoading(true, loginBtn, loginBtnLabel, 'SIGNING IN…', 'SIGN IN');

  try {
    const { user, error } = await signIn(email, password);
    if (error || !user) throw new Error(error || 'Login failed');
    await finishLogin(user);
  } catch (err) {
    console.error('Login error:', err);
    showAuthError(err.message);
  } finally {
    setLoading(false, loginBtn, loginBtnLabel, 'SIGNING IN…', 'SIGN IN');
  }
}

// ── GOOGLE ─────────────────────────────────────────────────────────────────
async function handleGoogleLogin() {
  hideAuthError();

  if (!googleBtn) return;
  googleBtn.disabled = true;
  googleBtn.querySelector('.alt-btn-label').textContent = 'Opening Google…';

  try {
    const { error } = await signInWithGoogle();
    // On success Supabase immediately redirects the browser — nothing else to do.
    if (error) throw new Error(error);
  } catch (err) {
    console.error('Google login error:', err);
    showAuthError(err.message);
    googleBtn.disabled = false;
    googleBtn.querySelector('.alt-btn-label').textContent = 'Continue with Google';
  }
}

// ── PASSKEY ────────────────────────────────────────────────────────────────
async function handlePasskeyLogin() {
  hideAuthError();

  if (!passkeyBtn) return;
  passkeyBtn.disabled = true;
  passkeyBtn.querySelector('.alt-btn-label').textContent = 'Waiting for passkey…';

  try {
    const { user, error } = await signInWithPasskey();
    if (error || !user) throw new Error(error || 'Passkey sign-in failed');
    await finishLogin(user);
  } catch (err) {
    console.error('Passkey error:', err);
    showAuthError(err.message);
    passkeyBtn.disabled = false;
    passkeyBtn.querySelector('.alt-btn-label').textContent = 'Sign in with Passkey';
  }
}

// ── Event listeners ────────────────────────────────────────────────────────
loginBtn?.addEventListener('click', handleLogin);

document.addEventListener('keydown', (e) => {
  if (
    e.key === 'Enter' &&
    (document.activeElement === emailInput || document.activeElement === passwordInput)
  ) {
    handleLogin();
  }
});

if (registerLink) {
  registerLink.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'register.html';
  });
}

googleBtn?.addEventListener('click', handleGoogleLogin);
passkeyBtn?.addEventListener('click', handlePasskeyLogin);

// ── Show passkey button only if device supports it ─────────────────────────
(async () => {
  if (passkeyWrap) {
    const supported = await isPasskeySupported();
    passkeyWrap.style.display = supported ? '' : 'none';
  }
})();

// ── Password visibility toggle (existing behaviour preserved) ─────────────
const togglePw  = document.getElementById('togglePw');
const eyeIcon   = document.getElementById('eyeIcon');
const eyeOffIcon = document.getElementById('eyeOffIcon');

togglePw?.addEventListener('click', () => {
  const isHidden = passwordInput?.type === 'password';
  if (passwordInput) passwordInput.type = isHidden ? 'text' : 'password';
  if (eyeIcon)    eyeIcon.style.display    = isHidden ? 'none' : '';
  if (eyeOffIcon) eyeOffIcon.style.display = isHidden ? '' : 'none';
});
