/**
 * kiosk.js
 *
 * Minimal SPA loader for the Rands kiosk.
 *
 * It knows how to mount a screen's HTML into #kiosk-screen, load that
 * screen's stylesheet once, and run that screen's init() logic. Three
 * screens are registered so far: welcome, scanner, and menu. Payment /
 * Gate (Passport Purchase already lives inside scanner) and the rest of
 * the kiosk pages have not been converted and continue to be reached the
 * same way they always were (window.location.href to their own
 * standalone .html pages), untouched.
 *
 * Menu is the first registered screen that needs an external <script>
 * (Vue 2's CDN build) rather than just an ES module import, so this file
 * also exposes ensureScript() — a <script>-tag equivalent of
 * ensureStylesheet() below, with the same load-once caching.
 *
 * Same relative path as the original kiosk-start.html used
 * (`../config/supabase.js`), since this file lives in the same directory
 * kiosk-start.html used to. If your project's config/supabase.js lives
 * somewhere else relative to index.html, update this one import path.
 */
import { supabase } from '../../config/supabase.js';
import * as welcome from './screens/welcome.js';
import * as scanner from './screens/scanner.js';
import * as menu from './screens/menu.js';

const kioskScreen = document.getElementById('kiosk-screen');

// Registry of SPA screens. Add entries here as more pages are migrated.
// `cleanup` is optional — screens with nothing to unmount (no timers,
// no document-level listeners, no open overlays) can omit it. All
// three registered screens currently define one.
const screens = {
  welcome: {
    html: welcome.html,
    init: welcome.init,
    cleanup: welcome.cleanup,
    css: './screens/welcome.css',
  },
  scanner: {
    html: scanner.html,
    init: scanner.init,
    cleanup: scanner.cleanup,
    css: './screens/scanner.css',
  },
  menu: {
    html: menu.html,
    init: menu.init,
    cleanup: menu.cleanup,
    css: './screens/menu.css',
  },
};

const loadedStylesheets = new Set();

function ensureStylesheet(href) {
  if (!href || loadedStylesheets.has(href)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load stylesheet: ${href}`));
    document.head.appendChild(link);
    loadedStylesheets.add(href);
  });
}

const loadedScripts = new Set();

// Same load-once caching as ensureStylesheet() above, but for external
// <script> tags — needed by screens/menu.js, which depends on the Vue 2
// CDN build (a global, non-ES-module script) rather than an ES import.
// Exported so any screen module can use it, not just menu.js.
export function ensureScript(src) {
  if (!src || loadedScripts.has(src)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
    loadedScripts.add(src);
  });
}

let currentScreenName = null;

/**
 * Navigates to a registered SPA screen, mounting its markup into
 * #kiosk-screen and running its init().
 *
 * Before swapping the DOM, this calls the OUTGOING screen's cleanup()
 * if it defines one — this is the "unmount" step: stopping timers,
 * closing overlays, and resetting that screen's own init-guard so it
 * can be cleanly re-initialized the next time it's navigated to.
 * Screens without a cleanup() are simply left as-is; currently every
 * registered screen (welcome, scanner, menu) defines one.
 */
export async function navigate(name) {
  const screen = screens[name];
  if (!screen) {
    console.error(`kiosk.js: unknown screen "${name}"`);
    return;
  }

  const outgoing = currentScreenName ? screens[currentScreenName] : null;
  if (outgoing?.cleanup) {
    try {
      outgoing.cleanup();
    } catch (err) {
      console.error(`kiosk.js: cleanup for "${currentScreenName}" failed`, err);
    }
  }

  await ensureStylesheet(screen.css);

  kioskScreen.innerHTML = screen.html;
  // Awaited so an async init (menu.js's is, while it loads the Vue 2
  // script) fully completes before this screen is considered "current" —
  // otherwise a fast subsequent navigate() could call cleanup() while
  // init() is still mid-flight, or mount onto a #app node that's already
  // been replaced. welcome.js/scanner.js's init() aren't async, so
  // awaiting them here is a no-op and changes nothing for those screens.
  await screen.init({ supabase });

  currentScreenName = name;
}

// Exposed for convenience/debugging, and used directly by scanner.js's
// back button and welcome.js's "Self Check-In" sub-card to move between
// screens without a full-page reload. Not required for welcome's own
// internal sub-screens (buyOrder, events, wallet, lockers, etc.), which
// keep using their own openScreen()/closeScreen() exactly as before.
window.kioskNavigate = navigate;

navigate('welcome');
