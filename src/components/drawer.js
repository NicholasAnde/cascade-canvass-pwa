export function initDrawer() {
  const drawer = document.getElementById('drawer');
  const btn = document.getElementById('hamburger');
  const closeBtn = document.getElementById('drawerClose');
  btn?.addEventListener('click', () => drawer?.classList.add('open'));
  closeBtn?.addEventListener('click', () => drawer?.classList.remove('open'));
  drawer?.addEventListener('click', (e) => {
    if (e.target.closest('a.nav-item')) drawer.classList.remove('open');
  });
}
