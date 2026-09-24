"""Flagship case study and dated, attributed construction photo journal."""
import json
import release6
from pathlib import Path

REPORTS = json.loads((Path(__file__).parent / 'source/museum-reports.json').read_text())


def spotlight(g):
    p = g['PBY'].get('museum')
    if not p:
        return ''
    return f'''<section class="flagship-link"><div><p class="eyebrow">Наш крупнейший проект</p><h2>{p['title']}</h2><p>{p['volume']} светопрозрачных конструкций. История участия и фотографии объекта в разные периоды.</p></div><a class="button" href="projects/museum.html#reports">Смотреть фотоотчёты {g['ARROW']}</a></section>'''


def enrich(g, p, body, dialog):
    """Keep the CMS-controlled case and gallery; add a bespoke opening and journal."""
    REPORTS = [r for r in p.get('reports', []) if r.get('published', True)]
    e, img, arrow = g['e'], g['img'], g['ARROW']
    cover_report = next((r for r in REPORTS if any(photo['key'] == p['images'][0] for photo in r['photos'])), None)
    cover_credit = ('Фото: ' + e(cover_report['credit']) + (' · съёмка ' if cover_report.get('dateKind') == 'shooting' else ' · публикация ') + '.'.join(reversed(cover_report['publishedAt'].split('-')))) if cover_report else 'Из портфолио компании'
    opening = f'''<section class="museum-opening"><nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="../index.html">Главная</a><span>/</span><a href="../projects.html">Проекты</a></nav><div class="museum-kicker"><p class="eyebrow">Наш крупнейший проект</p><span>{p['period']}</span></div><div class="museum-heading"><h1>{p['title']}</h1><div><p>Сложная геометрия.<br>Светопрозрачный фасад.<br>Масштаб, который виден городу.</p><a class="text-button" href="#reports">Фотоотчёты ↓</a></div></div><p class="museum-address">{p['location']}</p></section>
    <figure class="museum-cover">{img(p['images'][0],p['title']+' — общий вид','../',True)}<div class="museum-cover-metric"><span class="eyebrow">Объём нашего участия</span><strong>{p['volume']}</strong><a href="#participation">О работах ФАСАД.PRO ↓</a></div><figcaption><span>Объект в городском пейзаже</span><span>{cover_credit}</span></figcaption></figure>
    <nav class="museum-nav" aria-label="Разделы проекта"><a href="#participation">Наше участие</a><a href="#reports">Фотоотчёты <span>{len(REPORTS):02}</span></a><a href="#project-gallery">Детали объекта</a><a href="../request.html">Обсудить похожий проект {arrow}</a></nav>'''
    if not REPORTS:
        opening = opening.replace('<a class="text-button" href="#reports">Фотоотчёты ↓</a>', '').replace('<a href="#reports">Фотоотчёты <span>00</span></a>', '')
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
    body = opening + tail[:insert_at] + journal(g, p) + '<div class="section museum-gallery-heading"><p class="eyebrow">Из портфолио компании</p><h2>Фасад. В деталях.</h2><p>Галерея объекта. Для архивных снимков точная дата съёмки не указана.</p></div>' + gallery + tail[insert_at:]
    viewer = '''<dialog class="report-viewer" aria-labelledby="report-viewer-title"><div class="report-viewer-toolbar"><p id="report-viewer-title"></p><button type="button" data-report-close aria-label="Закрыть фотоотчёт">Закрыть ×</button></div><div class="report-viewer-stage"><img alt=""></div><div class="report-viewer-bottom"><button type="button" data-report-step="-1" aria-label="Предыдущее фото отчётов">←</button><div><p class="report-viewer-caption" aria-live="polite"></p><a class="report-viewer-source" target="_blank" rel="noopener noreferrer"></a></div><button type="button" data-report-step="1" aria-label="Следующее фото отчётов">→</button></div><p class="report-viewer-hint">← → — листать · Esc — закрыть</p></dialog>'''
    return body, dialog + viewer


def journal(g, p):
    return release6.journal(g, p)
