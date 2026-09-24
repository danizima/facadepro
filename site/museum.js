(() => {
  'use strict';
  const root = document.querySelector('.museum-reports');
  if (!root) return;
  const filters = [...root.querySelectorAll('[data-report-year]')];
  const entries = [...root.querySelectorAll('.report-entry')];
  const periods = [...root.querySelectorAll('[data-period-year]')];
  function filter(year) {
    entries.forEach(entry => { entry.hidden = year !== 'all' && entry.dataset.year !== year; });
    periods.forEach(link => { link.hidden = year !== 'all' && link.dataset.periodYear !== year; });
    filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.reportYear === year)));
    root.querySelector('.report-status').textContent = `Фотоотчётов: ${entries.filter(entry => !entry.hidden).length}`;
  }
  filters.forEach(button => button.addEventListener('click', () => filter(button.dataset.reportYear)));
  // Direct report links remain reachable after a year filter was selected.
  const revealHash = () => {
    const entry = entries.find(item => '#' + item.id === location.hash);
    if (entry?.hidden) { filter('all'); entry.scrollIntoView(); }
  };
  addEventListener('hashchange', revealHash);
  revealHash();
  const viewer = document.querySelector('.report-viewer');
  if (!viewer?.showModal) return;
  const links = [...root.querySelectorAll('[data-report-photo]')];
  const photo = viewer.querySelector('img');
  let active = [], index = 0, opener = null, previousOverflow = '';
  function show(next) {
    index = (next + active.length) % active.length;
    const data = active[index].dataset;
    photo.src = window.facadeAsset ? window.facadeAsset(data.reportPhoto) : active[index].href;
    photo.alt = data.caption;
    viewer.querySelector('#report-viewer-title').textContent = `${data.period} · ${index + 1} / ${active.length}`;
    viewer.querySelector('.report-viewer-caption').textContent = data.caption;
    const source = viewer.querySelector('.report-viewer-source');
    source.hidden = !data.source;
    source.href = data.source || '#';
    source.textContent = `Фото: ${data.credit} · ${data.dateKind || "Публикация"} ${data.publication} ↗`;
    viewer.querySelectorAll('[data-report-step]').forEach(button => { button.hidden = active.length < 2; });
  }
  links.forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    active = links.filter(item => !item.closest('.report-entry').hidden);
    opener = link;
    show(active.indexOf(link));
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    viewer.showModal();
    viewer.querySelector('[data-report-close]').focus();
  }));
  viewer.querySelector('[data-report-close]').addEventListener('click', () => viewer.close());
  viewer.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow;
    opener?.focus({preventScroll:true});
  });
  viewer.querySelectorAll('[data-report-step]').forEach(button => button.addEventListener('click', () => show(index + Number(button.dataset.reportStep))));
  viewer.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    show(index + (event.key === 'ArrowRight' ? 1 : -1));
  });
  let gesture = null;
  const stage = viewer.querySelector('.report-viewer-stage');
  stage.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    gesture = {x:event.clientX,y:event.clientY,id:event.pointerId};
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointerup', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) show(index + (dx < 0 ? 1 : -1));
    gesture = null;
  });
  stage.addEventListener('pointercancel', () => { gesture = null; });
})();
