"""Release 8: find relevant work and carry that context into an enquiry."""
import json
import re
import html


def city(p):
    return p.get('geo', {}).get('label') or html.unescape(p['location']).split(',')[0].strip()


def compare_button(g, p):
    return ('<button type="button" class="project-select js-only" data-select-compare="'
            + p['id'] + '" aria-pressed="false" aria-label="Добавить в сравнение: '
            + g['e'](p['title']) + '" disabled><span aria-hidden="true">+</span> В сравнение</button>')


def card_details(g, p, base, catalog):
    e = g['e']
    services = [s for s in g['S'] if s['id'] in p.get('serviceIds', [])]
    chips = ''.join('<a href="' + base + 'projects.html?service=' + s['id'] + '">'
                    + e(s['title']) + '</a>' for s in services)
    description = '<p class="project-work">' + e(p['work']) + '</p>' if catalog else ''
    return (description + '<div class="project-directions">' + chips + '</div>'
            + '<div class="project-card-actions">' + compare_button(g, p)
            + '<a class="text-button" href="' + base + 'request.html?project=' + p['id']
            + '">Обсудить похожий объект ↗</a></div>')


def catalog_filters(g):
    e = g['e']
    cities = sorted({city(p) for p in g['P']})
    return ('<div class="catalog-refine"><label>Направление работ<select id="catalog-service">'
            '<option value="">Все направления</option>'
            + ''.join('<option value="' + s['id'] + '">' + e(s['title']) + '</option>' for s in g['S'])
            + '</select></label><label>Город / расположение<select id="catalog-city">'
            '<option value="">Все города</option>'
            + ''.join('<option value="' + e(c) + '">' + e(c) + '</option>' for c in cities)
            + '</select></label></div><p class="catalog-tip">Выберите до трёх объектов для сравнения. '
            'Направление в карточке открывает похожие работы.</p>')


def checklist(g, service=None):
    services = [s for s in g['S'] if not service or s['id'] == service]
    static = ''.join('<li>' + g['e'](item) + '</li>' for s in services for item in s['inputs']) if service else ''
    title = 'Список для подготовки' if service else 'Что пригодится для обсуждения'
    return ('<details class="preparation-list" data-preparation="' + (service or '') + '"'
            + (' open' if service else '') + '><summary>' + title + '</summary>'
            '<p>Соберите то, что уже есть. Недостающие данные можно уточнить с менеджером.</p>'
            '<div data-checklist-items>' + ('<ul>' + static + '</ul>' if static else '') + '</div>'
            '<div class="preparation-actions js-only"><button type="button" class="text-button" '
            'data-checklist-download>Скачать список ↓</button><button type="button" class="text-button" '
            'data-checklist-copy>Скопировать</button></div><p data-checklist-status role="status"></p></details>')


def enhance(g, route, body):
    base = '../' if '/' in route else ''
    if route.startswith('projects/'):
        project = g['PBY'].get(route.split('/')[-1][:-5])
        if project:
            action = ('<div class="case-selection">' + compare_button(g, project)
                      + '<a class="text-button" href="../request.html?project=' + project['id']
                      + '">Обсудить похожий объект ↗</a></div>')
            if '<figure class="museum-cover">' in body:
                body = body.replace('<figure class="museum-cover">', action + '<figure class="museum-cover">', 1)
                body = body.replace('href="../request.html">Обсудить похожий проект',
                                    'href="../request.html?project=' + project['id'] + '">Обсудить похожий проект')
            else:
                body = body.replace('<section class="project-gallery', action + '<section class="project-gallery', 1)
            # The end-of-case call to action retains the project context as well.
            body = re.sub(r'(<section class="section case-cta">.*?href=")../request.html(".*?</section>)',
                          lambda m: m[1] + '../request.html?project=' + project['id'] + m[2], body, flags=re.S)
    if route in ('request.html', 'quote.html'):
        body = body.replace('<div class="upload-zone"', checklist(g) + '<div class="upload-zone"', 1)
    if route.startswith('services/'):
        service = next((s for s in g['S'] if s['id'] == route.split('/')[-1][:-5]), None)
        if service:
            start = body.index('<aside class="brief-panel">')
            end = body.index('</aside>', start)
            body = body[:end] + checklist(g, service['id']) + body[end:]
    if 'data-select-compare=' in body:
        body += ('<aside class="selection-tray" aria-label="Выбранные проекты" hidden>'
                 '<div class="selection-heading"><strong data-selection-count>Выбрано: 0 из 3</strong>'
                 '<button type="button" class="text-button" data-selection-clear>Очистить ×</button></div>'
                 '<ul class="selection-chips" aria-label="Убрать проект из сравнения"></ul>'
                 '<div class="selection-bottom"><p data-selection-status role="status" aria-live="polite"></p>'
                 '<a class="button" data-selection-link href="' + base + 'compare.html">К сравнению ↗</a></div></aside>')
    if 'data-select-compare=' in body or 'data-preparation=' in body or 'id="request-form"' in body:
        data = {'services': [{'id': s['id'], 'title': s['title'], 'inputs': s['inputs']} for s in g['S']],
                'projects': [{k: p[k] for k in ('id', 'title', 'serviceIds', 'images') if k in p}
                             for p in g['CONTENT']['projects'] if p.get('published', True)]}
        body += '<script type="application/json" id="release8-data">' + json.dumps(data, ensure_ascii=False).replace('<', '\\u003c') + '</script>'
    return body
