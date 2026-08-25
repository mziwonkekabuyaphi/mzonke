// ============================================
// ROUTER — hash-based SPA router
// Works on any static host, no server rewrite rules needed.
// ============================================

const routes = new Map(); // path -> { fragment: url, module: () => import(...) }
let currentPage = null;   // the currently mounted page module instance
let navToken = 0;         // guards against race conditions if user navigates fast

export function registerRoute(path, { fragment, module }) {
    routes.set(path, { fragment, module });
}

function getPathFromHash() {
    // '#/order' -> 'order'
    const hash = location.hash || '';
    return hash.startsWith('#/') ? hash.slice(2) : hash.replace('#', '');
}

async function loadFragment(url) {
    const res = await fetch(url, { cache: 'force-cache' }); // fragments are static, safe to cache
    if (!res.ok) throw new Error(`Fragment not found: ${url}`);
    return res.text();
}

async function render(path) {
    const myToken = ++navToken;
    const route = routes.get(path) || routes.get('404');
    if (!route) {
        console.error(`No route registered for "${path}" and no 404 route defined.`);
        return;
    }

    // Tear down the outgoing page BEFORE swapping DOM — clears its
    // intervals / realtime channels / event listeners so nothing leaks.
    if (currentPage?.destroy) {
        try { currentPage.destroy(); } catch (err) { console.error('Page destroy() error:', err); }
    }
    currentPage = null;

    const container = document.getElementById('app-content');
    container.innerHTML = '<div class="page-loading">Loading…</div>';

    try {
        const [html, mod] = await Promise.all([
            loadFragment(route.fragment),
            route.module()
        ]);

        // If the user navigated again while this was loading, abandon this render.
        if (myToken !== navToken) return;

        container.innerHTML = html;

        const pageModule = mod.default;
        if (pageModule?.init) await pageModule.init();
        currentPage = pageModule;

        updateActiveNavItem(path);
        window.scrollTo(0, 0);
    } catch (err) {
        console.error(`Failed to render route "${path}":`, err);
        if (myToken === navToken) {
            container.innerHTML = '<div class="page-loading">Something went wrong loading this page.</div>';
        }
    }
}

// Routes that hide the shared bottom nav — either because the old
// multi-page version never included it (home), or because it's a
// standalone flow rather than a tab-bar destination (pay-now,
// festival-banner, payment-success — none of the original static pages
// embedded the nav).
// 'order' used to be in this set because its fixed cart-bar footer would
// collide with the nav. That footer is gone now — Track/cart-summary/Pay
// moved into the sticky .order-status-bar under the header — so the order
// page is free to show the shared bottom nav like any other tab.
const NAV_HIDDEN_ROUTES = new Set(['home', 'pay-now', 'festival-banner', 'payment-success']);

function updateActiveNavItem(path) {
    document.querySelectorAll('#bottom-nav .bottom-nav__item').forEach(el => {
        el.classList.toggle('is-active', el.dataset.link === path);
    });
    document.body.classList.toggle('nav-hidden', NAV_HIDDEN_ROUTES.has(path));
}

export function navigate(path) {
    // Setting the hash triggers 'hashchange' below, which calls render().
    // If the hash is already what we want (e.g. re-tapping the same nav
    // item), force a render manually since hashchange won't fire.
    if (getPathFromHash() === path) {
        render(path);
    } else {
        location.hash = `#/${path}`;
    }
}

window.addEventListener('hashchange', () => render(getPathFromHash()));

export function initRouter(defaultPath = 'home') {
    // Global click delegation: any element with data-link="order" navigates,
    // instead of window.location.href — this is the one-line swap you make
    // in each page's old `onclick="window.location.href='order.html'"`.
    document.body.addEventListener('click', (e) => {
        const link = e.target.closest('[data-link]');
        if (!link) return;
        e.preventDefault();
        navigate(link.dataset.link);
    });

    const initialPath = getPathFromHash() || defaultPath;
    if (!location.hash) location.hash = `#/${defaultPath}`;
    else render(initialPath);
}
