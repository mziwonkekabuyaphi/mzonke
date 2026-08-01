/**
 * assets/js/phone-pin.js — Phone + PIN (web login) flow
 *
 * Entry point from login.html's "Use your phone number instead" link.
 * Unlike passport-key.js (which is handed an email already known to belong
 * to a WhatsApp-registered, no-password profile), this panel starts one
 * step earlier — it asks for the phone number itself, since login.html's
 * default field is email.
 *
 * Steps:
 *   1. Enter phone number -> check /api/phone-pin/status
 *        - not found            -> show a message, offer to go back
 *        - found, PIN set       -> step 2a: enter PIN -> sign in
 *        - found, no PIN yet    -> step 2b: OTP flow (same shape as
 *                                  passport-key.js) -> set a PIN -> sign in
 *
 * Reuses getLoginContent/hideOriginalForm/showOriginalForm from
 * passport-key.js (see patches/passport-key.js.patch.md) rather than
 * duplicating the panel-injection pattern, and the same CSS classes
 * (field-group, field-input, cta-btn, auth-error, signup-link) so it
 * matches the rest of the login screen with no new CSS.
 *
 * FIXED (2026-08-01): currentPhone is kept in local format (0xxxxxxxxx)
 * for the whole life of this panel, which is fine for every /api/phone-pin/*
 * call since lib/services/phone-pin.ts normalizes internally before each DB
 * lookup. But the two places below that call signInWithPhone() go straight
 * to Supabase Auth with no server in between, and Supabase has no idea
 * 0xxxxxxxxx and 27xxxxxxxxx are the same number — auth.users.phone is
 * always stored in 27xxxxxxxxx form (see handle_new_auth_user() /
 * setCustomerPin() in phone-pin.ts). Signing in with the raw 0xxxxxxxxx
 * value therefore always failed with "Invalid login credentials", even
 * with the correct PIN. normalizePhone() below mirrors the exact same rule
 * phone-pin.ts already uses server-side, applied right before those two
 * signInWithPhone() calls.
 */

import { signInWithPhone } from '../../config/auth.js';
import { getLoginContent, hideOriginalForm, showOriginalForm } from './passport-key.js';

let panelEl = null;
let currentPhone = '';
let verificationToken = '';

/**
 * Mirrors the normalization in lib/services/phone-pin.ts's normalizePhone():
 * local 0xxxxxxxxx -> 27xxxxxxxxx, anything else passed through as-is.
 * Needed here because this is the only client-side code path that talks
 * to Supabase Auth directly (signInWithPassword under the hood) instead of
 * going through one of our own /api/phone-pin/* routes, which already
 * normalize server-side.
 */
function normalizePhone(digits) {
  return digits.startsWith('0') ? '27' + digits.slice(1) : digits;
}

function closePanel() {
  panelEl?.remove();
  panelEl = null;
  currentPhone = '';
  verificationToken = '';
  showOriginalForm();
}

function render(html) {
  if (!panelEl) return;
  panelEl.innerHTML = html;
  wireUp();
}

// ── Step 1: phone entry ─────────────────────────────────────────────────────

function phoneStepMarkup(errorMsg) {
  return `
    <div class="field-group">
      <label class="field-label" for="ppPhoneInput">Mobile Number</label>
      <div class="input-wrap">
        <input class="field-input" type="tel" id="ppPhoneInput" placeholder="0821234567"
               inputmode="numeric" maxlength="10" autocomplete="tel" />
      </div>
      ${errorMsg ? `<div class="auth-error visible">${errorMsg}</div>` : ''}
    </div>
    <div class="cta-wrap">
      <button class="cta-btn red-cta" type="button" id="ppSubmitPhone">
        <span class="btn-label">Continue</span>
      </button>
    </div>
    <div class="signup-link">
      <a href="#" id="ppCancel">Use email instead</a>
    </div>
  `;
}

async function submitPhone(phoneRaw) {
  const phone = phoneRaw.replace(/\D/g, '');
  if (!/^0[0-9]{9}$/.test(phone)) {
    render(phoneStepMarkup('Enter a valid Mzansi mobile number.'));
    return;
  }

  render(statusMarkup('Checking…'));
  currentPhone = phone;

  try {
    const res = await fetch(`/api/phone-pin/status?phone=${encodeURIComponent(phone)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not check that number.');

    if (!data.exists) {
      render(
        phoneStepMarkup(
          "We couldn't find an account with that number. New to Rands? Register on WhatsApp first, or use email below.",
        ),
      );
      return;
    }

    if (data.hasPin) {
      render(pinStepMarkup(null));
    } else {
      requestCode();
    }
  } catch (err) {
    render(phoneStepMarkup(err.message));
  }
}

// ── Step 2a: PIN entry (existing PIN) → sign in ─────────────────────────────

function pinStepMarkup(errorMsg) {
  return `
    <div class="field-group">
      <label class="field-label" for="ppPinInput">Passport PIN</label>
      <div class="input-wrap">
        <input class="field-input" type="password" id="ppPinInput" placeholder="4–6 digit PIN"
               inputmode="numeric" maxlength="6" autocomplete="current-password" />
      </div>
      ${errorMsg ? `<div class="auth-error visible">${errorMsg}</div>` : ''}
    </div>
    <div class="cta-wrap">
      <button class="cta-btn red-cta" type="button" id="ppSubmitPin">
        <span class="btn-label">Enter Rands Vibe</span>
      </button>
    </div>
    <div class="signup-link">
      <a href="#" id="ppCancel">Cancel</a>
    </div>
  `;
}

async function submitPin(pin) {
  if (!pin) {
    render(pinStepMarkup('Enter your PIN.'));
    return;
  }

  render(statusMarkup('Signing in…'));
  try {
    const { user, error } = await signInWithPhone(normalizePhone(currentPhone), pin);
    if (error || !user) throw new Error(error || 'Incorrect PIN. Please try again.');

    if (typeof window.finishLogin === 'function') {
      await window.finishLogin(user);
    } else {
      window.location.reload();
    }
  } catch (err) {
    render(pinStepMarkup(err.message));
  }
}

// ── Step 2b: OTP flow (no PIN yet) — same shape as passport-key.js ─────────

async function requestCode() {
  render(statusMarkup('Sending your code…'));
  try {
    const res = await fetch('/api/phone-pin/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: currentPhone }),
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
      <label class="field-label">Set Up Your Passport PIN</label>
      <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:12px;">
        We sent a 6-digit code over WhatsApp to <strong>${currentPhone}</strong>.
        Enter it below to continue.
      </p>
      <div class="input-wrap">
        <input class="field-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6"
               id="ppCodeInput" placeholder="123456" autocomplete="one-time-code" />
      </div>
      ${errorMsg ? `<div class="auth-error visible">${errorMsg}</div>` : ''}
    </div>
    <div class="cta-wrap">
      <button class="cta-btn red-cta" type="button" id="ppSubmitCode">
        <span class="btn-label">Verify Code</span>
      </button>
    </div>
    <div class="signup-link">
      Didn\u2019t get it? <a href="#" id="ppResend">Resend code</a> &middot; <a href="#" id="ppCancel">Cancel</a>
    </div>
  `;
}

async function submitCode(code) {
  render(statusMarkup('Checking your code…'));
  try {
    const res = await fetch('/api/phone-pin/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: currentPhone, code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'That code is incorrect or has expired.');
    verificationToken = data.verificationToken;
    render(newPinStepMarkup(null));
  } catch (err) {
    render(codeStepMarkup(err.message));
  }
}

function newPinStepMarkup(errorMsg) {
  return `
    <div class="field-group">
      <label class="field-label" for="ppNewPin">Choose a Passport PIN</label>
      <div class="input-wrap">
        <input class="field-input" type="password" id="ppNewPin" placeholder="4–6 digits"
               inputmode="numeric" maxlength="6" autocomplete="new-password" />
      </div>
    </div>
    <div class="field-group">
      <label class="field-label" for="ppConfirmPin">Confirm Passport PIN</label>
      <div class="input-wrap">
        <input class="field-input" type="password" id="ppConfirmPin" placeholder="Re-enter it"
               inputmode="numeric" maxlength="6" autocomplete="new-password" />
      </div>
      ${errorMsg ? `<div class="auth-error visible">${errorMsg}</div>` : ''}
    </div>
    <div class="cta-wrap">
      <button class="cta-btn red-cta" type="button" id="ppSubmitNewPin">
        <span class="btn-label">Set PIN</span>
      </button>
    </div>
    <div class="signup-link">
      <a href="#" id="ppCancel">Cancel</a>
    </div>
  `;
}

async function submitNewPin(pin, confirm) {
  if (!/^[0-9]{4,6}$/.test(pin)) {
    render(newPinStepMarkup('PIN must be 4–6 digits.'));
    return;
  }
  if (pin !== confirm) {
    render(newPinStepMarkup('Those two entries don\u2019t match.'));
    return;
  }

  render(statusMarkup('Setting up your PIN…'));
  try {
    const res = await fetch('/api/phone-pin/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: currentPhone, pin, verificationToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not set your PIN. Please try again.');

    // Sign the customer straight in with the PIN they just set.
    const { user, error } = await signInWithPhone(normalizePhone(currentPhone), pin);
    if (error || !user) {
      closePanel();
      const authError = document.getElementById('authError');
      if (authError) {
        authError.textContent = 'Passport PIN set up! Please sign in with your phone number.';
        authError.classList.add('visible');
      }
      return;
    }

    render(statusMarkup('You\u2019re in! Redirecting…'));
    if (typeof window.finishLogin === 'function') {
      await window.finishLogin(user);
    } else {
      window.location.reload();
    }
  } catch (err) {
    render(newPinStepMarkup(err.message));
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
  document.getElementById('ppSubmitPhone')?.addEventListener('click', () => {
    submitPhone(document.getElementById('ppPhoneInput')?.value ?? '');
  });
  document.getElementById('ppPhoneInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('ppSubmitPhone')?.click();
  });

  document.getElementById('ppSubmitPin')?.addEventListener('click', () => {
    submitPin(document.getElementById('ppPinInput')?.value ?? '');
  });
  document.getElementById('ppPinInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('ppSubmitPin')?.click();
  });

  document.getElementById('ppSubmitCode')?.addEventListener('click', () => {
    const val = document.getElementById('ppCodeInput')?.value?.trim();
    if (!val) {
      render(codeStepMarkup('Enter the code we sent you.'));
      return;
    }
    submitCode(val);
  });
  document.getElementById('ppCodeInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('ppSubmitCode')?.click();
  });
  document.getElementById('ppResend')?.addEventListener('click', (e) => {
    e.preventDefault();
    requestCode();
  });

  document.getElementById('ppSubmitNewPin')?.addEventListener('click', () => {
    const pin = document.getElementById('ppNewPin')?.value ?? '';
    const confirm = document.getElementById('ppConfirmPin')?.value ?? '';
    submitNewPin(pin, confirm);
  });
  document.getElementById('ppConfirmPin')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('ppSubmitNewPin')?.click();
  });

  document.getElementById('ppCancel')?.addEventListener('click', (e) => {
    e.preventDefault();
    closePanel();
  });
}

// ── Entry point, called from login.js ───────────────────────────────────────
export function startPhonePinFlow() {
  const container = getLoginContent();
  if (!container) return;

  hideOriginalForm();

  panelEl = document.createElement('div');
  panelEl.id = 'phonePinPanel';
  container.appendChild(panelEl);

  render(phoneStepMarkup(null));
}
