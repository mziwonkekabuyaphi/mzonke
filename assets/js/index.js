//

// RANDS VIBE PASS - MAIN JS

//

// --------------------

// Service Worker Registration

// --------------------

if ('serviceWorker' in navigator) {

  window.addEventListener('load', () => {

    navigator.serviceWorker

      .register('./sw.js')

      .then(reg => console.log('✅ Service Worker registered:', reg.scope))

      .catch(err => console.error('❌ Service Worker registration failed:', err));

  });

}

// --------------------

// PWA Install Handling

// --------------------

let deferredPrompt = null;

const installBanner = document.getElementById('installBanner');

const installBtn = document.getElementById('installBtn');

const closeInstallBtn = document.getElementById('closeInstallBtn');

function setInstallReady(ready) {

  if (!installBtn) return;

  installBtn.disabled = !ready;

  installBtn.style.opacity = ready ? '1' : '0.5';

  installBtn.style.cursor = ready ? 'pointer' : 'not-allowed';

}

window.addEventListener('beforeinstallprompt', (e) => {

  e.preventDefault();

  deferredPrompt = e;

  if (!localStorage.getItem('installDismissed') && installBanner) {

    installBanner.style.display = 'flex';

    setInstallReady(true);

  }

  console.log('📲 Install prompt captured');

});

installBtn?.addEventListener('click', async () => {

  if (!deferredPrompt) return;

  try {

    deferredPrompt.prompt();

    const { outcome } = await deferredPrompt.userChoice;

    console.log('📲 Install outcome:', outcome);

  } catch (err) {

    console.error('❌ Install error:', err);

  } finally {

    deferredPrompt = null;

    setInstallReady(false);

    if (installBanner) installBanner.style.display = 'none';

    localStorage.setItem('installDismissed', 'true');

  }

});

closeInstallBtn?.addEventListener('click', () => {

  if (installBanner) installBanner.style.display = 'none';

  localStorage.setItem('installDismissed', 'true');

});

window.addEventListener('appinstalled', () => {

  console.log('🎉 App installed successfully');

  deferredPrompt = null;

  if (installBanner) installBanner.style.display = 'none';

});

if (

  window.matchMedia('(display-mode: standalone)').matches ||

  window.navigator.standalone === true

) {

  localStorage.setItem('installDismissed', 'true');

}

// --------------------

// Splash Elements

// --------------------

const progressFill = document.getElementById('progressFill');

const statusElement = document.getElementById('statusMessage');

const percentageElement = document.getElementById('percentage');

let startTime = null;

let hasRedirected = false;

// --------------------

// Splash Messages

// --------------------

const messageStages = [
  { threshold: 0, text: "✨ Molo, welcome to Rands" },

  { threshold: 10, text: "🔐 Securing your Vibe Passport" },

  { threshold: 25, text: "💳 Loading your Vibe Card" },

  { threshold: 40, text: "💰 Syncing your Flow Balance" },

  { threshold: 55, text: "🥃 Activating Lifestyle Zones" },

  { threshold: 70, text: "📊 Preparing your Vibe Dashboard" },

  { threshold: 85, text: "✨ Almost there... syncing complete" },

  { threshold: 95, text: "🚀 Entering the Vibe Zone..." }
];

// --------------------

// Update Splash Message

// --------------------

function updateMessage(text) {

  if (!statusElement) return;

  statusElement.innerHTML =

    `<span>${text}</span>

     <span class="pulse-dots"><span>.</span><span>.</span><span>.</span></span>`;

}

// --------------------

// Update Progress UI

// --------------------

function updateStatus(progress) {

  const percent = Math.min(100, Math.floor(progress));

  if (percentageElement) percentageElement.textContent = `${percent}%`;

  if (progressFill) progressFill.style.width = `${percent}%`;

  let currentMessage = messageStages[0].text;

  for (let i = messageStages.length - 1; i >= 0; i--) {

    if (percent >= messageStages[i].threshold) {

      currentMessage = messageStages[i].text;

      break;

    }

  }

  updateMessage(currentMessage);

}

// --------------------

// Redirect Logic

// --------------------

function redirectUser() {

  if (hasRedirected) return;

  hasRedirected = true;

  const isLoggedIn = localStorage.getItem('sb-session');

  window.location.href = isLoggedIn ? 'dashboard.html' : 'login.html';

}

// --------------------

// Splash Animation Engine

// --------------------

const TOTAL_DURATION = 4000;

function animate(timestamp) {

  if (!startTime) startTime = timestamp;

  const elapsed = timestamp - startTime;

  const progress = (elapsed / TOTAL_DURATION) * 100;

  if (progress >= 100) {

    updateStatus(100);

    updateMessage("🚀 Welcome to Rands Vibe Pass!");

    setTimeout(redirectUser, 300);

    return;

  }

  updateStatus(progress);

  requestAnimationFrame(animate);

}

requestAnimationFrame(animate);

// Safety fallback redirect

setTimeout(() => {

  if (!hasRedirected) redirectUser();

}, 6000);

// --------------------

// Offline / Online detection

// --------------------

window.addEventListener('offline', () =>

  updateMessage("📡 You’re offline")

);

window.addEventListener('online', () =>

  updateMessage("✅ Connection restored")

);
