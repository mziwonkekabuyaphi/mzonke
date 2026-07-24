/**
 * assets/js/login.js — Rands Vibe Login Controller
 *
 * Auth flow:
 *   1. Authenticate with Supabase (email/password, Google, or Passkey)
 *   2. Fetch profile from `profiles` table via getProfile(user.id)
 *   3. Validate: profile exists + role is set + status === 'Active'
 *   4. If registration isn't finished yet (no wallet), finish it —
 *      see completeCustomerRegistration() in config/auth.js
 *   5. Redirect to role dashboard
 *
 * "Account not fully configured" is shown ONLY when:
 *   • profile row is NULL, OR
 *   • profile.role is NULL/empty, OR
 *   • profile.status !== 'Active'
 *
 * CHANGED (Passport Key rework): a customer who registered via WhatsApp
 * has a wallet but no password yet. Before attempting a password sign-in,
 * we check GET /api/passport-key/status?email=... — if the account exists
 * but has no Passport Key, we hand off to passport-key.js's OTP flow
 * instead of calling signIn() with whatever they typed into the password
 * field (which would just fail with a confusing "incorrect password").
 */

import {
  signIn,
  signInWithGoogle,
  signInWithPasskey,
  isPasskeySupported,
  getProfile,
  getRoleRedirectUrl,
  getSessionWithProfile,
  completeCustomerRegistration,
} from '../../config/auth.js';

import { startPassportKeySetup } from './passport-key.js';

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

// ── Passport Key status check ──────────────────────────────────────────────
/**
 * Returns { exists, hasPassportKey } for the given email, or null if the
 * check itself failed (network error etc) — callers should fall back to
 * the normal password flow in that case rather than blocking login on a
 * status-check outage.
 */
async function checkPassportKeyStatus(email) {
  try {
    const res = await fetch(`/api/passport-key/status?email=${encodeURIComponent(email)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('Passport Key status check failed:', err);
    return null;
  }
}

// ── Core post-auth handler ─────────────────────────────────────────────────
/**
 * Called after any successful Supabase auth method returns a user.
 * Fetches the profile, validates it, finishes registration if it was left
 * incomplete (e.g. an OAuth signup that never reached register.html's wallet
 * step), and redirects to the correct dashboard.
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

  // Registration started (profile exists, role/status are fine) but never
  // finished — no wallet yet. Finish it here rather than bouncing the user
  // to register.html, whose form assumes a fresh email/password signup.
  if (profile.role === 'customer' && !profile.registration_complete) {
    const { error: completeError } = await completeCustomerRegistration(profile);
    if (completeError) {
      throw new Error('Almost there — we could not finish setting up your wallet. Please try again in a moment.');
    }
  }

  // Unrecognised role (shouldn't happen, but guard anyway)
  const redirectUrl = getRoleRedirectUrl(profile.role);
  if (!redirectUrl) {
    throw new Error(`Unknown role "${profile.role}". Please contact Rands support team at info@rands.co.za.`);
  }

  console.log(`✅ Login complete — role: ${profile.role} → ${redirectUrl}`);
  window.location.href = redirectUrl;
}

// Exposed so the inline OAuth-callback handler in login.html (which waits
// for window.finishLogin) can actually find it — it was previously calling
// a name that was never attached to window, so that handler was dead code.
window.finishLogin = finishLogin;

// ── EMAIL / PASSWORD ───────────────────────────────────────────────────────
async function handleLogin() {
  hideAuthError();

  const email    = emailInput?.value?.trim();
  const password = passwordInput?.value;

  if (!email) {
    showAuthError('Enter your email address.');
    return;
  }

  setLoading(true, loginBtn, loginBtnLabel, 'OPENING RANDS VIBES…', 'UNGENILE');

  try {
    // Check Passport Key status before touching Supabase auth at all — a
    // WhatsApp-registered customer with no password yet should never see
    // "incorrect email or password" for a password they were never asked
    // to set. If the check itself fails, fall through to the normal flow
    // so a status-endpoint outage doesn't block existing users.
    const status = await checkPassportKeyStatus(email);

    if (status?.exists && !status.hasPassportKey) {
      setLoading(false, loginBtn, loginBtnLabel, 'OPENING RANDS VIBES…', 'UNGENILE');
      startPassportKeySetup(email);
      return;
    }

    if (!password) {
      showAuthError('Enter your passport key.');
      return;
    }

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

// ── Handle return from an OAuth redirect (e.g. Google) ─────────────────────
// signInWithGoogle() sends the browser to Google, which redirects back here
// with the session tokens appended as a URL fragment (#access_token=...).
// The Supabase client consumes that fragment and establishes a session
// automatically. This runs once on load and finishes the login the same way
// handleLogin()/handlePasskeyLogin() do — including completing registration
// (wallet creation) if this session belongs to a profile that was created by
// the DB trigger but never finished register.html's activation step.
(async () => {
  const result = await getSessionWithProfile();
  if (!result) return; // no session yet — normal case, let the user log in

  const { profile } = result;

  if (profile.status !== 'Active') {
    showAuthError('Your account is inactive. Please contact support team at info@rands.co.za.');
    return;
  }

  if (profile.role === 'customer' && !profile.registration_complete) {
    const { error: completeError } = await completeCustomerRegistration(profile);
    if (completeError) {
      showAuthError('Almost there — we could not finish setting up your wallet. Please try again in a moment.');
      return;
    }
  }

  const redirectUrl = getRoleRedirectUrl(profile.role);
  if (!redirectUrl) {
    showAuthError(`Unknown role "${profile.role}". Please contact Rands support team at info@rands.co.za.`);
    return;
  }

  console.log(`✅ Existing session found on load — role: ${profile.role} → ${redirectUrl}`);
  window.location.href = redirectUrl;
})();

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
