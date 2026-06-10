//
// RANDS VIBE PASS - MAIN JS (MODIFIED: touch-to-dismiss, no redirect, dynamic content)
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
// Splash Messages (same as before)
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
// Dynamic content loader (no redirect!)
// --------------------
function loadAppContent(url, replaceSplash = true) {
  fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    })
    .then(html => {
      // Extract the <body> content (or full page)
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const bodyContent = doc.body.innerHTML;

      // Create a container for the app content
      let appContainer = document.getElementById('rands-app-container');
      if (!appContainer) {
        appContainer = document.createElement('div');
        appContainer.id = 'rands-app-container';
        document.body.appendChild(appContainer);
      }
      appContainer.innerHTML = bodyContent;

      // Also copy any new <script> tags that might be needed (simple approach: re-execute)
      const scripts = doc.querySelectorAll('script');
      scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        if (oldScript.src) {
          newScript.src = oldScript.src;
        } else {
          newScript.textContent = oldScript.textContent;
        }
        document.body.appendChild(newScript);
      });

      // Remove splash completely
      if (replaceSplash) {
        const splash = document.querySelector('.splash');
        if (splash) splash.remove();
      }
    })
    .catch(err => {
      console.error('Failed to load app content:', err);
      // Fallback: show a simple message
      document.body.innerHTML = '<div style="color:white; text-align:center; margin-top:2rem;">Failed to load app. Please refresh.</div>';
    });
}

// --------------------
// Determine which page to load (login or dashboard)
// --------------------
function getTargetPage() {
  // Supabase session key (adjust if you use a different key)
  const session = localStorage.getItem('sb-session');
  if (session && session !== 'null' && session !== 'undefined') {
    try {
      const parsed = JSON.parse(session);
      if (parsed && parsed.access_token) return 'dashboard.html';
    } catch (e) {}
  }
  return 'login.html';
}

// --------------------
// Touch-to-dismiss splash + load app
// --------------------
let splashDismissed = false;
let animationRequestId = null;

function dismissSplashAndLoadApp() {
  if (splashDismissed) return;
  splashDismissed = true;

  // Cancel the ongoing animation to save resources
  if (animationRequestId) cancelAnimationFrame(animationRequestId);

  const splash = document.querySelector('.splash');
  if (!splash) return;

  // Fade out the splash
  splash.style.transition = 'opacity 0.5s ease';
  splash.style.opacity = '0';
  setTimeout(() => {
    // Load the target page content dynamically
    loadAppContent(getTargetPage(), true);
  }, 500);
}

// Attach touch/click listeners to the whole page
document.body.addEventListener('click', dismissSplashAndLoadApp);
document.body.addEventListener('touchstart', dismissSplashAndLoadApp);

// --------------------
// Optional: Visual progress animation (just for show, no auto-dismiss)
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