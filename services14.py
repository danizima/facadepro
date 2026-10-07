"""Concrete service scopes and an honest showcase of existing site photographs."""
from pathlib import Path
import json
import re
from urllib.parse import urlencode


SCOPES = json.loads((Path(__file__).parent / 'source/service-scopes14.json').read_text())

# Portfolio photographs remain associated with their original object. Images
# from outside publications keep the existing attribution and are never called
# a documentary photograph of our crew or our part in the common construction.
PHOTO_STORIES = {
    'restaurant-frame': ('restaurant', 'Сначала — каркас',
                         'Каркас ресторана на этапе строительства. В кейсе — весь путь до готового здания.'),
    'restaurant-build': ('restaurant', 'Работа на площадке',
                         'Бригада на участке сборки каркаса ресторана. Фотография из портфолио компании.'),
    'restaurant-facade': ('restaurant', 'Следующий этап',
                          'Ресторан в процессе строительства: конструкции, леса и рабочая площадка.'),
    'museum-glass-2026': ('museum', 'Остекление в масштабе',
                          'Светопрозрачный фасад музейно-театрального комплекса. Фотография объекта.'),
    'museum-geometry-2026': ('museum', 'Геометрия в деталях',
                             'Конструкции музейно-театрального комплекса, вид изнутри. Фотография объекта.'),
}


def request_url(service, scope=None, base='../'):
    query = {'service': service}
    if scope:
        query['scope'] = scope
    return base + 'request.html?' + urlencode(query)


def photo_credit(g, key):
    for source in g.get('PHOTO_SOURCES', {}).get('photos', []):
        if source.get('asset') == key + '.webp':
            text = 'Фото: ' + g['e'](source['credit'])
            if source.get('page'):
                return '<a href="' + g['e'](source['page']) + '" target="_blank" rel="noopener noreferrer">' + text + '</a>'
            return text
    return 'Фото: портфолио компании'


def showcase(g, keys, base='', compact=False):
    e, img, arrow = g['e'], g['img'], g['ARROW']
    cards = []
    for key in keys:
        project_id, title, caption = PHOTO_STORIES[key]
        project = g['PBY'].get(project_id)
        if not project or key not in project.get('images', []):
            continue
        picture = img(key, caption, base, sizes='(max-width: 650px) calc(100vw - 44px), (max-width: 1100px) 46vw, 31vw')
        cards.append('<figure class="work-photo14"><a class="work-photo14-image" href="' + base + 'projects/' + project_id + '.html#case-chapters">' + picture + '<span aria-hidden="true">' + arrow + '</span></a><figcaption><h3>' + e(title) + '</h3><p>' + e(caption) + '</p><a class="work-photo14-project" href="' + base + 'projects/' + project_id + '.html">' + e(project['title']) + ' ' + arrow + '</a><small>' + photo_credit(g, key) + '</small></figcaption></figure>')
    if not cards:
        return ''
    return ('<section class="section work-showcase14' + (' work-showcase14-compact' if compact else '') + '" id="work-photos"><div class="section-heading"><div><p class="eyebrow">Площадка и детали</p><h2>Как выглядит работа<br>изнутри.</h2></div><p>Каркас, монтажные участки и сложная геометрия. Состав участия команды указан в кейсе каждого объекта.</p></div><div class="work-photos14-grid">' + ''.join(cards) + '</div></section>')


def scope_cards(g, service, content):
    e, arrow = g['e'], g['ARROW']
    rows = []
    for scope in content.get('scopes', []):
        rows.append('<article class="scope14-card"><p class="eyebrow">Формат заказа</p><h3>' + e(scope['title']) + '</h3><p>' + e(scope['text']) + '</p><ul>' + ''.join('<li>' + e(item) + '</li>' for item in scope['items']) + '</ul><a class="scope14-action" href="' + request_url(service['id'], scope['id']) + '">Обсудить этот формат ' + arrow + '</a></article>')
    if not rows:
        return ''
    return '<section class="section service-scopes14" id="service-scope"><div class="section-heading"><div><p class="eyebrow">Выберите объём участия</p><h2>Подключимся к этапу.<br>Или соберём весь объём.</h2></div><p>Поставку, монтаж и сопутствующие работы согласуем отдельно, чтобы в предложении был понятен каждый этап.</p></div><div class="scope14-grid">' + ''.join(rows) + '</div><p class="scope14-note">Точный состав работ, стоимость, сроки и порядок приёмки закрепляем в договоре.</p></section>'


def work_details(g, service, content, old_section):
    e, button = g['e'], g['button']
    # Keep the existing preparation download/copy controller rather than
    # duplicating or abandoning a working service-page feature.
    checklist = re.search(r'<details class="preparation-list".*?</details>', old_section, re.S)
    checklist = checklist[0] if checklist else ''
    scope = content.get('scope')
    url = request_url(service['id'], scope)
    return ('<section class="section service-detail service-detail14" id="service-work"><div><p class="eyebrow">Состав направления</p><h2>Что делаем<br>на вашем объекте.</h2><ol class="work14-list">' + ''.join('<li><span aria-hidden="true">0' + str(i + 1) + '</span><p>' + e(item) + '</p></li>' for i, item in enumerate(content['work'])) + '</ol></div><aside class="brief-panel brief-panel14" id="service-materials"><p class="eyebrow">До начала работ</p><h3>Что подготовить</h3><ul>' + ''.join('<li>' + e(item) + '</li>' for item in content['ready']) + '</ul><p>Передайте то, что уже есть. Недостающие данные и необходимость выезда уточним с менеджером.</p>' + button('Передать материалы', url) + checklist + '</aside></section>')


def results(g, content):
    e = g['e']
    return '<section class="section service-results14" id="service-result"><div class="section-heading"><div><p class="eyebrow">Результат сотрудничества</p><h2>Что вы получите.</h2></div></div><div class="result14-grid">' + ''.join('<article><span aria-hidden="true">0' + str(i + 1) + '</span><h3>' + e(title) + '</h3><p>' + e(text) + '</p></article>' for i, (title, text) in enumerate(content['results'])) + '</div></section>'


def enhance(g, route, body):
    if route in ('index.html', 'about.html'):
        strip = showcase(g, ['restaurant-frame', 'restaurant-build', 'museum-geometry-2026'])
        # The fuller work-photo view replaces the existing text-only teaser.
        if route == 'index.html':
            body = re.sub(r'<section class="team-teaser">.*?</section>', lambda _: strip, body, count=1, flags=re.S)
        elif strip:
            body = body.replace('<section class="section field-team"', strip + '<section class="section field-team"', 1)
    if not route.startswith('services/'):
        return body
    key = route.split('/')[-1][:-5]
    service = next((s for s in g['S'] if s['id'] == key), None)
    content = SCOPES.get(key)
    if not service or not content:
        return body
    body = body.replace(g['e'](service['intro']), g['e'](content['lead']), 1)
    section = re.search(r'<section class="section service-detail">.*?</section>', body, re.S)
    if section:
        replacement = scope_cards(g, service, content) + work_details(g, service, content, section[0]) + results(g, content)
        body = body[:section.start()] + replacement + body[section.end():]
    # Earlier generic diagrams about glass replacement do not describe these
    # three directions. Their concrete scope and outputs now do that work.
    if key in ('engineering', 'supply', 'height'):
        body = re.sub(r'<section class="section service-guide".*?</section>', '', body, count=1, flags=re.S)
    # Link navigation stays useful without JavaScript and names real sections.
    nav = '<nav class="service-nav14" aria-label="Разделы услуги">' + ('<a href="#service-scope">Формат заказа</a>' if content.get('scopes') else '') + '<a href="#service-work">Состав работ</a><a href="#service-materials">Исходные данные</a><a href="#service-result">Результат</a><a href="' + request_url(key, content.get('scope')) + '">Обсудить объект ' + g['ARROW'] + '</a></nav>'
    cover_end = body.find('</figure>', body.find('<figure class="service-cover">'))
    if cover_end >= 0:
        cover_end += len('</figure>')
        body = body[:cover_end] + nav + body[cover_end:]
    else:
        first_end = body.find('</section>') + len('</section>')
        body = body[:first_end] + nav + body[first_end:]
    service_photos = {
        'glazing': ['museum-glass-2026', 'museum-geometry-2026'],
        'engineering': ['restaurant-frame', 'restaurant-build'],
        'supply': ['restaurant-build', 'restaurant-facade'],
        'height': ['museum-glass-2026', 'museum-geometry-2026'],
    }
    if key in service_photos:
        photo_strip = showcase(g, service_photos[key], '../', True)
        body = body.replace('<section class="section other-services">', photo_strip + '<section class="section other-services">', 1)
    # Existing cover photo sources also deserve their existing attribution.
    cover = re.search(r'<figure class="service-cover">.*?</figure>', body, re.S)
    if cover:
        photo = re.search(r'data-photo="([^"]+)"', cover[0])
        if photo and any(x.get('asset') == photo[1] + '.webp' for x in g.get('PHOTO_SOURCES', {}).get('photos', [])):
            updated = cover[0].replace('</figcaption>', '<small class="service-cover-credit14">' + photo_credit(g, photo[1]) + '</small></figcaption>')
            body = body[:cover.start()] + updated + body[cover.end():]
    return body
