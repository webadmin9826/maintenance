<script>
// site-chrome.js
(function(){
  // Exclude a page by adding: <meta name="no-chrome" content="1">
  const NO_CHROME = document.querySelector('meta[name="no-chrome"][content="1"]');
  if (NO_CHROME) return;

  const headerURL = '/header.html';
  const footerURL = '/footer.html';

  function ensureMount(id, position) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      if (position === 'top') document.body.insertBefore(el, document.body.firstChild);
      else document.body.appendChild(el);
    }
    return el;
  }

  function setActiveNav() {
    const links = document.querySelectorAll('.site-header .nav a[href]');
    const here = location.pathname.replace(/\/+$/, '') || '/';
    links.forEach(a => {
      try{
        const href = new URL(a.getAttribute('href'), location.origin).pathname.replace(/\/+$/,'');
        if (href && (here === href || (href !== '/' && here.startsWith(href)))) a.classList.add('active');
      }catch{}
    });
  }

  async function inject(url, mountId, position) {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) throw new Error('Fetch failed: ' + url);
      const html = await r.text();
      const mount = ensureMount(mountId, position);
      mount.innerHTML = html;
      if (mountId === 'app-header') setActiveNav();
      if (mountId === 'app-footer') {
        const y = mount.querySelector('#site-year');
        if (y) y.textContent = new Date().getFullYear();
      }
    } catch (e) {
      console.warn('[site-chrome]', e.message || e);
    }
  }

  // Safety: if this script is accidentally included on the student tracker, bail out.
  const title = (document.title || '').toLowerCase();
  const path = location.pathname.toLowerCase();
  const isStudentTracker = title.includes('track request — registrar') || /student[-]?tracker/.test(path);
  if (isStudentTracker) return;

  const init = () => { inject(headerURL, 'app-header', 'top'); inject(footerURL, 'app-footer', 'bottom'); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
</script>
