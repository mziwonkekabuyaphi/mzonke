function initBottomNav() {
    const navContainer = document.getElementById('bottomNavContainer');
    if (!navContainer) {
        console.error('Bottom nav container not found');
        return;
    }
    
    // Bottom nav HTML structure
    navContainer.innerHTML = `
        <div class="bottom-nav-wrapper" style="position: fixed; bottom: 0; left: 0; right: 0; z-index: 1000; background: white; border-top: 1px solid #eef2f8; border-radius: 30px 30px 0 0; box-shadow: 0 -4px 20px rgba(0,0,0,0.08); padding: 8px 16px 20px 16px;">
            <nav class="bottom-nav" style="max-width: 480px; margin: 0 auto;">
                <div class="nav-items" style="display: flex; justify-content: space-around; align-items: center;">
                    <div class="nav-item" data-url="tickets.html" style="text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                        <i class="fas fa-ticket-alt" style="font-size: 1.3rem; color: #94a3b8;"></i>
                        <span style="font-size: 0.7rem; font-weight: 500; color: #94a3b8;">Tickets</span>
                    </div>
                    <div class="nav-item" data-url="vvip.html" style="text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                        <i class="fas fa-crown" style="font-size: 1.3rem; color: #94a3b8;"></i>
                        <span style="font-size: 0.7rem; font-weight: 500; color: #94a3b8;">VVIP</span>
                    </div>
                    <div class="nav-item" data-url="order.html" style="text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                        <i class="fas fa-receipt" style="font-size: 1.3rem; color: #94a3b8;"></i>
                        <span style="font-size: 0.7rem; font-weight: 500; color: #94a3b8;">Order</span>
                    </div>
                    <div class="nav-item" data-url="shisha.html" style="text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                        <i class="fas fa-smoking" style="font-size: 1.3rem; color: #94a3b8;"></i>
                        <span style="font-size: 0.7rem; font-weight: 500; color: #94a3b8;">Shisha</span>
                    </div>
                    <div class="nav-item" data-url="lockers-vault.html" style="text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                        <i class="fas fa-cubes" style="font-size: 1.3rem; color: #94a3b8;"></i>
                        <span style="font-size: 0.7rem; font-weight: 500; color: #94a3b8;">Lockers</span>
                    </div>
                </div>
            </nav>
        </div>
    `;
    
    // Get current page filename (from passport folder)
    const currentPage = window.location.pathname.split('/').pop();
    
    // Add click handlers
    const navItems = document.querySelectorAll('#bottomNavContainer .nav-item');
    navItems.forEach(item => {
        const targetUrl = item.getAttribute('data-url');
        
        // Highlight active page
        if (targetUrl === currentPage) {
            const icon = item.querySelector('i');
            const label = item.querySelector('span');
            if (icon) icon.style.color = '#E30613';
            if (label) label.style.color = '#E30613';
        }
        
        // Add navigation on click
        item.addEventListener('click', () => {
            if (targetUrl && targetUrl !== currentPage) {
                window.location.href = targetUrl;
            }
        });
    });
    
    // Add padding to body to prevent content hiding behind nav
    const bottomNav = document.querySelector('.bottom-nav-wrapper');
    if (bottomNav) {
        document.body.style.paddingBottom = (bottomNav.offsetHeight + 16) + 'px';
    }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBottomNav);
} else {
    initBottomNav();
}
