"""Client-facing release 6. CMS data is escaped at every output boundary."""
import copy
import json
import re
from pathlib import Path
ROOT = Path(__file__).parent
DEFAULTS = json.loads((ROOT / 'source/release6.json').read_text())

def upgrade(value):
    value.setdefault('workflow', [copy.deepcopy(r) for r in DEFAULTS['workflow'] if any(p['id']==r['project'] and r['image'] in p['images'] for p in value['projects'])])
    for p in value['projects']:
        p.setdefault('reports', json.loads((ROOT / 'source/museum-reports.json').read_text()) if p['id'] == 'museum' else [])
        p.setdefault('hotspots', [copy.deepcopy(h) for h in DEFAULTS['hotspots'].get(p['id'], []) if h['image'] in p['images']])
    return value

def image_url(key, base='../'):
    return base + key if key.startswith('media/') else base + 'assets/' + key + '.webp'

def workflow(g):
    e, img = g['e'], g['img']
    rows = [r for r in g['CONTENT'].get('workflow', []) if r['project'] in g['PBY']]
    if not rows:
        return ''
    cards = ''.join(f'<article class="workflow-card"><a href="projects/{r["project"]}.html">{img(r["image"],r["caption"] or r["title"])}<span>0{i+1}</span></a><div><p class="eyebrow">{e(r["caption"])}</p><h3>{e(r["title"])}</h3><p>{e(r["text"])}</p></div></article>' for i,r in enumerate(rows))
    return '<section class="section work-story" id="process"><div class="section-heading"><div><p class="eyebrow">От задачи до результата</p><h2>Как мы работаем<br>на объекте.</h2></div><p class="section-intro">Каждый проект — своя геометрия,<br>условия и последовательность работ.</p></div><div class="workflow-grid">'+cards+'</div></section>'

AUDIENCES = [
 ('contractor','Генподрядчик','Встроиться в график. Взять участок на себя.','Фасадный комплекс или отдельный этап: согласуем границы ответственности, исходные данные и последовательность работ.', ['glazing','height','engineering'],['museum','restaurant'],'Согласовать состав работ'),
 ('developer','Девелопер','Решение для всего объекта.','Оконные и фасадные системы, комплектация и монтаж. Обсудим архитектуру, объёмы и этапы реализации.', ['windows','glazing','supply'],['brusnika','novy'],'Обсудить комплектацию объекта'),
 ('owner','Собственник здания','Восстановить фасад. Продлить его работу.','Начнём с состояния конструкций и описания проблемы. Подберём состав ремонтных работ с учётом эксплуатации здания.', ['repair','height'],['burny','golden-horn'],'Обсудить ремонт фасада')
]

def audiences(g):
    tabs, panels = [], []
    for i,(key,label,title,desc,services,ids,cta) in enumerate(AUDIENCES):
        tabs.append(f'<button type="button" role="tab" id="audience-{key}" aria-controls="audience-panel-{key}" aria-selected="{str(i==0).lower()}" tabindex="{0 if i==0 else -1}" data-audience="{key}">{label}</button>')
        projects = [g['PBY'][p] for p in ids if p in g['PBY']]
        links = ''.join(f'<a href="services/{s}.html">{next(x["title"] for x in g["S"] if x["id"]==s)} ↗</a>' for s in services)
        panels.append(f'<section class="audience-panel" id="audience-panel-{key}" role="tabpanel" aria-labelledby="audience-{key}" data-audience-panel="{key}"><div class="audience-copy"><span class="eyebrow">Для вашего проекта</span><h3>{title}</h3><p>{desc}</p><div class="audience-services">{links}</div>{g["button"](cta,"request.html?audience="+key)}</div><div class="audience-projects">{"".join(g["card"](p) for p in projects)}</div></section>')
    return '<section class="section audience-section"><div class="section-heading"><div><p class="eyebrow">Задачи разные. Подход предметный.</p><h2>Что важно<br>для вас?</h2></div><p class="section-intro">Выберите свою роль в проекте.</p></div><div class="audience-tabs js-only" role="tablist" aria-label="Вы — заказчик"> '+''.join(tabs)+'</div>'+''.join(panels)+'</section>'

def home(g, body):
    body = re.sub(r'<section[^>]*id="process"[^>]*>.*?</section>', '', body, flags=re.S)
    body = re.sub(r'<section class="section process"[^>]*>.*?</section>', '', body, flags=re.S)
    marker = '<section class="flagship-link">'
    if marker in body:
        body = body.replace(marker, audiences(g)+marker, 1)
    else:
        body += audiences(g)
    return body + workflow(g)

def hotspots(g,p):
    e = g['e']
    notes=p.get('hotspots',[])
    if not notes:
        return ''
    groups=[]
    for image in dict.fromkeys(h['image'] for h in notes):
        hs=[h for h in notes if h['image']==image]
        pins=''.join(f'<a class="detail-pin" href="#detail-{p["id"]}-{h["id"]}" style="left:{h["x"]}%;top:{h["y"]}%" aria-label="{e(h["title"])}" data-detail-pin="detail-{p["id"]}-{h["id"]}">{i+1:02}</a>' for i,h in enumerate(hs))
        captions=''.join(f'<article class="detail-note" id="detail-{p["id"]}-{h["id"]}" tabindex="-1"><span>{i+1:02}</span><div><h3>{e(h["title"])}</h3><p>{e(h["text"])}</p></div></article>' for i,h in enumerate(hs))
        groups.append(f'<div class="detail-explorer"><div class="detail-picture">{g["img"](image,p["title"]+" — детали","../")}{pins}</div><div class="detail-notes">{captions}</div></div>')
    return '<section class="section details-section"><div class="section-heading"><div><p class="eyebrow">Рассмотреть ближе</p><h2>Детали, которые<br>имеют значение.</h2></div><p class="section-intro">Выберите отметку на фотографии.<br>Состав нашего участия — в описании проекта.</p></div>'+''.join(groups)+'</section>'

def journal(g,p):
    e,img=g['e'],g['img']
    reports=sorted((r for r in p.get('reports',[]) if r.get('published',True)),key=lambda r:r['publishedAt'],reverse=True)
    if not reports:
        return ''
    years=sorted({r['publishedAt'][:4] for r in reports},reverse=True)
    filters='<button type="button" data-report-year="all" aria-pressed="true">Все периоды</button>'+''.join(f'<button type="button" data-report-year="{y}" aria-pressed="false">{y}</button>' for y in years)
    anchors=''.join(f'<a href="#report-{r["id"]}" data-period-year="{r["publishedAt"][:4]}"><span>{e(r["period"])}</span><span>↘</span></a>' for r in reports)
    entries=[]
    for i,r in enumerate(reports):
        date='.'.join(reversed(r['publishedAt'].split('-')))
        kind='Съёмка' if r.get('dateKind')=='shooting' else 'Публикация'
        photos=[]
        for f in r['photos']:
            photos.append(f'<figure><a class="report-photo" href="{image_url(f["key"])}" data-report-photo="{e(f["key"])}" data-period="{e(r["period"])}" data-caption="{e(f["caption"])}" data-source="{e(r.get("sourceUrl",""))}" data-credit="{e(r.get("credit",""))}" data-publication="{date}" data-date-kind="{kind}" aria-label="Увеличить: {e(f["caption"])}">{img(f["key"],f["caption"],"../")}<span class="report-zoom">Открыть фото ↗</span></a><figcaption>{e(f["caption"])}</figcaption></figure>')
        source=f'<a href="{e(r["sourceUrl"])}" target="_blank" rel="noopener noreferrer">{e(r.get("sourceName") or "Источник")} ↗</a>' if r.get('sourceUrl') else ''
        entries.append(f'<article class="report-entry" id="report-{r["id"]}" data-year="{r["publishedAt"][:4]}"><div class="report-entry-heading"><span class="report-number">{i+1:02}</span><div><p class="eyebrow">{e(r["period"])}</p><h3>{e(r["title"])}</h3><p>{e(r["summary"])}</p></div></div><div class="report-photos">{"".join(photos)}</div><div class="report-credit"><span>{e(r.get("credit",""))}</span><span>{kind}: <time datetime="{r["publishedAt"]}">{date}</time></span>{source}</div></article>')
    return '<section class="section museum-reports" id="reports" aria-labelledby="reports-title"><div class="section-heading"><div><p class="eyebrow">Дневник проекта</p><h2 id="reports-title">Объект.<br>В разные периоды.</h2></div></div><div class="report-layout"><aside class="report-index"><p class="eyebrow">Выберите период</p><div class="report-filters js-only" role="group" aria-label="Год фотоотчёта">'+filters+'</div><nav aria-label="Периоды строительства">'+anchors+'</nav><p class="report-status" role="status">Фотоотчётов: '+str(len(reports))+'</p><p class="report-date-note">Дата публикации и дата съёмки отмечены отдельно. Общие виды показывают ход строительства; состав работ команды — в описании участия.</p></aside><div class="report-feed">'+''.join(entries)+'</div></div></section>'

def viewer():
    return '<dialog class="report-viewer" aria-labelledby="report-viewer-title"><div class="report-viewer-toolbar"><p id="report-viewer-title"></p><button type="button" data-report-close>Закрыть ×</button></div><div class="report-viewer-stage"><img alt=""></div><div class="report-viewer-bottom"><button type="button" data-report-step="-1" aria-label="Предыдущее фото">←</button><div><p class="report-viewer-caption" aria-live="polite"></p><a class="report-viewer-source" target="_blank" rel="noopener noreferrer"></a></div><button type="button" data-report-step="1" aria-label="Следующее фото">→</button></div></dialog>'

def project(g,p,body,dialog):
    extra=hotspots(g,p)
    if p['id']!='museum':
        extra+=journal(g,p)
        if any(r.get('published',True) for r in p.get('reports',[])):
            dialog+=viewer()
    body=body.replace('<section class="section case-directions">',extra+'<section class="section case-directions">',1) if '<section class="section case-directions">' in body else body+extra
    return body,dialog
