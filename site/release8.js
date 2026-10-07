(() => {
  'use strict';
  const source = document.querySelector('#release8-data');
  if (!source) return;
  const data = JSON.parse(source.textContent);
  const base = document.body.dataset.base || '';
  const form = document.querySelector('#request-form');
  const query = new URLSearchParams(window.facadeQuery ?? location.search);
  const key = 'facade_compare';
  const asset = p => { const key=p.image || p.images?.[0]; return window.facadeAsset ? window.facadeAsset(key) : base + (!key ? 'assets/project-summary.svg' : key.startsWith('media/') ? key : 'assets/' + key + '.webp'); };
  let projectsPromise;
  const projects = () => projectsPromise ||= (window.facade?.offline
    ? Promise.resolve(data.projects)
    : fetch('/api/public/projects', {signal: AbortSignal.timeout(12000)}).then(r => {
      if (!r.ok) throw Error('Projects unavailable');
      return r.json();
    }).then(value => value.projects));

  const buttons = [...document.querySelectorAll('[data-select-compare]')];
  const tray = document.querySelector('.selection-tray');
  if (buttons.length && tray) {
    let available = [], selected = [];
    const read = () => {
      try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; }
      catch { return []; }
    };
    function draw(save = true) {
      selected = [...new Set(selected)].filter(id => available.some(p => p.id === id)).slice(0, 3);
      if (save) try { localStorage.setItem(key, JSON.stringify(selected)); } catch {}
      buttons.forEach(button => {
        const active = selected.includes(button.dataset.selectCompare);
        const project = available.find(p => p.id === button.dataset.selectCompare);
        button.disabled = !project || (!active && selected.length >= 3);
        button.setAttribute('aria-pressed', String(active));
        button.textContent = active ? '✓ В сравнении' : '+ В сравнение';
        if (project) button.setAttribute('aria-label', (active ? 'Убрать из сравнения: ' : 'Добавить в сравнение: ') + project.title);
      });
      tray.hidden = !selected.length;
      document.body.classList.toggle('selection-active', !!selected.length);
      tray.querySelector('[data-selection-count]').textContent = 'Выбрано: ' + selected.length + ' из 3';
      tray.querySelector('[data-selection-status]').textContent = selected.length === 1 ? 'Добавьте ещё один объект.' : selected.length === 3 ? 'Выбрано максимум три объекта.' : 'Можно добавить ещё один объект.';
      tray.querySelector('[data-selection-link]').href = base + 'compare.html?projects=' + selected.join(',');
      const chips = tray.querySelector('.selection-chips');
      chips.replaceChildren();
      selected.forEach(id => {
        const li = document.createElement('li'), button = document.createElement('button');
        const title = available.find(p => p.id === id).title;
        button.type = 'button'; button.dataset.removeSelected = id;
        button.textContent = title + ' ×'; button.setAttribute('aria-label', 'Убрать: ' + title);
        button.addEventListener('click', () => {
          selected = selected.filter(value => value !== id); draw();
          (tray.hidden ? buttons.find(b => b.dataset.selectCompare === id) : tray.querySelector('[data-selection-clear]'))?.focus({preventScroll: true});
        });
        li.append(button); chips.append(li);
      });
    }
    buttons.forEach(button => button.addEventListener('click', () => {
      const id = button.dataset.selectCompare;
      if (selected.includes(id)) selected = selected.filter(value => value !== id);
      else if (selected.length < 3) selected.push(id);
      draw();
    }));
    tray.querySelector('[data-selection-clear]').addEventListener('click', () => {
      selected = []; draw(); buttons.find(b => b.getClientRects().length)?.focus({preventScroll: true});
    });
    window.addEventListener('storage', event => {
      if (event.key === key || event.key === null) { selected = read(); draw(false); }
    });
    window.addEventListener('pageshow', () => { if (available.length) { selected = read(); draw(false); } });
    projects().then(value => { available = value; selected = read(); draw(); }).catch(() => {
      buttons.forEach(b => { b.disabled = true; b.textContent = 'Сравнение недоступно'; });
    });
  }

  // Validate the current references, including a restored draft, against public data.
  // The customer's fields remain independent from the selected example projects.
  if (form) {
    let edited = false, requested = [], state = 'ready', operation = 0, panel = null;
    const markEdited = () => { edited = true; };
    form.addEventListener('input', markEdited, {once: true});
    form.addEventListener('change', markEdited, {once: true});
    const parseIds = raw => {
      if (typeof raw !== 'string' || !raw) return [];
      const ids = [...new Set(raw.split(','))];
      return ids.length <= 3 && ids.every(id => /^[a-z0-9-]{2,60}$/.test(id)) ? ids : [];
    };
    function writeURL(ids, preserveSingle = false) {
      const url = new URL(location.href);
      url.searchParams.delete('project'); url.searchParams.delete('compare');
      if (ids.length) url.searchParams.set(preserveSingle && ids.length === 1 ? 'project' : 'compare', ids.join(','));
      try { if (window.facadeUpdateSearch) window.facadeUpdateSearch(url.searchParams.toString()); else history.replaceState(null, '', url); } catch {}
    }
    function field(ids) {
      form.querySelectorAll('input[name="comparedProjects"]').forEach(input => input.remove());
      if (!ids.length) return;
      const input = document.createElement('input'); input.type = 'hidden'; input.name = 'comparedProjects'; input.value = ids.join(','); form.append(input);
    }
    function notify() { form.dispatchEvent(new Event('change', {bubbles: true})); }
    function draw(rows = [], message = '', retry = false) {
      panel?.remove(); panel = null;
      if (!requested.length && !message) return;
      panel = document.createElement('section'); panel.className = 'request-project-context';
      panel.setAttribute('aria-label', 'Примеры для обсуждения'); panel.tabIndex = -1;
      if (rows.length) { const img = document.createElement('img'); img.src = asset(rows[0]); img.alt = ''; img.width = 160; img.height = 120; panel.append(img); }
      const copy = document.createElement('div'), label = document.createElement('p'), note = document.createElement('p');
      label.className = 'eyebrow'; label.textContent = 'Пример для вашей задачи'; copy.append(label);
      if (rows.length) { const title = document.createElement('strong'); title.textContent = rows.map(p => p.title).join(' · '); copy.append(title); }
      note.setAttribute('role', 'status'); note.textContent = message || 'Менеджер увидит выбранные проекты вместе с заявкой.'; copy.append(note);
      if (retry) { const button = document.createElement('button'); button.type = 'button'; button.className = 'text-button'; button.dataset.projectContextRetry = ''; button.textContent = 'Повторить проверку'; button.addEventListener('click', () => { projectsPromise = null; void apply(requested.join(','), {restored: true}); }); copy.append(button); }
      if (requested.length) { const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.dataset.projectContextRemove = ''; remove.textContent = 'Убрать привязку ×'; remove.addEventListener('click', () => { edited = true; operation++; requested = []; state = 'ready'; field([]); draw(); writeURL([]); notify(); form.querySelector('input[name=service]')?.focus(); }); copy.append(remove); }
      panel.append(copy); form.prepend(panel);
    }
    async function apply(raw, {restored = false, single = false} = {}) {
      const version = ++operation; if (restored) edited = true;
      requested = parseIds(raw); field(requested);
      if (!requested.length) { state = 'ready'; draw(); if (restored || raw) writeURL([]); return; }
      state = 'pending'; draw([], 'Проверяем выбранные проекты…');
      if (restored) writeURL([]);
      try {
        const available = await projects(); if (version !== operation) return;
        const chosen = requested.map(id => available.find(p => p.id === id && p.published !== false)).filter(Boolean), missing = chosen.length !== requested.length;
        requested = chosen.map(p => p.id); state = 'ready'; field(requested);
        if (single && chosen.length && !edited && !query.has('service') && !query.has('solution')) form.querySelectorAll('input[name=service]').forEach(input => { input.checked = chosen[0]?.serviceIds?.includes(input.value) || false; });
        draw(chosen, missing ? 'Часть примеров больше не опубликована. В заявке останутся только доступные проекты.' : 'Менеджер увидит выбранные проекты вместе с заявкой.');
        writeURL(requested, single && !restored); notify();
      } catch {
        if (version !== operation) return;
        state = 'failed'; draw([], 'Не удалось проверить примеры проектов. Повторите проверку или уберите привязку, чтобы продолжить.', true);
      }
    }
    form.facadeProjectContext = {restore: raw => { void apply(raw, {restored: true}); }, blocked: () => state !== 'ready'};
    if (query.has('project') || query.has('compare')) void apply(query.get('project') || query.get('compare') || '', {single: Boolean(query.get('project'))});
  }

  document.querySelectorAll('[data-preparation]').forEach(panel => {
    const items = panel.querySelector('[data-checklist-items]'), status = panel.querySelector('[data-checklist-status]');
    const checked = new Set(); let current = [];
    function draw() {
      const selected = panel.dataset.preparation ? [panel.dataset.preparation] : [...form.querySelectorAll('input[name=service]:checked')].map(el => el.value);
      current = data.services.filter(s => selected.includes(s.id)); items.replaceChildren();
      if (!current.length) { const p = document.createElement('p'); p.textContent = 'Выберите направления на первом шаге.'; items.append(p); }
      current.forEach(service => {
        const group = document.createElement('fieldset'), legend = document.createElement('legend'); legend.textContent = service.title; group.append(legend);
        service.inputs.forEach((text, index) => {
          const label = document.createElement('label'), input = document.createElement('input'), span = document.createElement('span');
          const id = service.id + ':' + index; input.type = 'checkbox'; input.checked = checked.has(id); span.textContent = text;
          input.addEventListener('change', () => { if (input.checked) checked.add(id); else checked.delete(id); status.textContent = 'Отметки помогают подготовиться и не отправляются как вложения.'; });
          label.append(input, span); group.append(label);
        }); items.append(group);
      });
      panel.querySelectorAll('.preparation-actions button').forEach(b => b.disabled = !current.length);
    }
    function text() {
      return ['ФАСАД.PRO — исходные данные для обсуждения', '', 'Соберите то, что уже есть. Недостающие данные уточним с менеджером.', '', ...current.flatMap(s => [s.title, ...s.inputs.map((t, i) => (checked.has(s.id + ':' + i) ? '[✓] ' : '[ ] ') + t), '']), 'Файлы приложите к заявке: https://facadepro.ru/request.html'].join('\n');
    }
    panel.querySelector('[data-checklist-download]').addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob(['\uFEFF' + text()], {type: 'text/plain;charset=utf-8'}));
      const link = document.createElement('a'); link.href = url; link.download = 'ФАСАД_PRO_исходные_данные.txt'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000); status.textContent = 'Список подготовлен к скачиванию.';
    });
    panel.querySelector('[data-checklist-copy]').addEventListener('click', () => copyText(text(), status));
    form?.addEventListener('change', event => { if (event.target === form || event.target.name === 'service') draw(); });
    draw();
  });
})();
