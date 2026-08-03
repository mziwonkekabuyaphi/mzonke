/**
 * assets/js/passport.js — merged Passport Key (email OR phone) login/setup flow
 *
 * Replaces passport-key.js + phone-pin.js. Entry point from login.js's
 * single identifier field — that field now accepts either an email or a
 * phone number, detected by format, instead of having two separate panels.
 *
 * Steps:
 *   1. Identifier already typed into login.js's field is handed straight in
 *      -> GET /api/passport/status
 *        - not found                          -> error, offer to go back
 *        - passportSet && hasIdentifier        -> password step -> sign in
 *        - passportSet && !hasIdentifier       -> OTP step only (no new
 *                                                 password collected) ->
 *                                                 attach identifier to the
 *                                                 existing Passport Key
 *        - !passportSet                        -> full first-time setup:
 *                                                 OTP -> choose password
 *
 * Builds its markup at runtime and injects it into .login-content, reusing
 * the page's existing CSS classes (field-group, field-input, cta-btn,
 * auth-error, signup-link) so it matches the rest of the login screen with
 * no new CSS. The normal login form is hidden while this panel is open, and
 * restored if the customer cancels.
 */

import { signInWithPassport } from '../../config/auth.js';

let panelEl = null;
let identifierType = null; // 'email' | 'phone'
let identifierValue = '';
let profileId = '';
let verificationToken = '';
let needsPassword = false; // false when just attaching a 2nd identifier

const PHONE_PATTERN = /^0[0-9]{9}$/;

/**
 * Mirrors lib/services/passport.ts's normalizePhone() exactly: local
 * 0xxxxxxxxx -> 27xxxxxxxxx. Must stay in sync with the server-side version —
 * identifierValue computed here is what we later pass to signInWithPassport,
 * which has to match auth.users.phone (which the server stores normalized).
 */
function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (/^0[0-9]{9}$/.test(digits)) {
    return '27' + digits.slice(1);
  }
  return digits;
}

export function getLoginContent() {
  return document.querySelector('.login-content');
}

function getOriginalFormNodes() {
  return {
    form: document.getElementById('loginForm'),
    ctaWrap: document.querySelector('.cta-wrap'),
    divider: document.querySelector('.alt-divider'),
    altBtns: document.querySelector('.alt-btns'),
  };
}

export function hideOriginalForm() {
  const { form, ctaWrap, divider, altBtns } = getOriginalFormNodes();
  [form, ctaWrap, divider, altBtns].forEach((el) => {
    if (el) el.style.display = 'none';
  });
}

export function showOriginalForm() {
  const { form, ctaWrap, divider, altBtns } = getOriginalFormNodes();
  [form, ctaWrap, divider, altBtns].forEach((el) => {
    if (el) el.style.display = '';
  });
}

function closePanel() {
  panelEl?.remove();
  panelEl = null;
  identifierType = null;
  identifierValue = '';
  profileId = '';
  verificationToken = '';
  needsPassword = false;
  showOriginalForm();
}

function render(html) {
  if (!panelEl) return;
  panelEl.innerHTML = html;
  wireUp();
}

/**
 * Agreed heuristic (Decision 3): contains '@' -> email; else strip
 * non-digits and check against the local 0xxxxxxxxx shape already used by
 * phone-pin.js's validation -> phone; else invalid.
 */
export function detectIdentifierType(raw) {
  const value = raw.trim();
  if (value.includes('@')) return 'email';
  const digits = value.replace(/\D/g, '');
  if (PHONE_PATTERN.test(digits)) return 'phone';
  return null;
}

/**
 * Lightweight read-only lookup for login.js's live identifier field, so it
 * can decide whether to reveal the password/Passport Key input — without
 * opening this panel or duplicating the fetch/normalize logic. Returns the
 * same shape /api/passport/status does, plus `type`/`value`. Returns
 * `{ type: null }` for input that isn't a recognizable email or phone yet
 * (e.g. still mid-typing) so callers can treat that as "don't know yet"
 * rather than "not found".
 */
export async function peekPassportStatus(raw, { signal } = {}) {
  const type = detectIdentifierType(raw);
  if (!type) return { type: null };
  const value = type === 'phone' ? normalizePhone(raw) : raw.trim();

  const res = await fetch(`/api/passport/status?type=${type}&value=${encodeURIComponent(value)}`, { signal });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not check that account.');
  return { type, value, ...data };
}

// ── Step 1: identifier entry / re-entry on error ────────────────────────────

function identifierStepMarkup(errorMsg) {
  return `
    <div class="field-group">
      <label class="field-label" for="passIdentifierInput">Mobile Number or Email</label>
      <div class="input-wrap">
        <input class="field-input" type="text" id="passIdentifierInput"
               placeholder="0821234567 or you@example.com" autocomplete="username" />
      </div>
      ${errorMsg ? `<div class="auth-error visible">${errorMsg}</div>` : ''}
    </div>
    <div class="cta-wrap">
      <button class="cta-btn red-cta" type="button" id="passSubmitIdentifier">
        <span class="btn-label">Continue</span>
      </button>
    </div>
  `;
}

async function submitIdentifier(raw) {
  const type = detectIdentifierType(raw);
  if (!type) {
    render(identifierStepMarkup('Enter a valid email address or Mzansi mobile number.'));
    return;
  }
  const value = type === 'phone' ? normalizePhone(raw) : raw.trim();

  render(statusMarkup('Checking…'));
  identifierType = type;
  identifierValue = value;

  try {
    const res = await fetch(`/api/passport/status?type=${type}&value=${encodeURIComponent(value)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not check that account.');

    if (!data.exists) {
      render(
        identifierStepMarkup(
          `We couldn't find an account with that ${type === 'email' ? 'email' : 'number'}. ` +
            'New to Rands? Register on WhatsApp first.',
        ),
      );
      return;
    }

    profileId = data.profileId;

    if (data.passportSet && data.hasIdentifier) {
      needsPassword = false;
      render(passwordStepMarkup(null));
      return;
    }

    if (data.passportSet && !data.hasIdentifier) {
      // Already has a Passport Key via the other identifier — just attach
      // this one, no new password needed. Straight to OTP.
      needsPassword = false;
      requestCode();
      return;
    }

    // First-time setup.
    needsPassword = true;
    requestCode();
  } catch (err) {
    render(identifierStepMarkup(err.message));
  }
}

// ── Step 2a: password entry (existing Passport Key) → sign in ──────────────

function passwordStepMarkup(errorMsg) {
  return `
    <div class="field-group">
      <label class="field-label" for="passPasswordInput">Passport Key</label>
      <div class="input-wrap">
        <input class="field-input" type="password" id="passPasswordInput" placeholder="Your Passport Key"
               autocomplete="current-password" />
      </div>
      ${errorMsg ? `<div class="auth-error visible">${errorMsg}</div>` : ''}
    </div>
    <div class="cta-wrap">
      <button class="cta-btn red-cta" type="button" id="passSubmitPassword">
        <span class="btn-label">Enter Rands Vibe</span>
      </button>
    </div>
    <div class="signup-link">
      <a href="#" id="passCancel">Cancel</a>
    </div>
  `;
}

async function submitPassword(password) {
  if (!password) {
    render(passwordStepMarkup('Enter your Passport Key.'));
    return;
  }

  render(statusMarkup('Signing in…'));
  try {
    const { user, error } = await signInWithPassport(identifierType, identifierValue, password);
    if (error || !user) throw new Error(error || 'Incorrect Passport Key. Please try again.');
    await finish(user);
  } catch (err) {
    render(passwordStepMarkup(err.message));
  }
}

// ── Step 2b: OTP flow ───────────────────────────────────────────────────────

async function requestCode() {
  render(statusMarkup('Sending your code…'));
  try {
    const res = await fetch('/api/passport/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not send a code. Please try again.');
    render(codeStepMarkup(null));
  } catch (err) {
    render(codeStepMarkup(err.message));
  }
}

function codeStepMarkup(errorMsg) {
  return `
    <div class="field-group">
      <label class="field-label">${needsPassword ? 'Passport Key Setup' : 'Confirm It\u2019s You'}</label>
      <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:12px;">
        ${needsPassword
          ? 'We sent a 6-digit code over WhatsApp to the number on file. Enter it below to continue.'
          : 'You already have a Passport Key \u2014 we just need to confirm this is really you. We sent a 6-digit code over WhatsApp to the number on file, and your existing Passport Key will work here too once it\u2019s linked.'}
      </p>
      <div class="input-wrap">
        <input class="field-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6"
               id="passCodeInput" placeholder="123456" autocomplete="one-time-code" />
      </div>
      ${errorMsg ? `<div class="auth-error visible">${errorMsg}</div>` : ''}
    </div>
    <div class="cta-wrap">
      <button class="cta-btn red-cta" type="button" id="passSubmitCode">
        <span class="btn-label">Verify Code</span>
      </button>
    </div>
    <div class="signup-link">
      Didn\u2019t get it? <a href="#" id="passResend">Resend code</a> &middot; <a href="#" id="passCancel">Cancel</a>
    </div>
  `;
}

async function submitCode(code) {
  render(statusMarkup('Checking your code…'));
  try {
    const res = await fetch('/api/passport/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'That code is incorrect or has expired.');
    verificationToken = data.verificationToken;

    if (needsPassword) {
      render(newPasswordStepMarkup(null));
    } else {
      // Attaching a second identifier — no password to collect, finish now.
      await finishSetup(undefined);
    }
  } catch (err) {
    render(codeStepMarkup(err.message));
  }
}

// ── Step 2c: choose a password (first-time setup only) ─────────────────────

function newPasswordStepMarkup(errorMsg) {
  return `
    <div class="field-group">
      <label class="field-label" for="passNewPassword">Choose a Passport Key</label>
      <div class="input-wrap">
        <input class="field-input" type="password" id="passNewPassword" placeholder="At least 6 characters" autocomplete="new-password" />
      </div>
    </div>
    <div class="field-group">
      <label class="field-label" for="passConfirmPassword">Confirm Passport Key</label>
      <div class="input-wrap">
        <input class="field-input" type="password" id="passConfirmPassword" placeholder="Re-enter it" autocomplete="new-password" />
      </div>
      ${errorMsg ? `<div class="auth-error visible">${errorMsg}</div>` : ''}
    </div>
    <div class="cta-wrap">
      <button class="cta-btn red-cta" type="button" id="passSubmitNewPassword">
        <span class="btn-label">Set Passport Key</span>
      </button>
    </div>
    <div class="signup-link">
      <a href="#" id="passCancel">Cancel</a>
    </div>
  `;
}

async function submitNewPassword(password, confirm) {
  if (password.length < 6) {
    render(newPasswordStepMarkup('Passport Key must be at least 6 characters.'));
    return;
  }
  if (password !== confirm) {
    render(newPasswordStepMarkup('Those two entries don\u2019t match.'));
    return;
  }

  await finishSetup(password);
}

async function finishSetup(password) {
  render(statusMarkup('Setting up your Passport Key…'));
  try {
    const body = { profileId, identifierType, identifierValue, verificationToken };
    if (password !== undefined) body.password = password;

    const res = await fetch('/api/passport/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not set up your Passport Key. Please try again.');

    if (password === undefined) {
      // Attaching a second identifier to an existing password — we never
      // collected that password here, so we can't auto-sign-in. Send the
      // customer back to the normal form to sign in as usual.
      closePanel();
      const authError = document.getElementById('authError');
      if (authError) {
        authError.textContent = 'Done! This identifier is now linked to your Passport Key — please sign in.';
        authError.classList.add('visible');
      }
      return;
    }

    // Sign the customer straight in with the credentials they just set.
    const { user, error } = await signInWithPassport(identifierType, identifierValue, password);
    if (error || !user) {
      closePanel();
      const authError = document.getElementById('authError');
      if (authError) {
        authError.textContent = 'Passport Key set up! Please sign in below.';
        authError.classList.add('visible');
      }
      return;
    }

    render(statusMarkup('You\u2019re in! Redirecting…'));
    await finish(user);
  } catch (err) {
    if (password === undefined) {
      render(codeStepMarkup(err.message));
    } else {
      render(newPasswordStepMarkup(err.message));
    }
  }
}

async function finish(user) {
  if (typeof window.finishLogin === 'function') {
    await window.finishLogin(user);
  } else {
    window.location.reload();
  }
}

// ── Status message ──────────────────────────────────────────────────────────

function statusMarkup(message) {
  return `
    <div class="field-group">
      <p style="color:var(--text-muted); font-size:0.9rem;">${message}</p>
    </div>
  `;
}

// ── Wiring ───────────────────────────────────────────────────────────────────

function wireUp() {
  document.getElementById('passSubmitIdentifier')?.addEventListener('click', () => {
    submitIdentifier(document.getElementById('passIdentifierInput')?.value ?? '');
  });
  document.getElementById('passIdentifierInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('passSubmitIdentifier')?.click();
  });

  document.getElementById('passSubmitPassword')?.addEventListener('click', () => {
    submitPassword(document.getElementById('passPasswordInput')?.value ?? '');
  });
  document.getElementById('passPasswordInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('passSubmitPassword')?.click();
  });

  document.getElementById('passSubmitCode')?.addEventListener('click', () => {
    const val = document.getElementById('passCodeInput')?.value?.trim();
    if (!val) {
      render(codeStepMarkup('Enter the code we sent you.'));
      return;
    }
    submitCode(val);
  });
  document.getElementById('passCodeInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('passSubmitCode')?.click();
  });
  document.getElementById('passResend')?.addEventListener('click', (e) => {
    e.preventDefault();
    requestCode();
  });

  document.getElementById('passSubmitNewPassword')?.addEventListener('click', () => {
    const pw = document.getElementById('passNewPassword')?.value ?? '';
    const confirm = document.getElementById('passConfirmPassword')?.value ?? '';
    submitNewPassword(pw, confirm);
  });
  document.getElementById('passConfirmPassword')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('passSubmitNewPassword')?.click();
  });

  document.getElementById('passCancel')?.addEventListener('click', (e) => {
    e.preventDefault();
    closePanel();
  });
}

// ── Entry point, called from login.js ───────────────────────────────────────
/**
 * @param {string} rawValue - the identifier as typed into login.js's field.
 *   Passed straight in and processed immediately (mirrors how
 *   passport-key.js used to auto-fire requestCode() on open) rather than
 *   asking the customer to type it a second time inside the panel.
 */
export function startPassportFlow(rawValue) {
  const container = getLoginContent();
  if (!container) return;

  hideOriginalForm();

  panelEl = document.createElement('div');
  panelEl.id = 'passportPanel';
  container.appendChild(panelEl);

  if (rawValue) {
    render(statusMarkup('Checking…'));
    submitIdentifier(rawValue);
  } else {
    render(identifierStepMarkup(null));
  }
}
