/**
 * assets/js/login.js — Rands Vibe Login Controller
 *
 * Auth flow:
 *   1. Authenticate with Supabase (email/password, Google, or Passkey)
 *   2. Fetch profile from `profiles` table via getProfile(user.id)
 *   3. Validate: profile exists + role is set + status === 'Active'
 *   4. Redirect to role dashboard
 *
 * "Account not fully configured" is shown ONLY when:
 *   • profile row is NULL, OR
 *   • profile.role is NULL/empty, OR
 *   • profile.status !== 'Active'
 */

import {
  signIn,
  signInWithGoogle,
  signInWithPasskey,
  isPasskeySupported,
  getProfile,
  getRoleRedirectUrl,
} from '../../config/auth.js';

// ── DOM elements ───────────────────────────────────────────────────────────
const emailInput  = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn      = document.getElementById('loginBtn');
const loginBtnLabel = document.getElementById('loginBtnLabel');
const authError     = document.getElementById('authError');
const registerLink  = document.getElementById('registerLink');

const googleBtn   = document.getElementById('googleBtn');
const passkeyBtn  = document.getElementById('passkeyBtn');
const passkeyWrap = document.getElementById('passkeyWrap');

const togglePw   = document.getElementById('togglePw');
const eyeIcon    = document.getElementById('eyeIcon');
const eyeOffIcon = document.getElementById('eyeOffIcon');

// ── Error display helpers ──────────────────────────────────────────────────
function showAuthError(message) {
  if (!authError) return;
  authError.textContent = message;
  authError.classList.add('visible');
}

function hideAuthError() {
  authError?.classList.remove('visible');
}

// ── Button loading state ───────────────────────────────────────────────────
function setLoading(state, btn, labelEl, loadingText, defaultText) {
  if (!btn || !labelEl) return;
  btn.disabled = state;
  btn.classList.toggle('loading', state);
  labelEl.textContent = state ? loadingText : defaultText;
}

// ── Core post-auth handler ─────────────────────────────────────────────────
/**
 * Called after any successful Supabase auth method returns a user.
 * Fetches the profile, validates it, and redirects to the correct dashboard.
 * Throws a user-friendly Error on any failure so callers can show authError.
 */
async function finishLogin(user) {
  const { profile, error } = await getProfile(user.id);

  // Profile row missing entirely
  if (error === 'NO_PROFILE') {
    throw new Error('Your account is not fully configured. Please contact support team at info@rands.co.za.');
  }

  // Profile exists but role column is null/empty
  if (error === 'NO_ROLE') {
    throw new Error('Your account has no role assigned. Please contact support team at info@rands.co.za.');
  }

  // Unexpected DB / network error — don't expose internals
  if (error) {
    console.error('Profile fetch error during login:', error);
    throw new Error('Unable to verify your account. Please try again.');
  }

  // Account inactive
  if (profile.status !== 'Active') {
    throw new Error('Your account is inactive. Please contact support team at info@rands.co.za.');
  }

  // Unrecognised role (shouldn't happen, but guard anyway)
  const redirectUrl = getRoleRedirectUrl(profile.role);
  if (!redirectUrl) {
    throw new Error(`Unknown role "${profile.role}". Please contact Rands support team at info@rands.co.za.`);
  }

  console.log(`✅ Login complete — role: ${profile.role} → ${redirectUrl}`);
  window.location.href = redirectUrl;
}

// ── EMAIL / PASSWORD ───────────────────────────────────────────────────────
async function handleLogin() {
  hideAuthError();

  const email    = emailInput?.value?.trim();
  const password = passwordInput?.value;

  if (!email || !password) {
    showAuthError('Enter your email and passport key.');
    return;
  }

  setLoading(true, loginBtn, loginBtnLabel, 'OPENING RANDS VIBES…', 'UNGENILE');

  try {
    const { user, error } = await signIn(email, password);
    if (error || !user) throw new Error(error || 'Login failed. Please try again.');
    await finishLogin(user);
  } catch (err) {
    console.error('Login error:', err);
    showAuthError(err.message);
  } finally {
    setLoading(false, loginBtn, loginBtnLabel, 'OPENING RANDS VIBES…', 'UNGENILE');
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
    if (error || !user) throw new Error(error || 'Passkey sign-in failed.');
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

registerLink?.addEventListener('click', (e) => {
  e.preventDefault();
  window.location.href = 'register.html';
});

googleBtn?.addEventListener('click', handleGoogleLogin);
passkeyBtn?.addEventListener('click', handlePasskeyLogin);

// ── Show passkey button only when device supports it ───────────────────────
(async () => {
  if (passkeyWrap) {
    const supported = await isPasskeySupported();
    passkeyWrap.style.display = supported ? '' : 'none';
  }
})();

// ── Password visibility toggle ─────────────────────────────────────────────
togglePw?.addEventListener('click', () => {
  const isHidden = passwordInput?.type === 'password';
  if (passwordInput)  passwordInput.type       = isHidden ? 'text' : 'password';
  if (eyeIcon)        eyeIcon.style.display    = isHidden ? 'none' : '';
  if (eyeOffIcon)     eyeOffIcon.style.display = isHidden ? '' : 'none';
});
