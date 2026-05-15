//

// RANDS VIBE PASS - MAIN JS

//

// -----------------------------

// Service Worker Registration

// -----------------------------

if ('serviceWorker' in navigator) {

  window.addEventListener('load', () => {

    navigator.serviceWorker

      .register('./sw.js') // safer for most hosting setups

      .then(reg => console.log('✅ Service Worker registered:', reg.scope))

      .catch(err => console.error('❌ Service Worker registration failed:', err));

  });

}

// -----------------------------

// PWA Install Handling

// -----------------------------

let deferredPrompt = null;

const installBanner = document.getElementById('installBanner');

const installBtn = document.getElementById('installBtn');

const closeInstallBtn = document.getElementById('closeInstallBtn');

window.addEventListener('beforeinstallprompt', (e) => {

  e.preventDefault();

  deferredPrompt = e;

  // show only if user didn't dismiss before

  if (!localStorage.getItem('installDismissed') && installBanner) {

    installBanner.style.display = 'flex';

  }

});

installBtn?.addEventListener('click', async () => {

  if (!deferredPrompt) return;

  deferredPrompt.prompt();

  const { outcome } = await deferredPrompt.userChoice;

  console.log('📲 Install outcome:', outcome);

  deferredPrompt = null;

  if (installBanner) installBanner.style.display = 'none';

  localStorage.setItem('installDismissed', 'true');

});

closeInstallBtn?.addEventListener('click', () => {

  if (installBanner) installBanner.style.display = 'none';

  localStorage.setItem('installDismissed', 'true');

});

window.addEventListener('appinstalled', () => {

  console.log('🎉 App installed successfully');

  if (installBanner) installBanner.style.display = 'none';

  deferredPrompt = null;

});

// -----------------------------

// Splash Elements

// -----------------------------

const progressFill = document.getElementById('progressFill');

const statusElement = document.getElementById('statusMessage');

const percentageElement = document.getElementById('percentage');

let startTime = null;

let hasRedirected = false;

// -----------------------------

// Splash Messages

// -----------------------------

const messageStages = [

  { threshold: 0, text: "✨ Molo, welcome to Rands Vibe Pass" },

  { threshold: 10, text: "🔐 Securing your wallet" },

  { threshold: 25, text: "💳 Loading your Vibe Card" },

  { threshold: 40, text: "💰 Updating your balance" },

  { threshold: 55, text: "🥃 Loading lifestyle services" },

  { threshold: 70, text: "📊 Preparing your dashboard" },

  { threshold: 85, text: "✨ Almost there..." },

  { threshold: 95, text: "🚀 Entering your Vibe" }

];

// -----------------------------

// Update Splash Message

// -----------------------------

function updateMessage(text) {

  if (!statusElement) return;

  statusElement.innerHTML = `

    <span>${text}</span>

    <span class="pulse-dots">

      <span>.</span><span>.</span><span>.</span>

    </span>

  `;

}

// -----------------------------

// Update Progress UI

// -----------------------------

function updateStatus(progress) {

  const percent = Math.min(100, Math.floor(progress));

  if (percentageElement) {

    percentageElement.textContent = `${percent}%`;

  }

  if (progressFill) {

    progressFill.style.width = `${percent}%`;

  }

  let currentMessage = messageStages[0].text;

  for (let i = messageStages.length - 1; i >= 0; i--) {

    if (percent >= messageStages[i].threshold) {

      currentMessage = messageStages[i].text;

      break;

    }

  }

  updateMessage(currentMessage);

}

// -----------------------------

// Redirect Logic (SMART)

// -----------------------------

function redirectUser() {

  if (hasRedirected) return;

  hasRedirected = true;

  // later you can replace with Supabase session check

  const isLoggedIn = localStorage.getItem('sb-session');

  if (isLoggedIn) {

    window.location.href = 'dashboard.html';

  } else {

    window.location.href = 'login.html';

  }

}

// -----------------------------

// Splash Animation Engine

// -----------------------------

const TOTAL_DURATION = 4000; // optimized (fast + premium feel)

function animate(timestamp) {

  if (!startTime) startTime = timestamp;

  const elapsed = timestamp - startTime;

  let progress = (elapsed / TOTAL_DURATION) * 100;

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

// -----------------------------

// Safety fallback redirect

// -----------------------------

setTimeout(() => {

  if (!hasRedirected) {

    redirectUser();

  }

}, 6000);

// -----------------------------

// Offline / Online detection

// -----------------------------

window.addEventListener('offline', () => {

  updateMessage("📡 You're offline");

});

window.addEventListener('online', () => {

  updateMessage("✅ Connection restored");

});
