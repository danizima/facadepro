"""An architectural public shell; business facts remain in editable sources."""
import re
import visual10


def header(g, base, active):
    markup = visual10.header(g, base, active)
    return markup.replace('</a><nav class="navigation"', '<span class="brand-note">Инженерия фасада</span></a><nav class="navigation"', 1)


def hero(g):
    projects = [g['PBY'][key] for key in ('museum', 'burny', 'restaurant') if key in g['PBY']]
    projects = (projects + [p for p in g['P'] if p not in projects])[:3]
    if not projects:
        return visual10.hero(g)
    slides, tabs = [], []
    for i, p in enumerate(projects):
        photo = g['img']((p['images'] or [None])[0], p['title'], eager=i == 0,
                         sizes='(max-width: 800px) calc(100vw - 40px), (max-width: 1500px) 90vw, 1440px', full=True)
        slides.append(f'''<div class="architecture-slide" id="hero-panel-{i}" role="tabpanel" aria-labelledby="hero-tab-{i}" {'hidden' if i else ''}><a class="hero-photo-link" href="projects/{p['id']}.html" aria-label="Смотреть проект: {g['e'](p['title'])}">{photo}<span class="hero-photo-open">Смотреть объект {g['ARROW']}</span></a><a class="architecture-caption" href="projects/{p['id']}.html"><div><span class="eyebrow">{p['type']}</span><strong>{p['title']}</strong></div><span class="architecture-caption-bottom"><span>{p['volume']}</span>{g['ARROW']}</span></a></div>''')
        tabs.append(f'<button type="button" role="tab" data-hero-tab="{i}" id="hero-tab-{i}" aria-controls="hero-panel-{i}" aria-selected="{str(i == 0).lower()}" tabindex="{0 if i == 0 else -1}"><span>0{i+1}</span><span>{p["title"]}</span></button>')
    slogan = g['e'](g['CFG']['slogan']).replace(' любой ', ' любой<br>')
    return f'''<section class="architecture-hero portfolio-hero visual21-hero" aria-label="Ключевые проекты"><div class="architecture-copy"><div class="architecture-title"><p class="eyebrow">Остекление · Монтаж · Восстановление</p><h1>{slogan}</h1></div><div class="architecture-summary"><p class="architecture-lead">От точного узла до выразительной архитектуры. Инженерная подготовка, комплектация и монтаж.</p><div class="architecture-actions">{g['button']('Запросить КП', 'quote.html')}<a class="text-button" href="#projects">Посмотреть проекты {g['ARROW']}</a></div><p class="architecture-note">Москва · Владивосток · Вся Россия</p></div></div><div class="architecture-stage">{''.join(slides)}</div><div class="architecture-bottom"><div class="architecture-tabs" role="tablist" aria-label="Ключевые объекты">{''.join(tabs)}</div><div class="architecture-controls"><button type="button" data-hero-prev aria-label="Предыдущий проект">←</button><span class="architecture-count" aria-live="polite">01 / {len(projects):02}</span><button type="button" data-hero-next aria-label="Следующий проект">→</button></div></div></section>'''


def enhance(g, route, body):
    if route == 'index.html':
        body = re.sub(r'<section class="architecture-hero[^>]*>.*?</section>', lambda _: hero(g), body, count=1, flags=re.S)
    if route.startswith('projects/'):
        # Show the actual object before the longer participation facts. Move
        # the intact section in the DOM so visual and reading order agree.
        brief = re.search(r'<section class="section project-brief"[^>]*>.*?</section>', body, re.S)
        cover = re.search(r'<figure class="museum-cover"[^>]*>.*?</figure>', body, re.S)
        gallery = re.search(r'<section[^>]*class="project-gallery[^>]*>.*?</section>', body, re.S)
        photo = cover or gallery
        if brief and photo:
            details = brief[0]
            body = body[:brief.start()] + body[brief.end():]
            photo = re.search(r'<figure class="museum-cover"[^>]*>.*?</figure>', body, re.S) or re.search(r'<section[^>]*class="project-gallery[^>]*>.*?</section>', body, re.S)
            body = body[:photo.end()] + details + body[photo.end():]
    return body
