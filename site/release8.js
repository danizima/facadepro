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

  // References contain project IDs only. A customer's city and object type are never copied from the example.
  if (form && (query.has('project') || query.has('compare'))) {
    const single = query.get('project'), raw = single || query.get('compare') || '';
    const ids = [...new Set(raw.split(','))];
    if (ids.length <= 3 && ids.every(id => /^[a-z0-9-]{2,60}$/.test(id))) {
      let edited = false;
      const markEdited = () => { edited = true; };
      form.addEventListener('input', markEdited, {once: true});
      form.addEventListener('change', markEdited, {once: true});
      projects().then(value => {
        const chosen = ids.map(id => value.find(p => p.id === id)).filter(Boolean);
        if (!chosen.length) return;
        const panel = document.createElement('section'); panel.className = 'request-project-context';
        panel.setAttribute('aria-label', 'Примеры для обсуждения');
        const image = document.createElement('img'); image.src = asset(chosen[0]); image.alt = ''; image.width = 160; image.height = 120;
        const copy = document.createElement('div'), label = document.createElement('p'), title = document.createElement('strong'), note = document.createElement('p'), remove = document.createElement('button');
        label.className = 'eyebrow'; label.textContent = 'Пример для вашей задачи';
        title.textContent = chosen.map(p => p.title).join(' · ');
        note.textContent = 'Менеджер увидит выбранные проекты вместе с заявкой.';
        remove.type = 'button'; remove.className = 'text-button'; remove.textContent = 'Убрать привязку ×';
        const input = document.createElement('input'); input.type = 'hidden'; input.name = 'comparedProjects'; input.value = chosen.map(p => p.id).join(',');
        remove.addEventListener('click', () => {
          panel.remove(); input.remove(); form.dispatchEvent(new Event('input', {bubbles: true}));
          const url = new URL(location.href); url.searchParams.delete('project'); url.searchParams.delete('compare');
          try { if (window.facadeUpdateSearch) window.facadeUpdateSearch(url.searchParams.toString()); else history.replaceState(null, '', url); } catch {}
          form.querySelector('input[name=service]')?.focus();
        });
        if (single && !edited && !query.has('service') && !query.has('solution')) {
          form.querySelectorAll('input[name=service]').forEach(el => { el.checked = chosen[0].serviceIds?.includes(el.value) || false; });
          note.textContent += ' Направления отмечены — их можно изменить.';
        }
        copy.append(label, title, note, remove); panel.append(image, copy); form.prepend(panel); form.append(input);
        form.dispatchEvent(new Event('change', {bubbles: true}));
      }).catch(() => {});
    }
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
