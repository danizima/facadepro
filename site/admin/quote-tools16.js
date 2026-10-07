'use strict';
(() => {
  const services = {glazing:'Фасадное остекление',windows:'Оконные системы',repair:'Ремонт и восстановление',engineering:'Инженерная подготовка',supply:'Производство и снабжение',height:'Работы на высоте'};
  const categories = {crew:'Бригада',equipment:'Техника',transport:'Доставка',materials:'Материалы',other:'Прочее'};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => {
    if (value === null || value === undefined || value === '') return '—';
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
    if (!match) return '—';
    return match[1] + match[2].replace(/\B(?=(\d{3})+(?!\d))/g,'\u00a0') + ',' + (match[3] || '').padEnd(2,'0') + '\u00a0₽';
  };
  const serviceChecks = () => Object.entries(services).map(([id,name])=>`<label><input type="checkbox" name="serviceIds" value="${id}"><span>${name}</span></label>`).join('');
  function markupSplit() {
    return {
      templates: `<section class="quote-templates16" data-quote-tools16-templates><h3>Шаблоны КП</h3><p class="muted">Сохранённые позиции и условия можно перенести в новый расчёт и изменить под объект.</p><div class="field-grid"><label>Направление<select id="quote-template16-filter"><option value="">Все направления</option>${Object.entries(services).map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}</select></label><label>Шаблон<select id="quote-template16-select" disabled><option value="">Загружаем шаблоны…</option></select></label></div><p id="quote-template16-preview" class="muted"></p><div class="quote-tools16-actions"><button type="button" class="lead-contact-button" id="quote-template16-apply" disabled>Перенести в конструктор</button><button type="button" class="text-button" id="quote-template16-refresh">Обновить список</button></div><details class="quote-template16-editor"><summary>Сохранить или изменить шаблон</summary><form id="quote-template16-form"><label>Название шаблона<input name="name" maxlength="100" required placeholder="Например, монтаж витража"></label><fieldset class="quote-template16-services"><legend>Направления</legend>${serviceChecks()}</fieldset><p class="muted">В шаблон сохраняются текущие позиции, цены и условия конструктора. Срок действия предложения задаётся для каждого объекта отдельно.</p><div class="quote-tools16-actions"><button class="button" type="submit">Сохранить новый шаблон</button><button type="button" class="lead-contact-button" id="quote-template16-update" disabled>Обновить выбранный</button><button type="button" class="text-button danger" id="quote-template16-delete" disabled>Убрать шаблон</button></div><div class="quote-template16-delete-confirm" id="quote-template16-delete-confirm" hidden><p>Убрать выбранный шаблон из списка? Созданные КП сохранятся.</p><div class="quote-tools16-actions"><button type="button" class="lead-contact-button danger" id="quote-template16-delete-yes">Убрать из списка</button><button type="button" class="text-button" id="quote-template16-delete-no">Отмена</button></div></div></form></details><p class="inline-status" id="quote-template16-status" role="status" aria-live="polite"></p></section>`,
      costing: `<section class="admin-panel quote-costing16" data-quote-tools16-costing><h2>Плановая экономика</h2><p class="muted">Введите цену предложения и расходы по объекту. Расчёт доступен сотрудникам.</p><form id="quote-costing16-form"><label>Цена предложения для сравнения, ₽<input name="revenue" type="number" inputmode="decimal" min="0" max="9999999999.99" step="0.01" placeholder="Укажите сумму"><small>Сумму можно оставить пустой и сохранить только расходы.</small></label><div id="quote-costing16-items" class="quote-costing16-items"></div><p id="quote-costing16-empty" class="muted">Добавьте статьи расходов по объекту.</p><button type="button" class="lead-contact-button" id="quote-costing16-add">Добавить статью расходов</button><label class="quote-costing16-note">Заметка к расчёту<textarea name="note" rows="3" maxlength="2000" placeholder="Допущения, состав бригады, сроки"></textarea></label><label class="quote-costing16-basis"><input name="basisConfirmed" type="checkbox" required><span>Цена предложения и расходы указаны на сопоставимой основе: я проверил, как учтён НДС в каждой сумме.</span></label><div class="quote-tools16-actions"><button class="button" type="submit" disabled>Сохранить расчёт</button><button type="button" class="text-button" id="quote-costing16-reload">Загрузить сохранённый расчёт</button></div><div id="quote-costing16-reload-confirm" class="quote-costing16-reload-confirm" hidden><p>Загрузить сохранённый расчёт и заменить несохранённые изменения?</p><div class="quote-tools16-actions"><button type="button" class="lead-contact-button" id="quote-costing16-reload-yes">Загрузить</button><button type="button" class="text-button" id="quote-costing16-reload-no">Отмена</button></div></div><p class="inline-status" id="quote-costing16-status" role="status" aria-live="polite"></p></form><div class="quote-costing16-result" id="quote-costing16-result" hidden><h3>Плановый результат по указанным суммам</h3><dl><dt>Цена предложения</dt><dd data-costing16-revenue></dd><dt>Плановая себестоимость</dt><dd data-costing16-total></dd><dt>Плановый результат</dt><dd data-costing16-margin></dd><dt>Доля результата в цене</dt><dd data-costing16-percent></dd></dl><p id="quote-costing16-result-note" class="muted"></p></div></section>`
    };
  }
  const markup = () => { const split=markupSplit(); return split.templates+split.costing; };
  function costRow(item={}) {
    return `<article class="quote-costing16-item"><div class="quote-costing16-item-heading"><strong>Статья <span data-costing16-number></span></strong><button type="button" class="text-button danger" data-costing16-remove>Удалить</button></div><label>Категория<select data-costing16-field="category">${Object.entries(categories).map(([id,name])=>`<option value="${id}" ${item.category===id?'selected':''}>${name}</option>`).join('')}</select></label><label>Что учитываем<input data-costing16-field="title" maxlength="300" required value="${esc(item.title||'')}" placeholder="Например, работа монтажников, человеко-дни"></label><div class="field-grid"><label>Количество<input data-costing16-field="quantity" type="number" inputmode="decimal" min="0.001" max="1000000" step="0.001" required value="${esc(item.quantity||'')}"></label><label>Цена за единицу, ₽<input data-costing16-field="unitPrice" type="number" inputmode="decimal" min="0" max="9999999999.99" step="0.01" required value="${esc(item.unitPrice??'')}"></label></div><p class="quote-costing16-row-total">Сумма статьи: <output data-costing16-total>—</output></p></article>`;
  }
  function rowTotal(row) {
    const quantity=row.querySelector('[data-costing16-field="quantity"]').value,price=row.querySelector('[data-costing16-field="unitPrice"]').value;
    if(!/^\d+(?:\.\d{1,3})?$/.test(quantity)||!/^\d+(?:\.\d{1,2})?$/.test(price))return null;
    const scaled=(value,places)=>{const[whole,fraction='']=value.split('.');return BigInt(whole)*10n**BigInt(places)+BigInt(fraction.padEnd(places,'0'));};
    const q=scaled(quantity,3),p=scaled(price,2);if(q<=0n||q>1000000000n||p>999999999999n)return null;
    const cents=(q*p+500n)/1000n;if(cents>999999999999n)return null;
    return String(cents/100n)+'.'+String(cents%100n).padStart(2,'0');
  }
  async function bind(ctx) {
    const container=ctx.container||document,query=selector=>container.querySelector(selector),current=()=>typeof ctx.current!=='function'||ctx.current();
    const message=(selector,text,error=false)=>{if(!current())return;const node=query(selector);if(node){node.textContent=text;node.classList.toggle('error',error);}};
    const api=ctx.api;if(typeof api!=='function')return;
    // A retry retains the UUID until the submitted business input changes.
    const keys=new Map(),keyFor=(operation,input)=>{const signature=JSON.stringify(input),previous=keys.get(operation);if(previous?.signature===signature)return previous.key;const next={signature,key:crypto.randomUUID()};keys.set(operation,next);return next.key;};
    const templatesRoot=query('[data-quote-tools16-templates]'),costingRoot=query('[data-quote-tools16-costing]');
    const jobs=[];
    if(templatesRoot)jobs.push(bindTemplates());
    if(costingRoot)jobs.push(bindCosting());
    await Promise.allSettled(jobs);
    async function bindTemplates() {
      const form=query('#quote-template16-form'),select=query('#quote-template16-select'),filter=query('#quote-template16-filter');
      let templates=[],selected=null,busy=false,loaded=false;
      const controls=()=>{
        select.disabled=!loaded||busy;filter.disabled=busy;
        query('#quote-template16-apply').disabled=!selected||busy;
        query('#quote-template16-update').disabled=!selected||busy;
        query('#quote-template16-delete').disabled=!selected||busy;
        query('#quote-template16-refresh').disabled=busy;
        [...form.elements].forEach(element=>{if(!['quote-template16-update','quote-template16-delete'].includes(element.id))element.disabled=busy||!loaded;});
      };
      const serviceIds=()=>[...form.querySelectorAll('[name="serviceIds"]:checked')].map(input=>input.value);
      const preview=()=>{
        const document=selected?.document;
        query('#quote-template16-preview').textContent=selected?`${(document?.items||[]).length} позиций · ${document?.tax?.mode==='none'?'Без НДС':document?.tax?.mode==='included'?'НДС включён':'НДС сверх цен'}${document?.tax?.mode==='none'?'':' · '+(document?.tax?.rate||'0')+'%'}`:templates.length?'Выберите шаблон для текущего расчёта.':'Шаблонов пока нет. Заполните конструктор и сохраните первый.';
        query('#quote-template16-delete-confirm').hidden=true;controls();
      };
      const fillSelected=()=>{
        form.elements.name.value=selected?.name||'';
        const ids=selected?.serviceIds||ctx.l?.payload?.services||[];
        form.querySelectorAll('[name="serviceIds"]').forEach(input=>input.checked=ids.includes(input.value));
        preview();ctx.markSaved?.(form);
      };
      const renderOptions=()=>{
        const matches=templates.filter(template=>!filter.value||(template.serviceIds||[]).includes(filter.value));
        const id=selected?.id||'';
        select.innerHTML='<option value="">Выберите шаблон</option>'+matches.map(template=>`<option value="${esc(template.id)}">${esc(template.name)}</option>`).join('');
        if(matches.some(template=>template.id===id))select.value=id;else{selected=null;preview();}
      };
      const reload=async()=>{
        const result=await api('/api/admin/quote-templates');if(!current())return;
        templates=result.templates||[];loaded=true;renderOptions();controls();
        if(!selected)fillSelected();
      };
      select.onchange=()=>{selected=templates.find(template=>template.id===select.value)||null;fillSelected();message('#quote-template16-status','');};
      filter.onchange=()=>{renderOptions();if(!selected)preview();ctx.refreshDirty?.();message('#quote-template16-status','');};
      query('#quote-template16-refresh').onclick=async()=>{
        const name=form.elements.name.value,ids=serviceIds();
        try{
          selected=null;await reload();if(!current())return;
          form.elements.name.value=name;form.querySelectorAll('[name="serviceIds"]').forEach(input=>input.checked=ids.includes(input.value));
          ctx.refreshDirty?.();message('#quote-template16-status','Список обновлён. Выберите шаблон заново, чтобы работать с его текущей редакцией.');
        }catch(error){message('#quote-template16-status',error.message,true);}
      };
      query('#quote-template16-apply').onclick=async()=>{
        if(!selected||busy)return;
        if(typeof ctx.applyQuoteDocument!=='function'){message('#quote-template16-status','Конструктор ещё загружается. Попробуйте снова.',true);return;}
        const applied=await ctx.applyQuoteDocument(structuredClone(selected.document));
        if(applied===false||!current())return;
        message('#quote-template16-status','Шаблон перенесён в конструктор. Проверьте объёмы, цены и условия перед созданием PDF.');
      };
      const save=async update=>{
        if(busy||!loaded||!form.reportValidity())return;
        if(update&&!selected)return;
        const document=ctx.quoteDocument?.();
        if(!document){message('#quote-template16-status','Заполните текущий расчёт в конструкторе КП.',true);return;}
        const input={name:form.elements.name.value,serviceIds:serviceIds(),document,...(update?{revision:selected.revision}:{})};
        const url='/api/admin/quote-templates'+(update?'/'+encodeURIComponent(selected.id):''),method=update?'PATCH':'POST';
        const body={...input,idempotency:keyFor(method+url,input)};
        busy=true;controls();message('#quote-template16-status','Сохраняем шаблон…');
        try{
          const result=await api(url,{method,body});if(!current())return;
          selected=result.template;filter.value='';await reload();if(!current())return;fillSelected();
          ctx.markSaved?.(form);message('#quote-template16-status',update?'Шаблон обновлён.':'Шаблон сохранён.');
        }catch(error){message('#quote-template16-status',error.statusCode===409?error.message+' Введённые данные сохранены в форме.':error.message,true);}
        finally{busy=false;if(current())controls();}
      };
      form.onsubmit=event=>{event.preventDefault();void save(false);};
      query('#quote-template16-update').onclick=()=>void save(true);
      query('#quote-template16-delete').onclick=()=>{query('#quote-template16-delete-confirm').hidden=false;};
      query('#quote-template16-delete-no').onclick=()=>{query('#quote-template16-delete-confirm').hidden=true;};
      query('#quote-template16-delete-yes').onclick=async()=>{
        if(!selected||busy)return;
        const url='/api/admin/quote-templates/'+encodeURIComponent(selected.id),input={revision:selected.revision},body={...input,idempotency:keyFor('DELETE'+url,input)};
        busy=true;controls();
        try{await api(url,{method:'DELETE',body});if(!current())return;selected=null;await reload();if(!current())return;fillSelected();message('#quote-template16-status','Шаблон убран из списка.');}
        catch(error){message('#quote-template16-status',error.message,true);}
        finally{busy=false;if(current())controls();}
      };
      controls();try{await reload();}catch(error){if(!current())return;select.innerHTML='<option value="">Список недоступен</option>';message('#quote-template16-status',error.message,true);}
    }
    async function bindCosting() {
      const form=query('#quote-costing16-form'),items=query('#quote-costing16-items'),result=query('#quote-costing16-result'),base='/api/admin/leads/'+encodeURIComponent(ctx.id)+'/costing';
      let saved=null,busy=false,dirty=false;
      const refreshRows=()=>{
        [...items.children].forEach((row,index)=>{row.querySelector('[data-costing16-number]').textContent=String(index+1);row.querySelector('[data-costing16-total]').textContent=money(rowTotal(row));});
        query('#quote-costing16-empty').hidden=items.children.length>0;
        query('#quote-costing16-add').disabled=busy||items.children.length>=50;
      };
      const controls=()=>{[...form.elements].forEach(element=>element.disabled=busy||!saved);refreshRows();};
      const changed=()=>{dirty=true;result.hidden=true;message('#quote-costing16-status','Сохраните изменения, чтобы обновить результат.');refreshRows();ctx.refreshDirty?.();};
      const add=item=>{
        if(items.children.length>=50)return;
        items.insertAdjacentHTML('beforeend',costRow(item));
        items.lastElementChild.querySelector('[data-costing16-remove]').onclick=event=>{if(busy)return;event.currentTarget.closest('.quote-costing16-item').remove();changed();};refreshRows();
      };
      const showResult=data=>{
        result.hidden=false;
        result.querySelector('[data-costing16-revenue]').textContent=money(data.revenue);
        result.querySelector('[data-costing16-total]').textContent=money(data.totalCost);
        const margin=result.querySelector('[data-costing16-margin]');margin.textContent=money(data.plannedMargin);margin.classList.toggle('quote-costing16-negative',/^\-/.test(String(data.plannedMargin)));
        result.querySelector('[data-costing16-percent]').textContent=data.marginPercent===null||data.marginPercent===undefined?'—':String(data.marginPercent).replace('.',',')+'%';
        query('#quote-costing16-result-note').textContent=data.revenue===''||data.revenue===null?'Укажите цену предложения, чтобы увидеть плановый результат.':data.revenue==='0.00'?'Доля результата не рассчитывается при нулевой цене.':data.updatedAt?'Расчёт сохранён '+new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'}).format(new Date(data.updatedAt))+'.':'Расчёт по сохранённым данным.';
      };
      const fill=data=>{
        saved=data;items.replaceChildren();for(const item of data.costs||[])add(item);
        form.elements.revenue.value=data.revenue??'';form.elements.note.value=data.note||'';form.elements.basisConfirmed.checked=false;
        dirty=false;query('#quote-costing16-reload-confirm').hidden=true;controls();
        if(data.revision>0)showResult(data);else result.hidden=true;ctx.markSaved?.(form);
      };
      const reload=async()=>{const data=await api(base);if(current()){fill(data);message('#quote-costing16-status',data.revision>0?'Сохранённый расчёт загружен.':'');}};
      form.oninput=()=>{if(!busy)changed();};form.onchange=()=>{if(!busy)changed();};
      query('#quote-costing16-add').onclick=()=>{if(busy||!saved)return;add();changed();items.lastElementChild?.querySelector('[data-costing16-field="title"]').focus();};
      query('#quote-costing16-reload').onclick=()=>{if(dirty){query('#quote-costing16-reload-confirm').hidden=false;return;}void reload().catch(error=>message('#quote-costing16-status',error.message,true));};
      query('#quote-costing16-reload-no').onclick=()=>{query('#quote-costing16-reload-confirm').hidden=true;};
      query('#quote-costing16-reload-yes').onclick=()=>void reload().catch(error=>message('#quote-costing16-status',error.message,true));
      form.onsubmit=async event=>{
        event.preventDefault();if(busy||!saved||!form.reportValidity())return;
        const body={revision:saved.revision,basis:'comparable',revenue:form.elements.revenue.value,costs:[...items.children].map(row=>Object.fromEntries([...row.querySelectorAll('[data-costing16-field]')].map(input=>[input.dataset.costing16Field,input.value]))),note:form.elements.note.value};
        busy=true;controls();message('#quote-costing16-status','Сохраняем расчёт…');
        try{const data=await api(base,{method:'PUT',body});if(!current())return;await ctx.sync?.(data);if(!current())return;saved=data;dirty=false;showResult(data);query('#quote-costing16-reload-confirm').hidden=true;ctx.markSaved?.(form);message('#quote-costing16-status','Расчёт сохранён.');}
        catch(error){message('#quote-costing16-status',error.statusCode===409?error.message+' Введённые данные сохранены в форме. Загрузите сохранённый расчёт, когда будете готовы заменить изменения.':error.message,true);}
        finally{busy=false;if(current())controls();}
      };
      controls();try{await reload();}catch(error){message('#quote-costing16-status',error.message,true);query('#quote-costing16-reload').disabled=false;}
    }
  }
  window.facadeQuoteTools16={markup,markupSplit,bind};
})();
