// assets/js/index.js

// Service Worker Registration

if ('serviceWorker' in navigator) {

  window.addEventListener('load', () => {

    navigator.serviceWorker.register('/Wallet-/sw.js')

      .then(reg => console.log('✅ Service Worker registered:', reg.scope))

      .catch(err => console.error('❌ Service Worker registration failed:', err));

  });

}

// PWA Installation handling

let deferredPrompt;

const installBanner = document.getElementById('installBanner');

const installBtn = document.getElementById('installBtn');

const closeInstallBtn = document.getElementById('closeInstallBtn');

window.addEventListener('beforeinstallprompt', (e) => {

  e.preventDefault();

  deferredPrompt = e;

  if (!localStorage.getItem('installDismissed')) {

    installBanner.style.display = 'flex';

  }

});

installBtn?.addEventListener('click', async () => {

  if (deferredPrompt) {

    deferredPrompt.prompt();

    const { outcome } = await deferredPrompt.userChoice;

    console.log(`User response to install: ${outcome}`);

    deferredPrompt = null;

    installBanner.style.display = 'none';

    localStorage.setItem('installDismissed', 'true');

  }

});

closeInstallBtn?.addEventListener('click', () => {

  installBanner.style.display = 'none';

  localStorage.setItem('installDismissed', 'true');

});

window.addEventListener('appinstalled', () => {

  console.log('✅ App installed successfully');

  installBanner.style.display = 'none';

  deferredPrompt = null;

});

// Splash animation

const totalDuration = 10000;

const progressFill = document.getElementById('progressFill');

const statusElement = document.getElementById('statusMessage');

const percentageElement = document.getElementById('percentage');

let startTime = null;

let hasRedirected = false;

const messageStages = [
  { threshold: 0, text: "✨ Molo, welcome to Rands Vibe Pass" },
  { threshold: 10, text: "🔐 Securing your wallet" },
  { threshold: 25, text: "💳 Loading your Vibe Card" },
  { threshold: 40, text: "💰 Updating your balance" },
  { threshold: 55, text: "🥃 loading booze and Butcher shop" },
  { threshold: 70, text: "📊 Preparing your dashboard" },
  { threshold: 85, text: "✨ Almost there…Ready to experience?" },
  { threshold: 95, text: "🚀 Entering your Vibe" }
];

function updateMessageContent(text) {

  if (!statusElement) return;

  const currentSpan = statusElement.querySelector('span:first-child');

  if (currentSpan && currentSpan.innerText !== text) {

    statusElement.innerHTML = `<span>${text}</span><span class="pulse-dots"><span>.</span><span>.</span><span>.</span></span>`;

  } else if (!currentSpan) {

    statusElement.innerHTML = `<span>${text}</span><span class="pulse-dots"><span>.</span><span>.</span><span>.</span></span>`;

  }

}

function updateStatus(progressPercent) {

  if (!progressFill || !percentageElement) return;

  percentageElement.textContent = `${Math.floor(progressPercent)}%`;

  progressFill.style.width = `${progressPercent}%`;

  let currentMessage = messageStages[0].text;

  for (let i = messageStages.length - 1; i >= 0; i--) {

    if (progressPercent >= messageStages[i].threshold) {

      currentMessage = messageStages[i].text;

      break;

    }

  }

  updateMessageContent(currentMessage);

}

function redirectToLogin() {

  if (!hasRedirected) {

    hasRedirected = true;

    window.location.href = 'login.html';

  }

}

function animateProgress(timestamp) {

  if (!startTime) startTime = timestamp;

  const elapsed = timestamp - startTime;

  let progress = (elapsed / totalDuration) * 100;

  if (progress >= 100) {

    updateStatus(100);

    updateMessageContent("🚀 Welcome to Rands Vibe Pass!");

    setTimeout(redirectToLogin, 300);

    return;

  }

  updateStatus(progress);

  requestAnimationFrame(animateProgress);

}

requestAnimationFrame(animateProgress);

setTimeout(() => {

  if (!hasRedirected) redirectToLogin();

}, 11000)
