/**
 * assets/js/login.js — Rands Vibe Login Controller
 *
 * Auth flow:
 *   1. Authenticate with Supabase (email/phone+password via Passport,
 *      Google, or Passkey)
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
 * CHANGED (Passport merge): Passport Key and Phone PIN used to be two
 * separate panels (passport-key.js / phone-pin.js), each with their own
 * status check and their own "use the other one instead" link. They're now
 * one merged flow in passport.js. This file's job shrinks to: collect
 * whatever the customer typed into the single identifier field (email OR
 * phone — detected by format inside passport.js) and hand off to
 * startPassportFlow(), which owns every subsequent step (status check,
 * password entry, OTP setup, sign-in) itself. login.js no longer runs its
 * own two-step email/password state machine or its own status check —
 * that would just be a second, competing source of truth for the same
 * decision passport.js already has to make internally.
 */

import {
  signIn,
  signInWithPhone,
  signInWithGoogle,
  signInWithPasskey,
  isPasskeySupported,
  getProfile,
  getRoleRedirectUrl,
  getSessionWithProfile,
  completeCustomerRegistration,
} from '../../config/auth.js';

import { startPassportFlow, peekPassportStatus, normalizePhone } from './passport.js';

// ── DOM elements ───────────────────────────────────────────────────────────
const emailInput    = document.getElementById('email');
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

const passwordStep          = document.getElementById('passwordStep');
const passwordStepForgotRow = document.getElementById('passwordStepForgotRow');

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
 * Fetches the profile, validates it, finishes registration if it was left
 * incomplete (e.g. an OAuth signup that never reached register.html's wallet
 * step), and redirects to the correct dashboard.
 * Throws a user-friendly Error on any failure so callers can show authError.
 */
async function finishLogin(user) {
  const { profile, error } = await getProfile(user.id);

  if (error === 'NO_PROFILE') {
    throw new Error('Your account is not fully configured. Please contact support team at info@rands.co.za.');
  }

  if (error === 'NO_ROLE') {
    throw new Error('Your account has no role assigned. Please contact support team at info@rands.co.za.');
  }

  if (error) {
    console.error('Profile fetch error during login:', error);
    throw new Error('Unable to verify your account. Please try again.');
  }

  if (profile.status !== 'Active') {
    throw new Error('Your account is inactive. Please contact support team at info@rands.co.za.');
  }

  if (profile.role === 'customer' && !profile.registration_complete) {
    const { error: completeError } = await completeCustomerRegistration(profile);
    if (completeError) {
      throw new Error('Almost there — we could not finish setting up your wallet. Please try again in a moment.');
    }
  }

  const redirectUrl = getRoleRedirectUrl(profile.role);
  if (!redirectUrl) {
    throw new Error(`Unknown role "${profile.role}". Please contact Rands support team at info@rands.co.za.`);
  }

  console.log(`✅ Login complete — role: ${profile.role} → ${redirectUrl}`);
  window.location.href = redirectUrl;
}

// Exposed so the inline OAuth-callback handler in login.html and
// passport.js's panel can both find it.
window.finishLogin = finishLogin;

// ── STEP 1: IDENTIFIER (+ optional password) ────────────────────────────────
// The email field is a generic identifier field (email or phone). Two paths
// out of it:
//
//   • Password typed  → classic direct sign-in via signIn()/signInWithPhone()
//     straight against Supabase Auth. This is the ONLY path admin and staff
//     ever use — they are not customers and have nothing to do with
//     passport.js or its customer-only /api/passport/status check. Any
//     customer who already has a Passport Key set can also just type it
//     here and skip the panel entirely.
//
//   • Password left blank → passport.js's OTP-based Passport Key flow.
//     That flow is customer-only: first-time WhatsApp signups who don't
//     have a password yet, or a customer re-entering to attach a second
//     identifier. Admin/staff should never hit this branch since they
//     always type a password.
function handleLogin() {
  hideAuthError();

  const value = emailInput?.value?.trim();
  if (!value) {
    showAuthError('Enter your mobile number or email address.');
    return;
  }

  const password = passwordInput?.value ?? '';

  if (password) {
    signInDirect(value, password);
    return;
  }

  setLoading(true, loginBtn, loginBtnLabel, 'Checking…', 'Continue');
  startPassportFlow(value);
  setLoading(false, loginBtn, loginBtnLabel, 'Checking…', 'Continue');
}

// ── Classic direct sign-in (admin, staff, and password-holding customers) ──
async function signInDirect(identifier, password) {
  setLoading(true, loginBtn, loginBtnLabel, 'Signing in…', 'Continue');
  try {
    const isEmail = identifier.includes('@');
    const { user, error } = isEmail
      ? await signIn(identifier, password)
      : await signInWithPhone(normalizePhone(identifier), password);

    if (error || !user) throw new Error(error || 'Incorrect email/number or password.');
    await finishLogin(user);
  } catch (err) {
    console.error('Direct sign-in error:', err);
    showAuthError(err.message);
  } finally {
    setLoading(false, loginBtn, loginBtnLabel, 'Signing in…', 'Continue');
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

// ── Progressive disclosure, backed by the real account status ──────────────
// The password/Passport Key field should only appear once we actually know,
// from the database, that this identifier belongs to an account that
// already has a Passport Key set. Everything else is decided the same way:
//   • not a recognizable email/phone yet (still typing)  -> stay hidden, no warning
//   • no account found for that identifier                -> stay hidden, show a
//                                                            "no Passport found" warning
//   • account found, but this identifier has no key yet   -> stay hidden, no warning
//                                                            (Continue with no password
//                                                            routes into passport.js's
//                                                            OTP flow, which correctly
//                                                            handles first-time setup
//                                                            vs. attaching a 2nd identifier)
//   • account found, key already set for this identifier  -> show the field
const EMAIL_LOOKS_COMPLETE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const identifierErrorEl = document.getElementById('err-email');

let identifierCheckTimer = null;
let identifierCheckAbort = null;
let identifierCheckSeq = 0;

function looksLikeCompleteIdentifier(raw) {
  const value = raw.trim();
  if (!value) return false;
  if (value.includes('@')) return EMAIL_LOOKS_COMPLETE.test(value);
  return /^0[0-9]{9}$/.test(value.replace(/\D/g, ''));
}

function setPasswordStepVisible(visible) {
  if (passwordStep)          passwordStep.style.display          = visible ? '' : 'none';
  if (passwordStepForgotRow) passwordStepForgotRow.style.display = visible ? '' : 'none';
}

function clearIdentifierWarning() {
  identifierErrorEl?.classList.remove('visible');
}

function showIdentifierWarning(message) {
  if (!identifierErrorEl) return;
  identifierErrorEl.textContent = message;
  identifierErrorEl.classList.add('visible');
}

async function runIdentifierCheck(raw) {
  const seq = ++identifierCheckSeq;
  identifierCheckAbort?.abort();
  const controller = new AbortController();
  identifierCheckAbort = controller;

  try {
    const status = await peekPassportStatus(raw, { signal: controller.signal });
    if (seq !== identifierCheckSeq) return; // a newer keystroke has since started its own check

    if (!status.type) {
      setPasswordStepVisible(false);
      clearIdentifierWarning();
      return;
    }

    if (!status.exists) {
      setPasswordStepVisible(false);
      showIdentifierWarning(
        `We couldn\u2019t find a Rands Passport for that ${status.type === 'email' ? 'email address' : 'number'}.`,
      );
      return;
    }

    clearIdentifierWarning();
    setPasswordStepVisible(Boolean(status.passportSet && status.hasIdentifier));
  } catch (err) {
    if (err?.name === 'AbortError') return;
    if (seq !== identifierCheckSeq) return;
    // Network hiccup — fail quiet rather than blocking typing with a warning
    // that isn't actually about the account.
    setPasswordStepVisible(false);
    clearIdentifierWarning();
  }
}

function handleIdentifierInput() {
  const raw = emailInput?.value ?? '';
  clearTimeout(identifierCheckTimer);

  if (!looksLikeCompleteIdentifier(raw)) {
    identifierCheckSeq++; // invalidate any in-flight/pending check
    identifierCheckAbort?.abort();
    setPasswordStepVisible(false);
    clearIdentifierWarning();
    return;
  }

  identifierCheckTimer = setTimeout(() => runIdentifierCheck(raw), 400);
}

emailInput?.addEventListener('input', handleIdentifierInput);
setPasswordStepVisible(false);
handleIdentifierInput(); // covers browser autofill landing a value before any 'input' event

// ── Event listeners ────────────────────────────────────────────────────────
loginBtn?.addEventListener('click', handleLogin);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (document.activeElement === emailInput || document.activeElement === passwordInput)) {
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
(async () => {
  const result = await getSessionWithProfile();
  if (!result) return;

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
// Static markup may still have a #password field for autofill/accessibility
// even though passport.js renders its own password step inside the panel —
// this toggle only does anything if such a field exists elsewhere on the page.
togglePw?.addEventListener('click', () => {
  const passwordInput = document.getElementById('password');
  const isHidden = passwordInput?.type === 'password';
  if (passwordInput)  passwordInput.type       = isHidden ? 'text' : 'password';
  if (eyeIcon)        eyeIcon.style.display    = isHidden ? 'none' : '';
  if (eyeOffIcon)     eyeOffIcon.style.display = isHidden ? '' : 'none';
});
