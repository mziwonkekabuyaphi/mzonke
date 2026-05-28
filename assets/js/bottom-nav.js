<script>
document.addEventListener('DOMContentLoaded', () => {

    const navItems = document.querySelectorAll('.nav-item');
    const currentPage = window.location.pathname.split('/').pop() || 'tickets.html';

    navItems.forEach(item => {

        const itemUrl = item.dataset.url;

        // Persistent active highlight
        if (itemUrl === currentPage) {
            item.classList.add('active');
        }

        // Navigation
        item.addEventListener('click', () => {

            // Remove previous active state
            navItems.forEach(nav => nav.classList.remove('active'));

            // Add active state immediately
            item.classList.add('active');

            // Navigate
            if (itemUrl) {
                window.location.href = itemUrl;
            }
        });

    });

});
</script>
