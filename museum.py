"""Flagship case study and dated, attributed construction photo journal."""
import json
from pathlib import Path

REPORTS = json.loads((Path(__file__).parent / 'source/museum-reports.json').read_text())


def spotlight(g):
    p = g['PBY'].get('museum')
    if not p:
        return ''
    return f'''<section class="flagship-link"><div><p class="eyebrow">Наш крупнейший проект</p><h2>{p['title']}</h2><p>{p['volume']} светопрозрачных конструкций. История участия и фотографии объекта в разные периоды.</p></div><a class="button" href="projects/museum.html#reports">Смотреть фотоотчёты {g['ARROW']}</a></section>'''


def enrich(g, p, body, dialog):
    """Keep the CMS-controlled case and gallery; add a bespoke opening and journal."""
    e, img, arrow = g['e'], g['img'], g['ARROW']
    cover_report = next((r for r in REPORTS if any(photo['key'] == p['images'][0] for photo in r['photos'])), None)
    cover_credit = ('Фото: ' + e(cover_report['credit']) + ' · публикация ' + '.'.join(reversed(cover_report['publishedAt'].split('-')))) if cover_report else 'Из портфолио компании'
    opening = f'''<section class="museum-opening"><nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="../index.html">Главная</a><span>/</span><a href="../projects.html">Проекты</a></nav><div class="museum-kicker"><p class="eyebrow">Наш крупнейший проект</p><span>{p['period']}</span></div><div class="museum-heading"><h1>{p['title']}</h1><div><p>Сложная геометрия.<br>Светопрозрачный фасад.<br>Масштаб, который виден городу.</p><a class="text-button" href="#reports">Фотоотчёты 2025–2026 ↓</a></div></div><p class="museum-address">{p['location']}</p></section>
    <figure class="museum-cover">{img(p['images'][0],p['title']+' — общий вид','../',True)}<div class="museum-cover-metric"><span class="eyebrow">Объём нашего участия</span><strong>{p['volume']}</strong><a href="#participation">О работах ФАСАД.PRO ↓</a></div><figcaption><span>Объект в городском пейзаже</span><span>{cover_credit}</span></figcaption></figure>
    <nav class="museum-nav" aria-label="Разделы проекта"><a href="#participation">Наше участие</a><a href="#reports">Фотоотчёты <span>{len(REPORTS):02}</span></a><a href="#project-gallery">Детали объекта</a><a href="../request.html">Обсудить похожий проект {arrow}</a></nav>'''
    # Reuse the mature gallery, case facts and contact section, with company photos
    # remaining undated. The journal has its own viewer and keyboard controls.
    start = body.index('<section class="project-gallery')
    gallery_end = body.index('</section>', start) + len('</section>')
    gallery = body[start:gallery_end].replace('<section ', '<section id="project-gallery" ', 1)
    gallery = gallery.replace('assets/museum.webp', 'assets/museum-portfolio.webp').replace('&quot;museum&quot;', '&quot;museum-portfolio&quot;')
    gallery = gallery.replace('Фотографии объекта', 'Общая галерея объекта', 1)
    tail = body[gallery_end:]
    details_start = tail.find('<section class="case-photo-essay')
    if details_start >= 0:
        details_end = tail.index('</section>', details_start) + len('</section>')
        tail = tail[:details_start] + tail[details_end:]
    insert_at = tail.find('<section class="section case-directions')
    if insert_at < 0:
        insert_at = tail.index('<section class="section case-cta')
    body = opening + tail[:insert_at] + journal(g) + '<div class="section museum-gallery-heading"><p class="eyebrow">Из портфолио компании</p><h2>Фасад. В деталях.</h2><p>Галерея объекта. Для архивных снимков точная дата съёмки не указана.</p></div>' + gallery + tail[insert_at:]
    viewer = '''<dialog class="report-viewer" aria-labelledby="report-viewer-title"><div class="report-viewer-toolbar"><p id="report-viewer-title"></p><button type="button" data-report-close aria-label="Закрыть фотоотчёт">Закрыть ×</button></div><div class="report-viewer-stage"><img alt=""></div><div class="report-viewer-bottom"><button type="button" data-report-step="-1" aria-label="Предыдущее фото отчётов">←</button><div><p class="report-viewer-caption" aria-live="polite"></p><a class="report-viewer-source" target="_blank" rel="noopener noreferrer"></a></div><button type="button" data-report-step="1" aria-label="Следующее фото отчётов">→</button></div><p class="report-viewer-hint">← → — листать · Esc — закрыть</p></dialog>'''
    return body, dialog + viewer


def journal(g):
    e, img = g['e'], g['img']
    years = sorted({r['year'] for r in REPORTS}, reverse=True)
    filters = '<button type="button" data-report-year="all" aria-pressed="true">Все периоды</button>' + ''.join(f'<button type="button" data-report-year="{year}" aria-pressed="false">{year}</button>' for year in years)
    anchors = ''.join(f'<a href="#report-{r["id"]}" data-period-year="{r["year"]}"><span>{e(r["period"])}</span><span>↘</span></a>' for r in REPORTS)
    rows = []
    for i, r in enumerate(REPORTS):
        photos = []
        date = '.'.join(reversed(r['publishedAt'].split('-')))
        for j, p in enumerate(r['photos']):
            photos.append(f'''<figure><a class="report-photo" href="../assets/{p['key']}.webp" data-report-photo="{p['key']}" data-period="{e(r['period'])}" data-caption="{e(p['caption'])}" data-source="{e(r['sourceUrl'])}" data-credit="{e(r['credit'])}" data-publication="{date}" aria-label="Увеличить: {e(p['caption'])}">{img(p['key'],p['caption'],'../')}<span class="report-zoom" aria-hidden="true">Открыть фото ↗</span></a><figcaption>{e(p['caption'])}</figcaption></figure>''')
        rows.append(f'''<article class="report-entry" id="report-{r['id']}" data-year="{r['year']}"><div class="report-entry-heading"><span class="report-number">0{i+1}</span><div><p class="eyebrow">{e(r['period'])}</p><h3>{e(r['title'])}</h3><p>{e(r['summary'])}</p></div></div><div class="report-photos">{''.join(photos)}</div><div class="report-credit"><span>Фото: {e(r['credit'])}</span><a href="{e(r['sourceUrl'])}" target="_blank" rel="noopener noreferrer">Публикация <time datetime="{r['publishedAt']}">{date}</time> ↗</a></div></article>''')
    return f'''<section class="section museum-reports" id="reports" aria-labelledby="reports-title"><div class="section-heading"><div><p class="eyebrow">Дневник большого проекта / 2025–2026</p><h2 id="reports-title">Как меняется<br>объект.</h2></div><p class="section-intro">Фотохроника строительства<br>от каркаса до остеклённого фасада.</p></div><div class="report-layout"><aside class="report-index"><p class="eyebrow">Выберите период</p><div class="report-filters js-only" role="group" aria-label="Год фотоотчёта">{filters}</div><nav aria-label="Периоды строительства">{anchors}</nav><p class="report-status" role="status" aria-live="polite">Фотоотчётов: {len(REPORTS)}</p><p class="report-date-note">Периоды соответствуют датам публикаций. Точная дата съёмки может отличаться. Здесь показан общий ход строительства; работы ФАСАД.PRO описаны в разделе «Наше участие».</p></aside><div class="report-feed">{''.join(rows)}</div></div><a class="text-button report-back" href="#reports">К выбору периода ↑</a></section>'''
