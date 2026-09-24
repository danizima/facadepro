"""Task landing pages, contractor package and a public release history."""
import json


def tasks(g):
    return json.loads((g['ROOT']/'source/tasks9.json').read_text())


def task_links(g,base='',service=None):
    solutions=json.loads((g['ROOT']/'source/solutions.json').read_text())
    allowed={s['id'] for s in solutions if not service or service in s['services']}
    rows=[t for t in tasks(g) if t['id'] in allowed]
    return ('<section class="section task-links"><div class="section-heading"><div><p class="eyebrow">С чего начать</p>'
            '<h2>Какая у вас задача?</h2></div><p>Выберите ситуацию — расскажем о подходе и подготовке.</p></div><div class="task-link-grid">'
            +''.join(f'<a href="{base}tasks/{t["id"]}.html"><span>{g["e"](t["title"])}</span>{g["ARROW"]}</a>' for t in rows)+'</div></section>')


def enhance(g,route,body):
    if route in ('index.html','services.html'):
        marker='<section class="section faq'
        section=task_links(g)
        at=body.find(marker)
        body=body[:at]+section+body[at:] if at>=0 else body+section
    if route.startswith('services/'):
        body+=task_links(g,'../',route.split('/')[-1][:-5])
    if route=='contractors.html':
        section=('<section class="section kit-promo"><div><p class="eyebrow">Для знакомства и согласования</p>'
                 '<h2>Материалы о компании —<br>одним пакетом.</h2><p>Карточка с реквизитами, выбранные проекты и доступные документы. '
                 'Соберите то, что нужно вашей команде.</p></div>'+g['button']('Собрать пакет подрядчика','kit.html')+'</section>')
        end=body.find('</section>')+len('</section>')
        body=body[:end]+section+body[end:]
    return body


def pages(g):
    e,button=g['e'],g['button']
    solutions={s['id']:s for s in json.loads((g['ROOT']/'source/solutions.json').read_text())}
    for task in tasks(g):
        s=solutions[task['id']];url='../request.html?solution='+task['id']
        project=g['PBY'].get(task['image'])
        body='<section class="page-intro task-intro"><nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="../index.html">Главная</a><span>/</span><a href="../services.html">Услуги</a></nav><p class="eyebrow">'+e(task['title'])+'</p><h1>'+e(task['heading'])+'</h1><div class="task-lead"><p>'+e(task['lead'])+'</p>'+button('Обсудить задачу',url)+'</div></section>'
        if project:
            body+='<figure class="task-cover">'+g['img'](project['images'][0],project['title'],'../')+'<figcaption><a href="../projects/'+project['id']+'.html">В портфолио: '+e(project['title'])+' ↗</a></figcaption></figure>'
        body+='<section class="section service-detail task-scope"><div><p class="eyebrow">Состав работ</p><h2>От задачи к решению.</h2><ul class="numbered-list">'+''.join(f'<li><span>0{i+1}</span>{e(item)}</li>' for i,item in enumerate(task['scope']))+'</ul><p class="task-note">Точный состав, стоимость и сроки определяются после изучения исходных данных и закрепляются в договоре.</p></div><aside class="brief-panel"><p class="eyebrow">Для первого разговора</p><h3>Что подготовить</h3><ul>'+''.join('<li>'+e(x)+'</li>' for x in s['inputs'])+'</ul><p>Если данных пока мало, начнём с описания.</p>'+button('Передать материалы',url)+'</aside></section>'
        steps=[('Знакомимся с объектом','Вы описываете задачу и передаёте доступные фотографии или чертежи.'),('Уточняем условия','Обсуждаем объём, доступ, исходные решения и необходимость обследования.'),('Согласуем предложение','Фиксируем состав работ, порядок выполнения и условия для вашего объекта.')]
        body+='<section class="section task-process"><p class="eyebrow">Порядок взаимодействия</p><h2>Понятный следующий шаг.</h2><div class="task-steps">'+''.join(f'<article><span>0{i+1}</span><h3>{title}</h3><p>{text}</p></article>' for i,(title,text) in enumerate(steps))+'</div></section>'
        related=[g['PBY'][key] for key in s['projects'] if key in g['PBY']][:2]
        if related:body+='<section class="section task-related"><div class="section-heading"><div><p class="eyebrow">Портфолио</p><h2>Опыт по связанным направлениям.</h2></div><p>Примеры работы с подобными системами. Задачи и состав участия указаны на странице каждого объекта.</p></div><div class="project-grid">'+''.join(g['card'](p,'../') for p in related)+'</div></section>'
        body+='<section class="section task-faq"><p class="eyebrow">До первого разговора</p><h2>Частые вопросы.</h2>'+''.join('<details><summary>'+e(q)+'</summary><p>'+e(a)+'</p></details>' for q,a in task['questions'])+'</section>'
        body+='<section class="cta-strip"><div><h2>Обсудим ваш объект?</h2><p>В заявке уже будет выбрана эта задача.</p></div>'+button('Подготовить заявку',url)+'</section>'
        schema={'@context':'https://schema.org','@type':'Service','name':task['title'],'description':task['lead'],'provider':{'@type':'Organization','name':'ФАСАД.PRO','url':'https://facadepro.ru/'},'areaServed':'Россия'}
        body+='<script type="application/ld+json">'+json.dumps(schema,ensure_ascii=False).replace('<','\\u003c')+'</script>'
        g['page']('tasks/'+task['id']+'.html',task['title'],task['lead'],body,'services')
    body=g['intro']('Для вашей команды','Пакет подрядчика.','Соберите реквизиты, портфолио подходящих объектов и опубликованные документы в один архив. Без регистрации.')
    body+='''<section class="section kit-section"><form id="contractor-kit" class="kit-form js-only"><div class="kit-options"><fieldset><legend><span>01</span> Карточка компании</legend><label class="kit-check"><input type="checkbox" name="profile" checked><span><strong>Реквизиты и контакты</strong><small>Юридическое лицо, офисы, команда и техника — в PDF.</small></span></label></fieldset><fieldset><legend><span>02</span> Портфолио объектов</legend><p>Выберите проекты для общего PDF. Можно оставить раздел пустым.</p><div class="kit-projects" data-kit-projects></div></fieldset><fieldset><legend><span>03</span> Документы</legend><div data-kit-documents><p>Загружаем доступные материалы…</p></div><p class="kit-document-note">Нужны дополнительные сведения? <a href="request.html?intent=documents">Запросить у менеджера ↗</a></p></fieldset></div><aside class="kit-summary"><p class="eyebrow">Ваша подборка</p><h2>Всё нужное —<br>в одном архиве.</h2><p data-kit-count>Проверяем доступные материалы…</p><p>Портфолио и карточка создаются из актуальных данных сайта. Документы добавляются в исходном виде.</p><button class="button" type="submit" disabled>Скачать пакет ↓</button><p class="kit-status" role="status" aria-live="polite" tabindex="-1"></p><a data-kit-download hidden>Скачать ещё раз ↓</a><button class="text-button" type="button" data-kit-retry hidden>Повторить загрузку материалов</button><small>ZIP-архив. Дата формирования указана внутри.</small></aside></form><noscript><p>Для выбора материалов включите JavaScript или <a href="contacts.html">обратитесь к менеджеру</a>.</p></noscript></section>'''
    g['page']('kit.html','Пакет подрядчика','Карточка ФАСАД.PRO, выбранное портфолио и опубликованные документы для вашей команды.',body,'contractors')
    releases=json.loads((g['ROOT']/'source/releases.json').read_text())
    body=g['intro']('Сайт ФАСАД.PRO','Что нового.','Текущая версия сайта — '+g['VERSION']+'. Здесь собраны основные изменения для посетителей.')
    body+='<section class="section release-list">'+''.join('<article><div><span class="release-number">'+e(r['version'])+'</span><p>'+e(r['date'])+'</p>'+('<span class="release-current">Текущая версия</span>' if r['version']==g['VERSION'] else '')+'</div><div><h2>'+e(r['title'])+'</h2><ul>'+''.join('<li>'+e(item)+'</li>' for item in r['items'])+'</ul></div></article>' for r in releases)+'</section>'
    g['page']('updates.html','Обновления сайта','Текущая версия сайта ФАСАД.PRO и история обновлений.',body)
