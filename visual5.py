"""Client-facing visual release. Uses only published portfolio content."""
import json
import re
import museum
import visual10

SERVICE_VISUALS = {
    'glazing': ('museum', 'museum-facade', 'Остеклить фасад', 'Свет, геометрия и масштаб.'),
    'windows': ('novy', 'novy', 'Установить окна', 'Оконные системы для всего объекта.'),
    'repair': ('burny', 'burny', 'Восстановить фасад', 'Вернуть конструкциям рабочее состояние.'),
    'engineering': ('museum', 'museum-detail', 'Проработать решение', 'От фактических размеров к монтажу.'),
    'supply': ('brusnika', 'brusnika', 'Изготовить и поставить', 'Комплектация в ритме строительства.'),
    'height': ('museum', 'museum-facade', 'Выполнить работы на высоте', 'Доступ к сложным участкам фасада.'),
}


def image_for_service(g, service):
    project_id, key, _, _ = SERVICE_VISUALS[service['id']]
    project = g['PBY'].get(project_id)
    if not project:
        project = next((p for p in g['P'] if service['id'] in p.get('serviceIds', [])), None)
    if not project or not project['images']:
        return None
    return project, key if key in project['images'] else (project['images'] or [None])[0]


def hero(g):
    return visual10.hero(g)


def service_cards(g, base=''):
    rows = []
    for i, s in enumerate(g['S']):
        _, _, task, short = SERVICE_VISUALS[s['id']]
        photo = image_for_service(g, s)
        picture = g['img'](photo[1], s['title']+' — '+photo[0]['title'], base) if photo else '<span class="service-photo-empty" aria-hidden="true"></span>'
        rows.append(f'''<a class="visual-service" href="{base}services/{s['id']}.html"><div class="visual-service-photo">{picture}<span class="visual-service-index">0{i+1}</span><span class="visual-service-arrow">{g['ARROW']}</span></div><div class="visual-service-copy"><span class="eyebrow">{s['title']}</span><h3>{task}</h3><p>{short}</p></div></a>''')
    return '<div class="visual-services">'+''.join(rows)+'</div>'


def service_cover(g, s):
    photo = image_for_service(g, s)
    if not photo:
        return ''
    p, key = photo
    return f'<figure class="service-cover">{g["img"](key, s["title"]+" — "+p["title"], "../", True)}<figcaption><span>Из портфолио</span><a href="../projects/{p["id"]}.html">{p["title"]} {g["ARROW"]}</a></figcaption></figure>'


def home(g, original):
    out = hero(g)
    stats = re.search(r'<section class="stats".*?</section>', original, re.S)
    if stats:
        out += stats.group(0)
    out += museum.spotlight(g)
    featured = [g['PBY'][key] for key in ['museum', 'restaurant', 'brusnika', 'burny'] if key in g['PBY']]
    featured = (featured + [p for p in g['P'] if p not in featured])[:4]
    out += '<section class="section projects visual-projects" id="projects"><div class="section-heading"><div><p class="eyebrow">01 / Избранные объекты</p><h2>Архитектура.<br>Наше участие.</h2></div><div class="section-heading-note"><p>Каждый объект — своя геометрия,<br>свои условия и точное решение.</p><a class="text-button" href="projects.html">Всё портфолио '+g['ARROW']+'</a></div></div><div class="project-grid editorial-grid">'+''.join(g['card'](p, slot=i%4) for i, p in enumerate(featured))+'</div></section>'
    restaurant = g['PBY'].get('restaurant')
    if restaurant and 'restaurant-build' in restaurant['images']:
        out += f'''<section class="craft-feature"><a class="craft-feature-photo" href="projects/restaurant.html#stages">{g['img']('restaurant-build', 'Монтаж каркаса ресторана')}<span>Посмотреть этапы {g['ARROW']}</span></a><div class="craft-feature-copy"><p class="eyebrow">За каждым фасадом — работа</p><h2>От первого узла<br>до готового<br>объекта.</h2><p>Ресторан в японском стиле. Два месяца строительства, круглосуточная организация работ и несколько параллельных участков.</p><a class="text-button" href="projects/restaurant.html#stages">История одного объекта {g['ARROW']}</a></div></section>'''
    out += '<section class="section visual-services-section" id="services"><div class="section-heading"><div><p class="eyebrow">02 / Компетенции</p><h2>С какой задачей<br>вы к нам?</h2></div><div class="section-heading-note"><p>Подключимся к отдельному этапу<br>или всему фасадному комплексу.</p><a class="text-button" href="solutions.html">Подобрать решение '+g['ARROW']+'</a></div></div>'+service_cards(g)+'</section>'
    for pattern in [r'<section class="company section".*?</section>', r'<section class="workflow section".*?</section>', r'<section class="partners section".*?</section>']:
        match = re.search(pattern, original, re.S)
        if match:
            out += match.group(0)
    out += '<section class="section portfolio-invitation"><p class="eyebrow">Для первого разговора</p><h2>Соберите опыт,<br>близкий вашей задаче.</h2><div><p>Выберите объекты и получите персональное портфолио с фотографиями и составом работ.</p>'+g['button']('Собрать портфолио PDF', 'portfolio.html')+'<a class="text-button" href="map.html">Объекты на карте '+g['ARROW']+'</a></div></section>'
    return out


def comparison(g, p):
    if p['id'] != 'restaurant' or not all(k in p['images'] for k in ['restaurant', 'restaurant-frame']):
        return ''
    pairs = [('restaurant-frame', 'Каркас')]
    if 'restaurant-build' in p['images']:
        pairs.append(('restaurant-build', 'Монтаж конструкций'))
    buttons = ''.join(f'<button type="button" data-compare-image="{key}" aria-pressed="{str(i == 0).lower()}">{label}</button>' for i, (key, label) in enumerate(pairs))
    return f'''<section class="section comparison-section visual-comparison" id="stages"><div class="section-heading"><div><p class="eyebrow">Два этапа одного объекта</p><h2>От каркаса<br>к зданию.</h2></div><p class="section-intro">Выберите этап и двигайте разделитель.<br>Снимки показывают разные моменты строительства.</p></div><div class="comparison-tabs" role="group" aria-label="Этап строительства">{buttons}</div><div class="photo-comparison" tabindex="0" role="group" aria-label="Сравнение этапа строительства и готового здания">{g['img']('restaurant', 'Готовое здание ресторана', '../')}<div class="comparison-before">{g['img']('restaurant-frame', 'Каркас здания ресторана', '../')}</div><span class="comparison-label before-label">Каркас</span><span class="comparison-label after-label">Готовое здание</span><span class="comparison-handle" aria-hidden="true">↔</span></div><label class="comparison-control">Положение разделителя<input type="range" min="0" max="100" value="50" aria-label="Положение границы сравнения фотографий"></label></section>'''


def project(g, p, index):
    img, e, arrow = g['img'], g['e'], g['ARROW']
    body = f'''<section class="case-intro"><nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="../index.html">Главная</a><span>/</span><a href="../projects.html">Проекты</a></nav><div class="case-intro-top"><p class="eyebrow">{p['type']}</p><span class="case-number">{index+1:02} / {len(g['P']):02}</span></div><h1>{p['title']}</h1><div class="case-intro-bottom"><p>{p['location']}</p><a class="text-button" href="#participation">Наше участие ↓</a></div></section>'''
    if p['images']:
        thumbs = ''.join(f'<button type="button" class="gallery-thumb js-only" data-image="{j}" aria-label="Фотография {j+1}" aria-pressed="{str(j==0).lower()}">{img(key,p["title"]+f". Фото {j+1}","../")}</button>' for j,key in enumerate(p['images']))
        body += f'''<section class="project-gallery visual-gallery" data-gallery='{e(json.dumps(p['images']))}' data-title="{e(p['title'])}" aria-label="Фотографии объекта"><div class="gallery-stage" tabindex="0" role="group" aria-label="Галерея проекта. Используйте стрелки для смены фотографии">{img((p['images'] or [None])[0],p['title'],'../',True)}<button class="gallery-zoom js-only" type="button" aria-label="Увеличить фотографию">Развернуть {arrow}</button><div class="stage-gallery-controls js-only"><button type="button" data-gallery-step="-1" aria-label="Предыдущая фотография объекта">←</button><span class="gallery-position" aria-live="polite">1 / {len(p['images'])}</span><button type="button" data-gallery-step="1" aria-label="Следующая фотография объекта">→</button></div></div><div class="gallery-ribbon"><p><span class="eyebrow">{p['title']}</span><span class="gallery-hint">{'Листайте фотографии или откройте на весь экран' if len(p['images'])>1 else 'Откройте фотографию на весь экран'}</span></p><div class="gallery-thumbs">{thumbs}</div></div></section>'''
    else:
        body += '<section class="project-gallery case-summary"><p class="eyebrow">Состав нашего участия</p><p>'+e(p['work'])+'</p></section>'
    repeats_period = p['volume'].casefold() in p['period'].casefold()
    metric_label = 'Срок строительства' if repeats_period else ('Объём участия' if 'м²' in p['volume'] else 'Наше участие')
    second_label, second_value = ('Направление', p['type']) if repeats_period else ('Период / срок', p['period'])
    body += f'<section class="case-metrics"><div><span class="eyebrow">{metric_label}</span><strong>{p["volume"]}</strong></div><div><span class="eyebrow">{second_label}</span><strong>{second_value}</strong></div></section>'
    case = p.get('case', {})
    story = [(key, label) for key, label in [('task','Задача'),('challenge','Особенности объекта'),('solution','Выполненные работы')] if case.get(key)]
    if not story:
        story = [('work','Выполненные работы')]
    articles = ''.join(f'<article><span class="case-story-index">0{i+1}</span><div><h3>{label}</h3><p>{case[key] if key != "work" else p["work"]}</p></div></article>' for i, (key,label) in enumerate(story))
    facts = [('Расположение',p['location'])]+([('Заказчик',p['client'])] if p.get('client') else [])
    body += '<section class="section case-narrative" id="participation"><div class="case-narrative-heading"><p class="eyebrow">Наше участие</p><h2>За архитектурой —<br>точная работа.</h2><dl>'+''.join(f'<div><dt>{label}</dt><dd>{value}</dd></div>' for label,value in facts)+'</dl></div><div class="case-narrative-story">'+articles+'</div></section>'
    # Detail photography is genuine and remains controlled by project publication.
    details = p['images'][1:3] if p['id'] != 'restaurant' else [key for key in ['restaurant-facade','restaurant-build'] if key in p['images']]
    if details:
        body += '<section class="case-photo-essay" aria-label="Детали и этапы объекта">'+''.join(f'<figure><button type="button" data-gallery-open="{p["images"].index(key)}" aria-label="Увеличить деталь {i+1} объекта">{img(key,p["title"]+f" — деталь {i+1}","../")}</button><figcaption><span>0{i+1} / {"Этапы и детали" if p["id"]=="restaurant" else "Архитектура в деталях"}</span><span>{p["title"]}</span></figcaption></figure>' for i,key in enumerate(details))+'</section>'
    body += comparison(g, p)
    services = [s for s in g['S'] if s['id'] in p.get('serviceIds', [])]
    if services:
        body += '<section class="section case-directions"><p class="eyebrow">Направления проекта</p><div>'+''.join(f'<a href="../services/{s["id"]}.html">{s["title"]} {arrow}</a>' for s in services)+'</div></section>'
    body += f'<section class="section case-cta"><p class="eyebrow">Ваш следующий объект</p><h2>У вас похожая задача?</h2><div><p>Расскажите о конструкциях, объёме и условиях площадки. Обсудим, как организовать работы.</p>{g["button"]("Обсудить объект","../request.html",True)}<a class="text-button" href="../portfolio.html?projects={p["id"]}">Добавить объект в PDF {arrow}</a></div></section>'
    others = [x for x in g['P'] if x['id'] != p['id']]
    related = sorted(others, key=lambda x: (x['type'] != p['type'],not bool(set(x.get('serviceIds',[])) & set(p.get('serviceIds',[])))))[:2]
    if related:
        body += '<section class="section case-related"><div class="section-heading"><div><p class="eyebrow">Продолжить знакомство</p><h2>Близкий опыт.</h2></div><a class="text-button" href="../projects.html">Всё портфолио '+arrow+'</a></div><div class="project-grid">'+''.join(g['card'](x,'../') for x in related)+'</div></section>'
    dialog = '<dialog class="lightbox" aria-label="Фотографии проекта"><div class="lightbox-toolbar"><span class="lightbox-counter"></span><button type="button" class="lightbox-close" aria-label="Закрыть фотографии">Закрыть ×</button></div><img class="lightbox-image" alt=""><div class="lightbox-nav"><button type="button" data-gallery-step="-1" aria-label="Предыдущая фотография">←</button><p>Листайте фото · ← → · Esc — закрыть</p><button type="button" data-gallery-step="1" aria-label="Следующая фотография">→</button></div></dialog>'
    if not p['images']:dialog = ''
    if p['id'] == 'museum' and p['images']:
        return museum.enrich(g, p, body, dialog)
    if p['id'] == 'burny' and (p['images'] or [None])[0] == 'burny':
        body = body.replace('<section class="case-metrics">', '<p class="source-note section" style="padding-top:18px;padding-bottom:0">Фотография объекта: <a href="https://burny.ru/gallery" target="_blank" rel="noopener noreferrer">официальный сайт МФК «Бурный» ↗</a></p><section class="case-metrics">', 1)
    return body, dialog


def mobile_actions(g, base, path):
    if path in ['request.html','quote.html','portfolio.html','kit.html','updates.html']:
        return ''
    phone = re.sub(r'[^+0-9]', '', g['CFG']['phone'])
    return f'<nav class="mobile-actions" aria-label="Быстрая связь"><a href="tel:{phone}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m7 3 3 5-2 2c1.5 3 3 4.5 6 6l2-2 5 3-1 4C11 22 2 13 3 4Z"/></svg>Позвонить</a><a href="{base}request.html">Обсудить объект {g["ARROW"]}</a></nav>'
