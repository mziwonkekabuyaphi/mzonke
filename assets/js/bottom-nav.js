(function() {
    function getBasePath() {
        // Get current page's directory (e.g., /passport/)
        let path = window.location.pathname;
        let lastSlash = path.lastIndexOf('/');
        if (lastSlash === -1) return './';
        return path.substring(0, lastSlash + 1);
    }

    function setActiveNavItem() {
        let currentFile = window.location.pathname.split('/').pop();
        if (currentFile === '' || currentFile === 'index.html' || currentFile === 'index') {
            currentFile = 'home.html';
        }
        if (currentFile.includes('?')) currentFile = currentFile.split('?')[0];
        
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            const itemUrl = item.dataset.url;
            if (itemUrl && itemUrl === currentFile) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    function closeModal(modal) {
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    function bindEvents() {
        document.body.addEventListener('click', (e) => {
            const navItem = e.target.closest('.nav-item');
            if (navItem) {
                e.preventDefault();
                const isModal = navItem.dataset.modal === 'true';
                const url = navItem.dataset.url;
                if (isModal) {
                    const modal = document.getElementById('transactModalOverlay');
                    if (modal) {
                        modal.classList.add('active');
                        document.body.style.overflow = 'hidden';
                    }
                    return;
                }
                if (url) {
                    window.location.href = url;
                }
                return;
            }

            const optionCard = e.target.closest('.transact-option-card');
            if (optionCard) {
                e.preventDefault();
                const redirect = optionCard.dataset.redirect;
                const modal = document.getElementById('transactModalOverlay');
                if (modal) closeModal(modal);
                if (redirect) {
                    setTimeout(() => {
                        window.location.href = redirect;
                    }, 150);
                }
                return;
            }

            const closeBtn = e.target.closest('#closeTransactModal');
            if (closeBtn) {
                const modal = document.getElementById('transactModalOverlay');
                closeModal(modal);
                return;
            }
        });

        document.body.addEventListener('click', (e) => {
            const modalOverlay = e.target.closest('#transactModalOverlay');
            if (modalOverlay && e.target === modalOverlay) {
                closeModal(modalOverlay);
            }
        });
    }

    function initScrollHide() {
        const bottomNav = document.getElementById('bottomNav');
        if (!bottomNav) return;
        let lastScroll = 0;
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const currentScroll = window.pageYOffset;
                    if (currentScroll <= 30) {
                        bottomNav.classList.remove('hide');
                    } else if (currentScroll > lastScroll && currentScroll > 80) {
                        bottomNav.classList.add('hide');
                    } else {
                        bottomNav.classList.remove('hide');
                    }
                    lastScroll = currentScroll;
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
        if (document.body.scrollHeight <= window.innerHeight) {
            bottomNav.classList.remove('hide');
        }
    }

    function loadAndInit() {
        const container = document.getElementById('bottomNavContainer');
        if (!container) {
            console.error('No element with id "bottomNavContainer" found on this page.');
            return;
        }
        
        // Build correct path to bottom-nav.html (same directory as current page)
        const basePath = getBasePath();
        const navHtmlPath = basePath + 'bottom-nav.html';
        
        fetch(navHtmlPath)
            .then(response => {
                if (!response.ok) throw new Error(`Failed to load ${navHtmlPath}`);
                return response.text();
            })
            .then(html => {
                container.innerHTML = html;
                setActiveNavItem();
                bindEvents();
                initScrollHide();
            })
            .catch(error => console.error('Bottom nav error:', error));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadAndInit);
    } else {
        loadAndInit();
    }
})();
