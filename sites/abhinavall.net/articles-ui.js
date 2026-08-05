/* Article reader — click project cards for full overviews (abhinavall.net parity) */
(function () {
  'use strict';

  const modal = document.getElementById('article-modal');
  const titleEl = document.getElementById('article-modal-title');
  const metaEl = document.getElementById('article-modal-meta');
  const bodyEl = document.getElementById('article-modal-body');
  const sidebarEl = document.getElementById('article-modal-sidebar');
  const linksEl = document.getElementById('article-modal-links');
  const breadcrumbEl = document.getElementById('article-modal-crumb');

  function esc(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function renderSubsection(sub) {
    let html = '';
    if (sub.subheading) html += '<h4>' + esc(sub.subheading) + '</h4>';
    if (sub.paragraphs) {
      sub.paragraphs.forEach((p) => { html += '<p>' + esc(p) + '</p>'; });
    }
    if (sub.list && sub.list.length) {
      html += '<ul>' + sub.list.map((li) => '<li>' + esc(li) + '</li>').join('') + '</ul>';
    }
    if (sub.ordered && sub.ordered.length) {
      html += '<ol>' + sub.ordered.map((li) => '<li>' + esc(li) + '</li>').join('') + '</ol>';
    }
    return html;
  }

  function renderSubProjectsTimeline(items) {
    if (!items || !items.length) return '';
    let html = '<div class="article-sub-timeline"><p class="article-side-label">Sub-projects &amp; milestones</p><ol class="sub-project-timeline">';
    items.forEach((sp) => {
      html += '<li class="sub-project-item">';
      html += '<span class="sub-project-when">' + esc(sp.when) + '</span>';
      html += '<div class="sub-project-body">';
      if (sp.articleId && window.PORTFOLIO_ARTICLES?.[sp.articleId]) {
        html += '<button type="button" class="sub-project-link" data-article="' + esc(sp.articleId) + '">' + esc(sp.title) + '</button>';
      } else if (sp.href) {
        html += '<a class="sub-project-link" href="' + sp.href + '" target="_blank" rel="noopener">' + esc(sp.title) + ' ↗</a>';
      } else {
        html += '<span class="sub-project-title">' + esc(sp.title) + '</span>';
      }
      if (sp.detail) html += '<p class="sub-project-detail">' + esc(sp.detail) + '</p>';
      html += '</div></li>';
    });
    html += '</ol></div>';
    return html;
  }

  function renderSection(section) {
    let html = '';
    if (section.heading) html += '<h3>' + esc(section.heading) + '</h3>';
    if (section.paragraphs) {
      section.paragraphs.forEach((p) => { html += '<p>' + esc(p) + '</p>'; });
    }
    if (section.list && section.list.length) {
      html += '<ul>' + section.list.map((li) => '<li>' + esc(li) + '</li>').join('') + '</ul>';
    }
    if (section.ordered && section.ordered.length) {
      html += '<ol>' + section.ordered.map((li) => '<li>' + esc(li) + '</li>').join('') + '</ol>';
    }
    if (section.subsections) {
      section.subsections.forEach((sub) => { html += renderSubsection(sub); });
    }
    return html;
  }

  function renderSidebar(art) {
    if (!sidebarEl) return '';
    let html = '';
    if (art.tags && art.tags.length) {
      html += '<div class="article-side-block"><p class="article-side-label">Technologies</p><div class="article-tags">';
      art.tags.forEach((t) => { html += '<span class="article-tag">' + esc(t) + '</span>'; });
      html += '</div></div>';
    }
    if (art.stats && art.stats.length) {
      html += '<div class="article-side-block"><p class="article-side-label">Project stats</p><dl class="article-stats">';
      art.stats.forEach((s) => {
        html += '<div class="article-stat"><dt>' + esc(s.label) + '</dt><dd>' + esc(s.value) + '</dd></div>';
      });
      html += '</dl></div>';
    }
    return html;
  }

  window.openArticle = function openArticle(id, options) {
    const art = window.PORTFOLIO_ARTICLES?.[id];
    if (!art || !modal) return;
    const opts = options || {};

    if (breadcrumbEl) {
      breadcrumbEl.innerHTML = '<span>Projects</span><span aria-hidden="true">›</span><span>' + esc(art.title) + '</span>';
    }
    titleEl.textContent = art.title;
    metaEl.textContent = art.meta;
    let bodyHtml = (art.sections || []).map(renderSection).join('');
    if (art.subProjects && art.subProjects.length) {
      bodyHtml += renderSubProjectsTimeline(art.subProjects);
    }
    bodyEl.innerHTML = bodyHtml;
    if (sidebarEl) sidebarEl.innerHTML = renderSidebar(art);

    const linkItems = (art.links || []).slice();
    if (art.livePage) {
      linkItems.unshift({ label: 'View on abhinavall.net', href: art.livePage });
    }
    linksEl.innerHTML = linkItems
      .map((l) => '<a href="' + l.href + '" target="_blank" rel="noopener">' + esc(l.label) + ' ↗</a>')
      .join('');

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    if (!opts.skipHash) {
      history.replaceState(null, '', '#article/' + id);
    }
    modal.querySelector('.article-close')?.focus();
    bodyEl.scrollTop = 0;
  };

  function closeArticle() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    if (location.hash.startsWith('#article/')) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  function articleIdFromCard(card) {
    return card.dataset.article || card.id || '';
  }

  document.querySelectorAll('.project-card[data-article], .project-card[id^="project-"], .exp-card.project-card').forEach((card) => {
    if (!card.dataset.article && card.id) card.dataset.article = card.id;
    card.classList.add('is-clickable');
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    const label = card.querySelector('.project-body h3, .exp-role')?.textContent?.trim();
    if (label) card.setAttribute('aria-label', 'Open overview: ' + label);
  });

  document.addEventListener('click', (e) => {
    const subLink = e.target.closest('.sub-project-link[data-article]');
    if (subLink?.dataset.article) {
      e.preventDefault();
      window.openArticle(subLink.dataset.article);
      return;
    }
    const timelineChip = e.target.closest('.project-timeline-chip[data-article], .timeline-sub-chip[data-article]');
    if (timelineChip?.dataset.article) {
      e.preventDefault();
      window.openArticle(timelineChip.dataset.article);
      return;
    }
    const btn = e.target.closest('.read-article-btn');
    if (btn?.dataset.article) {
      e.preventDefault();
      window.openArticle(btn.dataset.article);
      return;
    }
    const card = e.target.closest('.project-card.is-clickable');
    if (!card) return;
    if (e.target.closest('a, button, input, textarea')) return;
    const id = articleIdFromCard(card);
    if (id && window.PORTFOLIO_ARTICLES?.[id]) window.openArticle(id);
  });

  document.addEventListener('keydown', (e) => {
    const card = e.target.closest('.project-card.is-clickable');
    if (card && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      const id = articleIdFromCard(card);
      if (id) window.openArticle(id);
    }
    if (e.key === 'Escape' && modal && !modal.hidden) closeArticle();
  });

  modal?.querySelectorAll('[data-close-article]').forEach((el) => {
    el.addEventListener('click', closeArticle);
  });

  const hashMatch = location.hash.match(/^#article\/(.+)$/);
  if (hashMatch && window.PORTFOLIO_ARTICLES?.[hashMatch[1]]) {
    window.openArticle(hashMatch[1], { skipHash: true });
  }

  function renderProjectTimeline() {
    const el = document.getElementById('unified-timeline-projects');
    const entries = window.PORTFOLIO_PROJECT_TIMELINE;
    if (!el || !entries?.length) return;
    el.innerHTML = entries.map((row) => {
      const hasArticle = row.id && window.PORTFOLIO_ARTICLES?.[row.id];
      const tag = row.tag ? '<span class="project-timeline-tag">' + esc(row.tag) + '</span>' : '';
      const inner = esc(row.label) + tag;
      const chip = hasArticle
        ? '<button type="button" class="project-timeline-chip" data-article="' + esc(row.id) + '">' + inner + '</button>'
        : '<span class="project-timeline-chip is-static">' + inner + '</span>';
      return (
        '<li class="timeline-item timeline-item--project">'
        + '<div class="timeline-dot timeline-dot--project" aria-hidden="true"></div>'
        + '<div class="timeline-date">' + esc(row.when) + '</div>'
        + '<div class="timeline-project-row">' + chip + '</div>'
        + '</li>'
      );
    }).join('');
  }

  renderProjectTimeline();
})();
