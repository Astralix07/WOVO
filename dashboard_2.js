document.addEventListener('DOMContentLoaded', () => {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const desktopActions = document.querySelector('.header-actions-desktop');

    if (mobileMenuBtn && mobileMenu && desktopActions) {
        // Populate mobile menu with a clone of desktop actions
        mobileMenu.innerHTML = desktopActions.innerHTML;

        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            mobileMenu.classList.toggle('active');
        });

        // Close menu if clicking outside
        document.addEventListener('click', (e) => {
            if (!mobileMenu.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
                mobileMenu.classList.remove('active');
            }
        });
    }
}); 