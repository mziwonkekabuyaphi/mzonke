/**
 * kiosk.js
 *
 * Minimal SPA loader for the Rands kiosk.
 *
 * This is intentionally small right now: it knows how to mount a screen's
 * HTML into #kiosk-screen, load that screen's stylesheet once, and run
 * that screen's init() logic once. It is NOT a full router yet — there is
 * only one registered screen (welcome). Scanner / Menu / Payment / Gate
 * and the rest of the kiosk pages have not been converted and continue to
 * be reached the same way they always were (window.location.href to their
 * own standalone .html pages), untouched.
 *
 * Same relative path as the original kiosk-start.html used
 * (`../config/supabase.js`), since this file lives in the same directory
 * kiosk-start.html used to. If your project's config/supabase.js lives
 * somewhere else relative to index.html, update this one import path.
 */
import { supabase } from '../config/supabase.js';
import * as welcome from './screens/welcome.js';

const kioskScreen = document.getElementById('kiosk-screen');

// Registry of SPA screens. Add entries here as more pages are migrated.
const screens = {
  welcome: {
    html: welcome.html,
    init: welcome.init,
    css: './screens/welcome.css',
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

let currentScreenName = null;

/**
 * Navigates to a registered SPA screen, mounting its markup into
 * #kiosk-screen and running its init() once.
 *
 * NOTE: there is no unmount/cleanup step yet (no screen currently gets
 * replaced by another SPA screen, since only "welcome" exists). Screens
 * are responsible for guarding their own init() against double-running,
 * as welcome.js does.
 */
export async function navigate(name) {
  const screen = screens[name];
  if (!screen) {
    console.error(`kiosk.js: unknown screen "${name}"`);
    return;
  }

  await ensureStylesheet(screen.css);

  kioskScreen.innerHTML = screen.html;
  screen.init({ supabase });

  currentScreenName = name;
}

// Exposed for convenience/debugging; not required for the welcome screen
// itself, which uses its own internal openScreen()/closeScreen() for its
// sub-screens (buyOrder, events, wallet, lockers, etc.) exactly as before.
window.kioskNavigate = navigate;

navigate('welcome');
