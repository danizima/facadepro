"""A clearer public interface: visible architecture and simpler navigation."""
import re


def header(g,base,active):
    e=g['e'];links=[('projects','Проекты'),('services','Услуги'),('about','Компания'),('contractors','Генподрядчикам'),('contacts','Контакты')]
    primary=''.join(f'<a href="{base}{url}.html"'+(' aria-current="page"' if active==url else '')+f'><span>{label}</span><span class="nav-link-arrow" aria-hidden="true">↗</span></a>' for url,label in links)
    shortcuts=''.join(f'<a href="{base}{url}.html">{label} <span aria-hidden="true">↗</span></a>' for url,label in [('kit','Пакет подрядчика'),('portfolio','Портфолио PDF'),('solutions','Подбор решения'),('map','Карта объектов')])
    phone=re.sub(r'[^+0-9]','',g['CFG']['phone'])
    return f'''<a class="skip-link" href="#main">Перейти к содержанию</a><header class="header"><div class="header-inner"><a href="{base}index.html" class="brand" aria-label="ФАСАД.PRO — на главную"><img src="{base}assets/logo.svg" alt="ФАСАД.PRO" width="180" height="49"></a><nav class="navigation" id="navigation" aria-label="Основная навигация"><div class="nav-primary">{primary}</div><div class="nav-extras"><p class="eyebrow">Быстрый доступ</p><div class="nav-shortcuts">{shortcuts}</div><a class="nav-phone" href="tel:{phone}">{e(g['CFG']['phone'])}</a><a class="nav-request button button-light" href="{base}request.html">Обсудить проект {g['ARROW']}</a></div></nav><a class="header-contact" href="{base}request.html">Обсудить проект {g['ARROW']}</a><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="navigation" aria-label="Открыть меню"><span></span><span></span></button></div></header>'''


def hero(g):
    projects=[g['PBY'][key] for key in ['museum','burny','restaurant'] if key in g['PBY']]
    projects=(projects+[p for p in g['P'] if p not in projects])[:3]
    if not projects:return '<section class="empty-hero section"><h1>'+g['e'](g['CFG']['slogan'])+'</h1>'+g['button']('Обсудить объект','request.html',True)+'</section>'
    slides=[];tabs=[]
    for i,p in enumerate(projects):
        photo=g['img'](p['images'][0],p['title'],eager=i==0,full=True)
        slides.append(f'''<div class="architecture-slide" id="hero-panel-{i}" role="tabpanel" aria-labelledby="hero-tab-{i}" {'hidden' if i else ''}><a class="hero-photo-link" href="projects/{p['id']}.html" aria-label="Смотреть проект: {g['e'](p['title'])}">{photo}<span class="hero-photo-open">Смотреть объект {g['ARROW']}</span></a><a href="projects/{p['id']}.html" class="architecture-caption"><div><span class="eyebrow">{'Наш крупнейший проект' if p['id']=='museum' else p['type']}</span><strong>{p['title']}</strong></div><span class="architecture-caption-bottom"><span>{p['volume']}</span>{g['ARROW']}</span></a></div>''')
        tabs.append(f'<button type="button" role="tab" data-hero-tab="{i}" id="hero-tab-{i}" aria-controls="hero-panel-{i}" aria-selected="{str(i==0).lower()}" tabindex="{0 if i==0 else -1}"><span>0{i+1}</span><span>{p["title"]}</span></button>')
    slogan=g['e'](g['CFG']['slogan']).replace(' любой ',' <br>любой ')
    return f'''<section class="architecture-hero" aria-label="Ключевые проекты"><div class="architecture-copy"><p class="eyebrow">Остекление · Монтаж · Восстановление</p><h1>{slogan}</h1><p class="architecture-lead">От точного узла до выразительной архитектуры. Инженерная подготовка, комплектация и монтаж.</p><div class="architecture-actions">{g['button']('Смотреть проекты','projects.html',True)}<a class="text-button" href="request.html">Обсудить объект {g['ARROW']}</a></div><div class="architecture-note"><span class="availability-dot" aria-hidden="true"></span>Москва · Владивосток · Вся Россия</div></div><div class="architecture-stage">{''.join(slides)}</div><div class="architecture-bottom"><div class="architecture-tabs" role="tablist" aria-label="Ключевые объекты">{''.join(tabs)}</div><div class="architecture-controls"><button type="button" data-hero-prev aria-label="Предыдущий проект">←</button><span class="architecture-count" aria-live="polite">01 / {len(projects):02}</span><button type="button" data-hero-next aria-label="Следующий проект">→</button></div></div></section><nav class="home-shortcuts" aria-label="Быстрый переход"><a href="#projects">Наши объекты <span>↓</span></a><a href="#services">Направления работ <span>↓</span></a><a href="kit.html">Материалы о компании <span>↗</span></a></nav>'''


def enhance(g,route,body):
    if route=='projects.html':
        a=body.index('<div class="catalog-refine">');b=body.index('<div class="catalog-status">',a)
        controls=body[a:b]
        body=body[:a]+'<details class="catalog-more" open><summary>Направление и город <span aria-hidden="true">+</span></summary>'+controls+'</details>'+body[b:]
    if route.startswith('projects/') and route!='projects/museum.html':
        project=g['PBY'].get(route.split('/')[-1][:-5])
        if project:
            items=[('project-photos','Фотографии'),('participation','Состав работ')]
            if 'id="reports"' in body:items.append(('reports','Фотоотчёты'))
            if 'id="stages"' in body:items.append(('stages','Этапы'))
            body=body.replace('<section class="project-gallery','<section id="project-photos" class="project-gallery',1)
            end=body.index('</section>')+len('</section>')
            nav='<nav class="case-page-nav" aria-label="Разделы проекта">'+''.join('<a href="#'+key+'">'+label+'</a>' for key,label in items)+'<a href="../request.html?project='+project['id']+'">Обсудить объект ↗</a></nav>'
            body=body[:end]+nav+body[end:]
    if route in ('kit.html','request.html','quote.html','portfolio.html'):
        body='<div class="focused-page">'+body+'</div>'
    return body
