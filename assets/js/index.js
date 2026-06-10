//
// RANDS VIBE PASS - MAIN JS (SPLASH ONLY – TAP TO GO TO LOGIN)
// No auto-redirect, no session detection – always login.html on tap.
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
// PWA Install Handling (unchanged)
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
// Redirect to login.html on tap (no auto-redirect)
// --------------------
let splashDismissed = false;
let animationRequestId = null;

function redirectToLogin() {
  if (splashDismissed) return;
  splashDismissed = true;
  // Cancel animation to save resources
  if (animationRequestId) cancelAnimationFrame(animationRequestId);
  // Simple redirect to login page
  window.location.href = 'login.html';
}

// Attach touch/click listeners to the whole page
document.body.addEventListener('click', redirectToLogin);
document.body.addEventListener('touchstart', redirectToLogin);

// --------------------
// Visual progress animation (just for show, no auto-dismiss)
// --------------------
let startTime = null;
function animate(timestamp) {
  if (!startTime) startTime = timestamp;
  const elapsed = timestamp - startTime;
  const progress = Math.min(100, (elapsed / 4000) * 100); // 4 second cycle
  updateStatus(progress);
  if (progress < 100 && !splashDismissed) {
    animationRequestId = requestAnimationFrame(animate);
  } else if (progress >= 100 && !splashDismissed) {
    // When progress reaches 100%, just hold the "100%" look – still wait for user tap
    updateStatus(100);
    updateMessage("🚀 Ready. Tap to enter.");
  }
}
animationRequestId = requestAnimationFrame(animate);

// --------------------
// Offline / Online detection (unchanged)
// --------------------
window.addEventListener('offline', () => updateMessage("📡 You're offline"));
window.addEventListener('online', () => updateMessage("✅ Connection restored"));