"""A concise homepage, building scopes and a short photo enquiry."""
import re
import release6
import visual10


def home(g, original):
    e = g['e']
    out = visual10.hero(g)
    featured = [g['PBY'][key] for key in ['museum', 'restaurant', 'brusnika', 'burny'] if key in g['PBY']]
    featured = (featured + [p for p in g['P'] if p not in featured])[:4]
    out += '<section class="section projects visual-projects home-projects" id="projects"><div class="section-heading"><div><p class="eyebrow">01 / Наш опыт</p><h2>Сложные объекты.<br>Конкретная работа.</h2></div><div class="section-heading-note"><p>Посмотрите, что мы выполнили<br>на каждом объекте.</p><a class="text-button" href="projects.html">Все проекты '+g['ARROW']+'</a></div></div><div class="project-grid editorial-grid">'+''.join(g['card'](p, slot=i) for i,p in enumerate(featured))+'</div></section>'
    out += '<section class="section home-directions" id="services"><div class="section-heading"><div><p class="eyebrow">02 / Направления</p><h2>От монтажа<br>до восстановления.</h2></div><a class="text-button" href="solutions.html">Подобрать решение '+g['ARROW']+'</a></div><div class="home-direction-grid">'+''.join('<a href="services/'+s['id']+'.html"><span class="eyebrow">0'+str(i+1)+'</span><strong>'+e(s['title'])+'</strong>'+g['ARROW']+'</a>' for i,s in enumerate(g['S']))+'</div></section>'
    for pattern in [r'<section class="company section".*?</section>', r'<section class="partners section".*?</section>']:
        match = re.search(pattern, original, re.S)
        if match:
            out += match[0]
    out += '<nav class="home-materials" aria-label="Материалы для заказчика"><a href="kit.html"><strong>Для согласования подрядчика</strong><span>Реквизиты, портфолио и документы ↗</span></a><a href="portfolio.html"><strong>Для вашей задачи</strong><span>Собрать портфолио из выбранных объектов ↗</span></a><a href="about.html#process"><strong>Для знакомства с командой</strong><span>Как организуем работу на объекте ↗</span></a></nav>'
    return out


def building_rows(project):
    """Use the editable case text as the only source; do not create a second register."""
    rows = []
    for line in project.get('case', {}).get('solution', '').splitlines():
        match = re.fullmatch(r'Дом(?:а)? (№\d+(?: и №\d+)*) — (.+)', line.strip())
        if not match:
            return []
        for number in re.findall(r'№(\d+)', match[1]):
            rows.append((number, match[2]))
    if len(rows) < 2 or len({n for n,_ in rows}) != len(rows):
        return []
    return sorted(rows, key=lambda row: int(row[0]))


def building_scope(g, project):
    rows = building_rows(project)
    if not rows:
        return ''
    e = g['e']
    return '<section class="section building-scope" id="buildings"><div class="section-heading"><div><p class="eyebrow">Работы по корпусам</p><h2>Каждый дом.<br>Свой состав работ.</h2></div><p>Откройте корпус, чтобы посмотреть подробности.</p></div><p class="building-common">'+e(project['work'])+'</p><div class="building-list">'+''.join('<details class="building-item"><summary><span>Дом №'+number+'</span><span class="building-more">Подробнее <b aria-hidden="true">+</b></span></summary><div><p>'+e(scope)+'</p></div></details>' for number,scope in rows)+'</div></section>'


def enhance(g, route, body):
    if route == 'index.html':
        body = re.sub(r'<section class="section task-links">.*?</section>', '', body, flags=re.S)
    if route == 'about.html':
        # Detailed scenarios remain available, without repeating portfolios on the home page.
        body += release6.audiences(g)
    if route.startswith('projects/'):
        project = next((p for p in g['CONTENT']['projects'] if p['id'] == route.split('/')[-1][:-5] and p.get('published', True)), None)
        if project:
            scope = building_scope(g, project)
            if scope:
                body = re.sub(r'<article><span class="case-story-index">\d+</span><div><h3>Выполненные работы</h3>.*?</article>', '', body, count=1, flags=re.S)
                marker = '<section class="section case-directions">'
                body = body.replace(marker, scope+marker, 1) if marker in body else body+scope
                body = body.replace('href="#participation">Состав работ</a>', 'href="#participation">Состав работ</a><a href="#buildings">По корпусам</a>', 1)
    if route in ('request.html', 'quote.html'):
        marker = '<section class="page-intro'
        at = body.find('</section>', body.find(marker))
        if at >= 0:
            at += len('</section>')
            body = body[:at]+'<aside class="photo-shortcut"><p>Хотите начать с фотографий?</p><a class="text-button" href="photo-request.html">Отправить фото и телефон ↗</a></aside>'+body[at:]
    return body


def photo_page(g):
    e, cfg = g['e'], g['CFG']
    phone = re.sub(r'[^+0-9]', '', cfg['phone'])
    body = '''<section class="page-intro photo-intro"><p class="eyebrow">Быстрое обращение</p><div class="intro-grid"><h1>Покажите объект.<br>Обсудим задачу.</h1><p>Добавьте фотографии фасада, окон или участка, который требует внимания. Менеджер свяжется с вами и уточнит детали.</p></div></section>
<section class="section photo-request-layout"><aside class="photo-guidance"><p class="eyebrow">Что сфотографировать</p><ol><li><strong>Общий вид</strong><span>Здание или участок целиком.</span></li><li><strong>Ближе к задаче</strong><span>Место протечки, повреждение или конструкцию.</span></li><li><strong>Детали</strong><span>Стыки, крепления и сложные участки, если они доступны.</span></li></ol><p>Для первого разговора достаточно того, что у вас уже есть. Фотографии помогут уточнить задачу; стоимость и сроки обсудим после изучения объекта.</p><a class="text-button" href="request.html">Есть проект? Полная заявка ↗</a></aside>
<div class="photo-form-panel"><form id="photo-request-form" action="/api/photo-request" method="post" enctype="multipart/form-data"><fieldset disabled><legend>Фотографии и контакт</legend>
<div class="photo-upload" id="photo-drop"><h2>Начните с фотографий</h2><p id="photo-limits">До 5 фото: JPG, PNG, WebP. До 10 МБ каждое и 25 МБ суммарно.</p><div class="photo-upload-actions"><button class="button" type="button" id="choose-photos">Выбрать фотографии +</button><button class="text-button" type="button" id="take-photo">Сделать фото ↗</button></div><input id="photo-files" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple hidden><input id="photo-camera" type="file" accept="image/*" capture="environment" hidden><p class="photo-drop-hint">Или перетащите фотографии сюда</p><p id="photo-file-status" role="status"></p></div>
<ul id="photo-previews" class="photo-previews" aria-label="Выбранные фотографии"></ul><p class="photo-total" id="photo-total" aria-live="polite">Фотографии пока не выбраны</p>
<label>Телефон для связи<input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="+7 …" maxlength="40" required></label>
<label>Что нужно сделать? <span class="optional">необязательно</span><textarea name="comment" rows="3" maxlength="1500" placeholder="Например: протекает стык между стеклопакетами"></textarea></label>
<details class="photo-extra"><summary>Добавить имя, город или email <span aria-hidden="true">+</span></summary><div><label>Как к вам обращаться<input name="name" autocomplete="name" maxlength="100"></label><label>Город / расположение<input name="city" autocomplete="address-level2" maxlength="120"></label><label>Email для подтверждения<input name="email" type="email" autocomplete="email" maxlength="200"></label></div></details>
<label class="callback-trap" aria-hidden="true">Сайт<input name="website" tabindex="-1" autocomplete="off"></label>
<label class="check-line"><input name="consent" type="checkbox" required><span>Согласен на <a href="privacy.html" target="_blank" rel="noopener">обработку данных</a> для ответа на обращение.</span></label><button class="button photo-submit" type="submit">Отправить фотографии ↗</button><p class="photo-private">Фотографии получит команда ФАСАД.PRO. Они не публикуются на сайте.</p></fieldset><p id="photo-send-status" role="status" tabindex="-1">Проверяем возможность отправки…</p></form>
<section id="photo-success" class="photo-success" hidden tabindex="-1" aria-labelledby="photo-success-title"><p class="eyebrow">Материалы получены</p><h2 id="photo-success-title">Спасибо.<br>Теперь мы на связи.</h2><p id="photo-reference"></p><p>Менеджер свяжется с вами по указанному телефону, чтобы уточнить задачу и следующие шаги.</p><a class="button" href="projects.html">Посмотреть наши работы ↗</a><button class="text-button" type="button" id="photo-again">Отправить ещё одно обращение</button></section>'''
    body += '<noscript><p>Включите JavaScript или свяжитесь с менеджером: <a href="tel:'+phone+'">'+e(cfg['phone'])+'</a>, <a href="mailto:'+e(cfg['email'])+'">'+e(cfg['email'])+'</a>.</p></noscript></div></section>'
    g['page']('photo-request.html', 'Отправить фото объекта', 'Быстрая заявка ФАСАД.PRO: фотографии объекта, телефон и описание задачи.', '<div class="focused-page">'+body+'</div>')
