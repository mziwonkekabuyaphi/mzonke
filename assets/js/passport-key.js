/**
 * assets/js/passport-key.js — Passport Key (web login) setup flow
 *
 * Triggered from login.js when a customer enters an email that belongs to
 * a WhatsApp-registered profile with no Passport Key yet (no password).
 * Walks them through:
 *   1. Request a code (auto-fires as soon as this opens)
 *   2. Enter the 6-digit code sent to their WhatsApp number
 *   3. Choose a new Passport Key (password), twice
 *   4. On success, sign in with the freshly-created credentials
 *
 * Builds its markup at runtime and injects it into .login-content, reusing
 * the page's existing CSS classes (field-group, field-input, cta-btn,
 * auth-error, alt-divider) so it matches the rest of the login screen
 * without needing separate CSS. The normal email/password form is hidden
 * while this panel is open, and restored if the customer cancels.
 */

import { signIn } from '../../config/auth.js';

let panelEl = null;
let currentEmail = '';
let verificationToken = '';

function getLoginContent() {
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

function hideOriginalForm() {
  const { form, ctaWrap, divider, altBtns } = getOriginalFormNodes();
  [form, ctaWrap, divider, altBtns].forEach((el) => {
    if (el) el.style.display = 'none';
  });
}

function showOriginalForm() {
  const { form, ctaWrap, divider, altBtns } = getOriginalFormNodes();
  [form, ctaWrap, divider, altBtns].forEach((el) => {
    if (el) el.style.display = '';
  });
}

function closePanel() {
  panelEl?.remove();
  panelEl = null;
  currentEmail = '';
  verificationToken = '';
  showOriginalForm();
}

function render(html) {
  if (!panelEl) return;
  panelEl.innerHTML = html;
  wireUp();
}

async function requestCode() {
  render(statusMarkup('Sending your code…', false));
  try {
    const res = await fetch('/api/passport-key/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentEmail }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not send a code. Please try again.');
    render(codeStepMarkup(null));
  } catch (err) {
    render(codeStepMarkup(err.message));
  }
}

async function submitCode(code) {
  render(statusMarkup('Checking your code…', false));
  try {
    const res = await fetch('/api/passport-key/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentEmail, code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'That code is incorrect or has expired.');
    verificationToken = data.verificationToken;
    render(passwordStepMarkup(null));
  } catch (err) {
    render(codeStepMarkup(err.message));
  }
}

async function submitNewPassword(password, confirm) {
  if (password.length < 8) {
    render(passwordStepMarkup('Passport Key must be at least 8 characters.'));
    return;
  }
  if (password !== confirm) {
    render(passwordStepMarkup('Those two entries don\u2019t match.'));
    return;
  }

  render(statusMarkup('Setting up your Passport Key…', false));
  try {
    const res = await fetch('/api/passport-key/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentEmail, password, verificationToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not set your Passport Key. Please try again.');

    // Sign the customer straight in with the credentials they just set.
    const { user, error } = await signIn(currentEmail, password);
    if (error || !user) {
      // Passport Key was created fine — just couldn't auto-login. Send them
      // back to the normal form rather than stranding them on this panel.
      closePanel();
      const emailInput = document.getElementById('email');
      if (emailInput) emailInput.value = currentEmail;
      const authError = document.getElementById('authError');
      if (authError) {
        authError.textContent = 'Passport Key set up! Please sign in below.';
        authError.classList.add('visible');
      }
      return;
    }

    render(statusMarkup('You\u2019re in! Redirecting…', false));
    if (typeof window.finishLogin === 'function') {
      await window.finishLogin(user);
    } else {
      window.location.reload();
    }
  } catch (err) {
    render(passwordStepMarkup(err.message));
  }
}

// ── Markup builders (reuse existing site CSS classes) ───────────────────────

function statusMarkup(message, isError) {
  return `
    <div class="field-group">
      <p style="color:${isError ? 'var(--red)' : 'var(--text-muted)'}; font-size:0.9rem;">${message}</p>
    </div>
  `;
}

function codeStepMarkup(errorMsg) {
  return `
    <div class="field-group">
      <label class="field-label">Passport Key Setup</label>
      <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:12px;">
        We texted a 6-digit code to the WhatsApp number on file for <strong>${currentEmail}</strong>.
        Enter it below to continue.
      </p>
      <div class="input-wrap">
        <input class="field-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6"
               id="pkCodeInput" placeholder="123456" autocomplete="one-time-code" />
      </div>
      ${errorMsg ? `<div class="auth-error visible">${errorMsg}</div>` : ''}
    </div>
    <div class="cta-wrap">
      <button class="cta-btn red-cta" type="button" id="pkSubmitCode">
        <span class="btn-label">Verify Code</span>
      </button>
    </div>
    <div class="signup-link">
      Didn\u2019t get it? <a href="#" id="pkResend">Resend code</a> &middot; <a href="#" id="pkCancel">Cancel</a>
    </div>
  `;
}

function passwordStepMarkup(errorMsg) {
  return `
    <div class="field-group">
      <label class="field-label" for="pkNewPassword">Choose a Passport Key</label>
      <div class="input-wrap">
        <input class="field-input" type="password" id="pkNewPassword" placeholder="At least 8 characters" autocomplete="new-password" />
      </div>
    </div>
    <div class="field-group">
      <label class="field-label" for="pkConfirmPassword">Confirm Passport Key</label>
      <div class="input-wrap">
        <input class="field-input" type="password" id="pkConfirmPassword" placeholder="Re-enter it" autocomplete="new-password" />
      </div>
      ${errorMsg ? `<div class="auth-error visible">${errorMsg}</div>` : ''}
    </div>
    <div class="cta-wrap">
      <button class="cta-btn red-cta" type="button" id="pkSubmitPassword">
        <span class="btn-label">Set Passport Key</span>
      </button>
    </div>
    <div class="signup-link">
      <a href="#" id="pkCancel">Cancel</a>
    </div>
  `;
}

function wireUp() {
  document.getElementById('pkSubmitCode')?.addEventListener('click', () => {
    const val = document.getElementById('pkCodeInput')?.value?.trim();
    if (!val) {
      render(codeStepMarkup('Enter the code we sent you.'));
      return;
    }
    submitCode(val);
  });

  document.getElementById('pkCodeInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('pkSubmitCode')?.click();
  });

  document.getElementById('pkResend')?.addEventListener('click', (e) => {
    e.preventDefault();
    requestCode();
  });

  document.getElementById('pkSubmitPassword')?.addEventListener('click', () => {
    const pw = document.getElementById('pkNewPassword')?.value ?? '';
    const confirm = document.getElementById('pkConfirmPassword')?.value ?? '';
    submitNewPassword(pw, confirm);
  });

  document.getElementById('pkConfirmPassword')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('pkSubmitPassword')?.click();
  });

  document.getElementById('pkCancel')?.addEventListener('click', (e) => {
    e.preventDefault();
    closePanel();
  });
}

// ── Entry point, called from login.js ───────────────────────────────────────
export function startPassportKeySetup(email) {
  currentEmail = email;
  const container = getLoginContent();
  if (!container) return;

  hideOriginalForm();

  panelEl = document.createElement('div');
  panelEl.id = 'passportKeyPanel';
  container.appendChild(panelEl);

  requestCode();
}
