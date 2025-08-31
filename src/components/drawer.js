export function initDrawer() {
  let lastFocus=null;
  const drawer = document.getElementById('drawer');
  const btn = document.getElementById('hamburger');
  const closeBtn = document.getElementById('drawerClose');
  btn?.addEventListener('click', () => drawer?.classList.add('open'));
  closeBtn?.addEventListener('click', () => drawer?.classList.remove('open'));
  drawer?.addEventListener('click', (e) => {
    if (e.target.closest('a.nav-item')) drawer.classList.remove('open');
  });
}

  // Backdrop close
  document.addEventListener('click', (e)=>{
    const d = document.getElementById('drawer');
    if (!d) return;
    if (!d.classList.contains('open')) return;
    const asideRect = d.getBoundingClientRect();
    // if click is outside the aside width region (left of the panel), ignore; panel fills left side
    if (e.target === d && d.classList.contains('open')) d.classList.remove('open');
  });
  // ESC close
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape') document.getElementById('drawer')?.classList.remove('open');
  });
