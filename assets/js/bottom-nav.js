<script>
document.addEventListener('DOMContentLoaded', () => {

    const navItems = document.querySelectorAll('.nav-item');

    // Detect current file
    let currentPage = window.location.pathname.split('/').pop();

    // Default page fallback
    if (!currentPage || currentPage === '') {
        currentPage = 'tickets.html';
    }

    // Apply persistent active state
    navItems.forEach(item => {

        const itemUrl = item.dataset.url;

        // Keep current page highlighted
        if (itemUrl === currentPage) {
            item.classList.add('active');
        }

        // Navigation
        item.addEventListener('click', () => {

            // Navigate
            if (itemUrl && itemUrl !== currentPage) {
                window.location.href = itemUrl;
            }

        });

    });

});
</script>
