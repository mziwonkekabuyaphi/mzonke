import { supabase } from '../../config/supabase.js';

document.addEventListener('DOMContentLoaded', () => {

// ========== STATE ==========
const state = {
  passType: 'general',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  termsAccepted: false,
};

let currentStep = 1;

// ========== HELPERS ==========
function el(id) {
  return document.getElementById(id);
}

// ========== NAV ==========
function goToStep(n) {
  const views = {
    1: el('step1'),
    2: el('step2'),
    3: el('step3'),
    4: el('stepSuccess'),
  };

  const from = views[currentStep];
  const to = views[n];

  if (!from || !to) {
    console.error('Step view missing:', { from, to });
    return;
  }

  const forward = n > currentStep;

  from.classList.remove('active');
  from.classList.add(forward ? 'exit-left' : 'enter-right');

  to.style.transition = 'none';
  to.classList.remove('active', 'exit-left', 'enter-right');
  to.classList.add(forward ? 'enter-right' : 'exit-left');

  to.offsetHeight;
  to.style.transition = '';

  requestAnimationFrame(() => {
    to.classList.remove('enter-right', 'exit-left');
    to.classList.add('active');
    to.scrollTop = 0;
  });

  setTimeout(() => {
    from.classList.remove('exit-left', 'enter-right', 'active');
  }, 420);

  currentStep = n;
}

// ========== STEP 1 ==========
const cardGeneral = el('cardGeneral');
const cardVip = el('cardVip');
const s1Cta = el('s1Cta');
const s1CtaText = el('s1CtaText');
const s1CtaNote = el('s1CtaNote');

function selectPass(type) {
  state.passType = type;

  cardGeneral?.classList.toggle('selected', type === 'general');
  cardVip?.classList.toggle('selected', type === 'vip');

  if (!s1Cta || !s1CtaText || !s1CtaNote) return;

  if (type === 'general') {
    s1Cta.className = 'cta-btn free-cta';
    s1CtaText.textContent = 'GET STARTED FREE';
    s1CtaNote.textContent = 'No credit card needed · Takes 2 minutes';
  } else {
    s1Cta.className = 'cta-btn vip-cta';
    s1CtaText.textContent = 'UNLOCK VIP XPERIENCE';
    s1CtaNote.textContent = 'One-time R50 · Yours forever';
  }
}

cardGeneral?.addEventListener('click', () => selectPass('general'));
cardVip?.addEventListener('click', () => selectPass('vip'));

setTimeout(() => selectPass('general'), 300);

s1Cta?.addEventListener('click', () => goToStep(2));

// ========== BACK ==========
el('s2Back')?.addEventListener('click', () => goToStep(1));
el('s3Back')?.addEventListener('click', () => goToStep(2));

// ========== TERMS ==========
const termsCheck = el('termsCheck');

termsCheck?.addEventListener('click', () => {
  state.termsAccepted = !state.termsAccepted;
  termsCheck.classList.toggle('checked', state.termsAccepted);
  termsCheck.setAttribute('aria-checked', String(state.termsAccepted));
  if (state.termsAccepted) hideError('terms');
});

termsCheck?.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    termsCheck.click();
  }
});

// ========== ERRORS ==========
function showError(id) {
  el('err-' + id)?.classList.add('visible');
  el(id)?.classList.add('has-error');
}

function hideError(id) {
  el('err-' + id)?.classList.remove('visible');
  el(id)?.classList.remove('has-error');
}

function clearErrors() {
  document.querySelectorAll('.field-error').forEach(e => e.classList.remove('visible'));
  document.querySelectorAll('.field-input').forEach(e => e.classList.remove('has-error'));
}

// ========== VALIDATION ==========
function validateStep2() {
  clearErrors();
  let ok = true;

  const firstName = el('firstName')?.value.trim();
  const lastName = el('lastName')?.value.trim();
  const email = el('email')?.value.trim();
  const phone = el('phone')?.value.trim();
  const password = el('password')?.value;
  const confirmPassword = el('confirmPassword')?.value;

  if (!firstName) { showError('firstName'); ok = false; }
  if (!lastName) { showError('lastName'); ok = false; }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError('email'); ok = false;
  }

  if (!phone || phone.length < 10) {
    showError('phone'); ok = false;
  }

  if (!password || password.length < 6) {
    showError('password'); ok = false;
  }

  if (password !== confirmPassword) {
    showError('confirmPassword'); ok = false;
  }

  if (!state.termsAccepted) {
    showError('terms'); ok = false;
  }

  if (ok) {
    state.firstName = firstName;
    state.lastName = lastName;
    state.email = email;
    state.phone = phone;
    state.password = password;
  }

  return ok;
}

// ========== STEP 2 → 3 ==========
el('s2Cta')?.addEventListener('click', () => {
  if (!validateStep2()) return;

  const fullName = `${state.firstName} ${state.lastName}`.toUpperCase();

  el('dynamicCardHolder').textContent = fullName;

  const fakeNumber = Array.from({ length: 4 }, () =>
    Math.floor(1000 + Math.random() * 9000)
  ).join(' ');

  el('dynamicCardNumber').textContent = fakeNumber;

  const exp = new Date();
  exp.setFullYear(exp.getFullYear() + 4);

  el('dynamicExpiry').textContent =
    String(exp.getMonth() + 1).padStart(2, '0') + '/' + String(exp.getFullYear()).slice(-2);

  const walletId = 'RV-' + Math.random().toString(36).substring(2, 8).toUpperCase();

  el('walletIdDisplay').textContent = walletId;
  el('accountNumberDisplay').textContent = fakeNumber.replace(/\s/g, '');

  el('amountPrice').textContent = state.passType === 'vip' ? 'R50' : 'FREE';

  el('s3CtaText').textContent =
    state.passType === 'vip' ? 'Pay R50 & Start Vibing' : 'Start Vibing Now';

  goToStep(3);
});

// ========== EDIT ==========
el('editLink')?.addEventListener('click', () => goToStep(2));

// ========== SUBMIT ==========
el('s3Cta')?.addEventListener('click', async () => {
  const btn = el('s3Cta');
  const btnText = el('s3CtaText');

  if (!btn || !btnText) return;

  btn.disabled = true;
  btnText.textContent = 'CREATING...';

  try {
    const { error } = await supabase.auth.signUp({
      email: state.email,
      password: state.password,
      options: {
        data: {
          full_name: `${state.firstName} ${state.lastName}`,
          phone: state.phone,
          account_type: state.passType,
        },
      },
    });

    if (error) throw error;

    el('successSub').innerHTML =
      `Welcome aboard, <strong>${state.firstName}</strong>!`;

    if (state.passType === 'vip') {
      el('successIcon').textContent = '🔥';
    }

    goToStep(4);

  } catch (err) {
    console.error(err);
    alert(err.message || 'Registration failed');

    btn.disabled = false;
    btnText.textContent =
      state.passType === 'vip' ? 'Pay R50 & Start Vibing' : 'Start Vibing Now';
  }
});

// ========== EXPLORE ==========
el('exploreBtn')?.addEventListener('click', () => {
  window.location.href = 'home.html';
});

});
