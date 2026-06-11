/* ============================================================
   SHARED BOTTOM NAVIGATION — Rands Vibe
   Uses Font Awesome icons instead of emojis.
   Reads data-section from <body> to apply Red Pill active tab.
   Works for current pages and any future pages that share
   a data-section value.
   ============================================================ */

(function () {
    'use strict';

    /* Navigation items — order matches visual left-to-right
       Now using Font Awesome icon classes instead of emojis */
    var NAV_ITEMS = [
        { section: 'tickets',  href: 'tickets.html',       icon: '<i class="fas fa-ticket-alt"></i>', label: 'Tickets' },
        { section: 'vvip',     href: 'vvip.html',          icon: '<i class="fas fa-crown"></i>',       label: 'VVIP'    },
        { section: 'order',    href: 'order.html',         icon: '<i class="fas fa-utensils"></i>',    label: 'Order'   },
        { section: 'shisha',   href: 'shisha.html',        icon: '<i class="fas fa-smoking"></i>',     label: 'Shisha'  },
        { section: 'vault',    href: 'lockers-vault.html', icon: '<i class="fas fa-lock"></i>',        label: 'Vault'   }
    ];

    /* ----------------------------------------------------------
       Build the nav markup and inject it into #bottomNavContainer
       (or the element passed in).
    ---------------------------------------------------------- */
    function buildNav(container) {
        /* Determine the active section from the body attribute.
           Falls back gracefully to empty string (no tab active). */
        var currentSection = (document.body.getAttribute('data-section') || '').trim().toLowerCase();

        var navEl = document.createElement('nav');
        navEl.className = 'bottom-nav';
        navEl.setAttribute('aria-label', 'Main navigation');

        var inner = document.createElement('div');
        inner.className = 'bottom-nav__inner';

        NAV_ITEMS.forEach(function (item) {
            var isActive = (item.section === currentSection);

            var btn = document.createElement('a');
            btn.className = 'bottom-nav__item' + (isActive ? ' is-active' : '');
            btn.setAttribute('href', item.href);
            btn.setAttribute('aria-label', item.label);
            btn.setAttribute('aria-current', isActive ? 'page' : 'false');

            /* Pill background */
            var pill = document.createElement('span');
            pill.className = 'bottom-nav__pill';
            pill.setAttribute('aria-hidden', 'true');

            /* Icon — Font Awesome HTML (no emoji) */
            var icon = document.createElement('span');
            icon.className = 'bottom-nav__icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.innerHTML = item.icon;   // Now uses innerHTML for Font Awesome

            /* Label */
            var label = document.createElement('span');
            label.className = 'bottom-nav__label';
            label.textContent = item.label;

            btn.appendChild(pill);
            btn.appendChild(icon);
            btn.appendChild(label);
            inner.appendChild(btn);
        });

        navEl.appendChild(inner);

        /* Clear any legacy HTML that may have been fetched before */
        container.innerHTML = '';
        container.appendChild(navEl);

        /* Inject the spacer once, right before the container,
           only if it isn't already present on the page. */
        if (!document.querySelector('.bottom-nav-spacer')) {
            var spacer = document.createElement('div');
            spacer.className = 'bottom-nav-spacer';
            container.parentNode.insertBefore(spacer, container);
        }
    }

    /* ----------------------------------------------------------
       Public init — called automatically on DOMContentLoaded,
       but also exposed as window.initBottomNav() so pages that
       load content asynchronously can call it manually.
    ---------------------------------------------------------- */
    function init() {
        /* Support both id variants found across the five pages */
        var container =
            document.getElementById('bottomNavContainer') ||
            document.getElementById('bottom-nav-container');

        if (!container) return;

        buildNav(container);
    }

    /* Expose for manual call (order.html already does this) */
    window.initBottomNav = init;

    /* Auto-run as soon as the DOM is ready */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
