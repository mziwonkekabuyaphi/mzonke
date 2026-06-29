//
// RANDS VIBE PASS - MAIN JS
// Features:
// - Auto-redirect to login after ~5.2s (4s progress + 1.2s hold)
// - Tap anywhere to skip immediately
// - Install banner works on Android (with fallback for iOS/others)
// - iOS banner hidden automatically
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
// Platform Detection
// --------------------
const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// --------------------
// PWA Install Handling
// --------------------
let deferredPrompt = null;
const installBanner = document.getElementById('installBanner');
const installBtn = document.getElementById('installBtn');
const closeInstallBtn = document.getElementById('closeInstallBtn');

// 🔥 FIX: Hide the Chrome-style banner on iOS (it never works there)
if (isIos && installBanner) {
  installBanner.style.display = 'none';
}

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

// 🔥 FIX: Install button now has a fallback if prompt is missing
installBtn?.addEventListener('click', async () => {
  if (deferredPrompt) {
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
  } else {
    // Fallback for iOS / unsupported browsers / already installed
    alert('To install this app, tap the Share icon and select "Add to Home Screen".');
  }
});

closeInstallBtn?.addEventListener('click', () => {
  if (installBanner) installBanner.style.display = 'none';
  localStorage.setItem('installDismissed', 'true');
});

window.addEventListener('appinstalled', () => {
  console.log('✅ App installed successfully');
  deferredPrompt = null;
  if (installBanner) installBanner.style.display = 'none';
});

// If already in standalone mode, hide the banner
if (
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true
) {
  localStorage.setItem('installDismissed', 'true');
  if (installBanner) installBanner.style.display = 'none';
}

// --------------------
// Splash Elements
// --------------------
const progressFill = document.getElementById('progressFill');
const statusElement = document.getElementById('statusMessage');
const percentageElement = document.getElementById('percentage');

// --------------------
// Splash Messages
// --------------------
const messageStages = [
  { threshold: 0, text: "Molo, welcome to Rands" },
  { threshold: 10, text: "Securing your Rands account" },
  { threshold: 25, text: "Loading your wallet" },
  { threshold: 40, text: "Syncing balance and transactions" },
  { threshold: 55, text: "Preparing event access system" },
  { threshold: 70, text: "Loading your dashboard" },
  { threshold: 85, text: "Finalising secure connection" },
  { threshold: 95, text: "Entering Rands platform" }
];

function updateMessage(text) {
  if (!statusElement) return;
  statusElement.innerHTML = `<span>${text}</span><span class="pulse-dots"><span>.</span><span>.</span><span>.</span></span>`;
}

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
// Redirect Logic (Auto + Tap-to-Skip)
// --------------------
let splashDismissed = false;
let animationRequestId = null;
let autoRedirectTimer = null;

function redirectToLogin() {
  if (splashDismissed) return;
  splashDismissed = true;

  // Clean up timers/animation to save resources
  if (animationRequestId) cancelAnimationFrame(animationRequestId);
  if (autoRedirectTimer) clearTimeout(autoRedirectTimer);

  // Go to login
  window.location.href = 'login.html';
}

// Tap/click anywhere to skip the wait
document.body.addEventListener('click', redirectToLogin);
document.body.addEventListener('touchstart', redirectToLogin);

// Auto-redirect trigger after progress hits 100%
function startAutoRedirect() {
  // Wait 1.2 seconds after hitting 100% before redirecting
  autoRedirectTimer = setTimeout(() => {
    redirectToLogin();
  }, 1200);
}

// --------------------
// Visual Progress Animation
// --------------------
let startTime = null;

function animate(timestamp) {
  if (!startTime) startTime = timestamp;
  const elapsed = timestamp - startTime;
  const progress = Math.min(100, (elapsed / 4000) * 100); // 4 second cycle

  updateStatus(progress);

  if (progress < 100 && !splashDismissed) {
    // Keep animating
    animationRequestId = requestAnimationFrame(animate);
  } else if (progress >= 100 && !splashDismissed) {
    // Hit 100% – update message and start the auto-redirect countdown
    updateStatus(100);
    updateMessage("Tap anywhere or wait...");
    startAutoRedirect();
  }
}

// Kick off the animation
animationRequestId = requestAnimationFrame(animate);

// --------------------
// Offline / Online Detection
// --------------------
window.addEventListener('offline', () => updateMessage("📡 You're offline"));
window.addEventListener('online', () => updateMessage("✅ Connection restored"));