// --- Common UI and State Management ---
export function initTabs() {
    const sidebar = document.querySelector('.sidebar');
    const menuToggle = document.getElementById('menuToggle');

    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    }

    document.querySelectorAll('.nav-links li').forEach(item => {
        item.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

            e.target.classList.add('active');
            const targetId = e.target.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');

            // Close the drawer after navigating on mobile.
            if (sidebar) sidebar.classList.remove('open');
        });
    });
}
