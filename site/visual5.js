'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const all = selector => Array.from(document.querySelectorAll(selector));
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const asset = key => window.facadeAsset?.(key) || document.body.dataset.base + (key.startsWith('media/') ? key : 'assets/' + key + '.webp');

  const tabs = all('[data-hero-tab]');
  if (tabs.length) {
    let index = 0;
    function show(next, focus = false) {
      index = (next + tabs.length) % tabs.length;
      tabs.forEach((tab, i) => {
        tab.setAttribute('aria-selected', String(i === index));
        tab.tabIndex = i === index ? 0 : -1;
        document.getElementById(tab.getAttribute('aria-controls')).hidden = i !== index;
      });
      $('.architecture-count').textContent = `${String(index + 1).padStart(2, '0')} / ${String(tabs.length).padStart(2, '0')}`;
      if (focus) tabs[index].focus({preventScroll: true});
    }
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => show(i));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        show(event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : index + (event.key === 'ArrowRight' ? 1 : -1), true);
      });
    });
    $('[data-hero-prev]').addEventListener('click', () => show(index - 1));
    $('[data-hero-next]').addEventListener('click', () => show(index + 1));
  }

  // Progressive enhancement: everything stays visible without JavaScript.
  if ('IntersectionObserver' in window && !motion.matches) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, {threshold: 0.07, rootMargin: '0px 0px 35px 0px'});
    all('.section-heading,.visual-projects .project-card,.visual-service,.case-narrative-story article,.case-photo-essay figure,.resource,.steps article,.portfolio-invitation h2').forEach(element => {
      if (element.getBoundingClientRect().top < innerHeight - 30) return;
      element.classList.add('will-reveal');
      observer.observe(element);
    });
    motion.addEventListener('change', event => {
      if (!event.matches) return;
      all('.will-reveal').forEach(element => element.classList.add('is-visible'));
      observer.disconnect();
    });
    addEventListener('beforeprint', () => all('.will-reveal').forEach(element => element.classList.add('is-visible')));
    document.addEventListener('focusin', event => event.target.closest('.will-reveal')?.classList.add('is-visible'));
  }

  const comparison = $('.photo-comparison');
  if (comparison) {
    const range = $('.comparison-control input');
    const before = $('.comparison-before img');
    const label = $('.before-label');
    function update(value) {
      range.value = String(Math.max(0, Math.min(100, Math.round(value))));
      comparison.style.setProperty('--split', range.value + '%');
      range.setAttribute('aria-valuetext', `${range.value}% — ${label.textContent.toLocaleLowerCase('ru')}`);
    }
    all('[data-compare-image]').forEach(button => button.addEventListener('click', () => {
      all('[data-compare-image]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      label.textContent = button.textContent;
      before.src = asset(button.dataset.compareImage);
      before.alt = button.textContent + ' здания ресторана';
      update(range.value);
    }));
    range.addEventListener('input', () => update(range.value));
    comparison.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      update(event.key === 'Home' ? 0 : event.key === 'End' ? 100 : Number(range.value) + (event.key === 'ArrowRight' ? 5 : -5));
    });
    let drag = null;
    const position = x => {const rect = comparison.getBoundingClientRect(); update((x - rect.left) / rect.width * 100);};
    comparison.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      drag = {id: event.pointerId, x: event.clientX, y: event.clientY, active: event.pointerType === 'mouse'};
      comparison.setPointerCapture(event.pointerId);
      if (drag.active) position(event.clientX);
    });
    comparison.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = Math.abs(event.clientX - drag.x), dy = Math.abs(event.clientY - drag.y);
      if (!drag.active && dx > 8 && dx > dy * 1.2) drag.active = true;
      if (drag.active) position(event.clientX);
    });
    comparison.addEventListener('pointerup', event => {
      if (drag?.id === event.pointerId && (drag.active || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8)) position(event.clientX);
      drag = null;
    });
    comparison.addEventListener('pointercancel', () => drag = null);
    comparison.addEventListener('dragstart', event => event.preventDefault());
    update(range.value);
  }

  const actions = $('.mobile-actions');
  if (actions) {
    const update = () => actions.classList.toggle('keyboard-hidden', Boolean(document.activeElement?.matches('input,textarea,select,[contenteditable=true]')));
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', () => requestAnimationFrame(update));
  }
})();
