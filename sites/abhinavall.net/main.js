// v8-brutalist-map — themes, map/list toggle, QR modal, clickable pins
(function () {
  'use strict';

  const body = document.body;
  const mapSection = document.getElementById('impact-map');
  const projects = document.getElementById('projects');
  const qrModal = document.getElementById('qr-modal');
  const MODE_KEY = 'portfolio-color-mode';
  const modeToggle = document.getElementById('mode-toggle');

  function applyColorMode(mode) {
    const light = mode === 'light';
    if (light) {
      body.setAttribute('data-color-mode', 'light');
      modeToggle?.setAttribute('aria-pressed', 'true');
      modeToggle?.setAttribute('aria-label', 'Switch to kinetic mode');
      modeToggle?.setAttribute('title', 'Toggle kinetic / calm');
    } else {
      body.removeAttribute('data-color-mode');
      modeToggle?.setAttribute('aria-pressed', 'false');
      modeToggle?.setAttribute('aria-label', 'Switch to calm mode');
      modeToggle?.setAttribute('title', 'Toggle kinetic / calm');
    }
  }

  applyColorMode(localStorage.getItem(MODE_KEY) === 'light' ? 'light' : 'dark');

  modeToggle?.addEventListener('click', () => {
    const next = body.getAttribute('data-color-mode') === 'light' ? 'dark' : 'light';
    applyColorMode(next);
    localStorage.setItem(MODE_KEY, next);
  });

  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.theme === 'default') body.removeAttribute('data-theme');
      else body.setAttribute('data-theme', btn.dataset.theme);
    });
  });

  document.querySelectorAll('.hn-tab[data-view]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.hn-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const view = tab.dataset.view;
      if (view === 'map') {
        mapSection?.classList.remove('is-hidden');
        mapSection?.scrollIntoView({ behavior: 'smooth' });
      } else {
        mapSection?.classList.add('is-hidden');
        projects?.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  document.querySelectorAll('.map-pin[data-target]').forEach((pin) => {
    pin.addEventListener('click', () => {
      const articleId = pin.dataset.article;
      const onProjects = document.getElementById('projects');
      if (articleId && (!onProjects || !window.openArticle)) {
        const base = onProjects ? '' : 'projects.html';
        window.location.href = base + '#article/' + encodeURIComponent(articleId);
        return;
      }
      if (articleId && window.openArticle && window.PORTFOLIO_ARTICLES?.[articleId]) {
        document.querySelectorAll('.hn-tab').forEach((t) => t.classList.remove('active'));
        document.querySelector('.hn-tab[data-view="list"]')?.classList.add('active');
        mapSection?.classList.add('is-hidden');
        window.openArticle(articleId);
        return;
      }
      const target = document.querySelector(pin.dataset.target);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.classList.add('visible');
      target.style.outline = '3px solid var(--accent-yellow)';
      setTimeout(() => { target.style.outline = ''; }, 2000);
    });
  });

  function openQrModal() {
    if (!qrModal) return;
    qrModal.hidden = false;
    document.body.style.overflow = 'hidden';
    qrModal.querySelector('.modal-close')?.focus();
  }

  function closeQrModal() {
    if (!qrModal) return;
    qrModal.hidden = true;
    document.body.style.overflow = '';
  }

  ['connect-qr-btn', 'contact-qr-btn', 'dock-qr', 'header-resume'].forEach((id) => {
    document.getElementById(id)?.addEventListener('click', openQrModal);
  });

  qrModal?.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', closeQrModal);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && qrModal && !qrModal.hidden) closeQrModal();
  });

  document.getElementById('back-to-top')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const fadeObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          fadeObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.05, rootMargin: '0px 0px 15% 0px' }
  );

  function revealFadeUpsInView() {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    document.querySelectorAll('.fade-up:not(.visible)').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < vh * 1.15 && rect.bottom > -40) {
        el.classList.add('visible');
        fadeObserver.unobserve(el);
      }
    });
  }

  document.querySelectorAll('.fade-up').forEach((el) => fadeObserver.observe(el));
  revealFadeUpsInView();
  window.addEventListener('scroll', revealFadeUpsInView, { passive: true });
  window.addEventListener('resize', revealFadeUpsInView, { passive: true });
  window.addEventListener('load', revealFadeUpsInView);

  const counted = new Set();

  function startCountUp(el) {
    if (counted.has(el)) return;
    counted.add(el);
    const target = parseInt(el.dataset.target, 10);
    if (Number.isNaN(target)) return;
    const suffix = el.dataset.suffix || '';
    const duration = 1600;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target) + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  document.querySelectorAll('.stat-kinetic .stat-number[data-target]').forEach((el) => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          startCountUp(el);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.fade-up').forEach((el) => el.classList.add('visible'));
    document.querySelectorAll('.stat-kinetic .stat-number[data-target]').forEach((el) => {
      el.textContent = el.dataset.target + (el.dataset.suffix || '');
    });
  }
})();
