"""Generate the static site from portfolio data. Python 3, standard library only."""
from pathlib import Path
import json, re, html, urllib.parse, os
import release4, visual5, release6, release7, release8, release9, assets9, visual10
ROOT=Path(__file__).resolve().parent
VERSION=json.loads((ROOT/'package.json').read_text())['version']
OUT=Path(os.environ.get('FACADE_OUTPUT',str(ROOT/'site')))
OUT.mkdir(parents=True,exist_ok=True)
CONTENT=json.loads(Path(os.environ.get('FACADE_CONTENT',str(ROOT/'source/content.json'))).read_text())
CONTENT=release6.upgrade(CONTENT)
P=[p for p in CONTENT['projects'] if p.get('published',True)]
CFG=CONTENT['settings']
S=json.loads((ROOT/'source/services.json').read_text())
IMAGE_SIZES=json.loads((ROOT/'source/image-sizes.json').read_text())
old=(ROOT/'source/home-v1.html').read_text()
class SafeHTML(str): pass
def e(v,quote=True): return v if isinstance(v,SafeHTML) else html.escape(str(v),quote=quote)
def safe_project(p):
 out={k:(SafeHTML(e(v)) if isinstance(v,str) and k!='id' else v) for k,v in p.items()}
 out['case']={k:SafeHTML(e(v)) for k,v in p.get('case',{}).items()}
 return out
P=[safe_project(p) for p in P]
ARROW='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>'
CATEGORIES={'Культурная инфраструктура':'culture','Гостиничные комплексы':'hotels','Жилые комплексы':'housing','Строительство':'construction','Общественные объекты':'public'}
PBY={p['id']:p for p in P}
pages=[]
def img(key,alt,base='',eager=False,sizes=None,full=False):
 if not key:return f'<img class="project-cover-placeholder" src="{base}assets/project-summary.svg" alt="{e(alt)} — описание проекта" width="1200" height="800" loading="lazy">'
 url=base+key if key.startswith("media/") else base+"assets/"+key+".webp"
 width,height=IMAGE_SIZES.get(key,[1200,900])
 priority=' fetchpriority="high"' if eager else ''
 responsive=''
 sizes=e(sizes or '(max-width: 600px) 100vw, (max-width: 1000px) 65vw, 50vw') if sizes or not eager else None
 small_width=IMAGE_SIZES.get(key+'-small',[520])[0]
 if not full and not key.startswith('media/') and (ROOT/'site/assets'/f'{key}-small.webp').is_file() and IMAGE_SIZES.get(key+'-small',[520])[0]<width:
  responsive=f' srcset="{base}assets/{key}-small.webp {small_width}w, {url} {width}w" sizes="{sizes}"' if not eager or sizes else ''
 return f'<img{responsive} src="{url}" alt="{e(alt)}" width="{width}" height="{height}" loading="{"eager" if eager else "lazy"}" decoding="async"{priority}>' 
def button(label,href,light=False):
 return f'<a class="button {"button-light" if light else ""}" href="{href}">{label}{ARROW}</a>'
def header(base,active):
 return visual10.header(globals(),base,active)
def footer(base=''):
 return f'''<footer class="site-footer"><div class="footer-top"><div><p class="eyebrow">Новый объект начинается с разговора</p><h2>Обсудим ваш<br>проект.</h2>{button('Подготовить заявку',base+'request.html',True)}</div><div class="footer-contact"><span class="contact-label">Ваш менеджер</span><p>{e(CFG["manager"])}</p><a class="phone" href="tel:{re.sub(r"[^+0-9]","",CFG["phone"])}">{e(CFG["phone"])}</a><a class="contact-email" href="mailto:{e(CFG["email"])}">{e(CFG["email"])} {ARROW}</a><a class="text-button" href="{base}index.html#callback">Попросить перезвонить ↗</a><a class="text-button" href="{base}contacts.html">Адреса и реквизиты {ARROW}</a></div></div><div class="footer-bottom"><a class="footer-brand" href="{base}index.html" aria-label="На главную"><img src="{base}assets/logo.svg" width="160" height="44" alt="ФАСАД.PRO"></a><span>© 2026 ФАСАД.PRO</span><span>Москва · Владивосток · Вся Россия</span><a href="{base}map.html">Карта проектов</a><a href="{base}portfolio.html">Собрать PDF</a><a href="{base}compare.html">Сравнить проекты</a><a href="{base}solutions.html">Подбор решения</a><a href="{base}privacy.html">Обработка данных</a><button class="text-button analytics-settings" type="button">Статистика</button><a href="#main">Наверх ↑</a></div><a class="site-version" href="{base}updates.html">Версия {VERSION} · Что нового</a></footer>'''
def page(path,title,desc,body,active='',extra=''):
 body=release9.enhance(globals(),path,body)
 body=release8.enhance(globals(),path,body)
 body=visual10.enhance(globals(),path,body)
 if path in ['index.html','about.html']: body+=release7.materials(globals())
 if path in ['index.html','contacts.html']:body+=release7.callback(globals())
 if path.startswith('projects/') and path.endswith('.html'):body+=release7.materials(globals(),path.split('/')[-1][:-5])
 base='/' if path=='404.html' else ('../' if '/' in path else '')
 url='https://facadepro.ru/'+('' if path=='index.html' else path)
 map_assets=f'<link rel="stylesheet" href="{base}vendor/leaflet/leaflet.css"><script src="{base}vendor/leaflet/leaflet.js" defer></script>' if path=='map.html' else ''
 if path in ['projects.html','map.html','portfolio.html','compare.html']:
  body='<nav class="project-subnav" aria-label="Портфолио">'+''.join(f'<a href="{u}"'+(' aria-current="page"' if path==u else '')+f'>{t}</a>' for u,t in [('projects.html','Каталог'),('map.html','Карта проектов'),('portfolio.html','Собрать PDF'),('compare.html','Сравнить')])+'</nav>'+body
 seo={'@context':'https://schema.org','@type':'Organization','name':'ФАСАД.PRO','legalName':CFG['legalName'],'url':'https://facadepro.ru/','telephone':CFG['phone'],'email':CFG['email']}
 content=f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#252525"><title>{e(title)} — ФАСАД.PRO</title><meta name="description" content="{e(desc)}"><link rel="canonical" href="{url}"><meta property="og:type" content="website"><meta property="og:locale" content="ru_RU"><meta property="og:title" content="{e(title)} — ФАСАД.PRO"><meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{url}"><meta property="og:image" content="https://facadepro.ru/assets/museum.webp"><link rel="icon" href="{base}favicon.svg" type="image/svg+xml">{map_assets}<script type="application/ld+json">{json.dumps(seo,ensure_ascii=False).replace(chr(60),chr(92)+'u003c')}</script>{assets9.assets(globals(),path,body+extra,base)}</head><body data-base="{base}">{header(base,active)}<main id="main">{body}</main>{footer(base)}{visual5.mobile_actions(globals(),base,path)}{extra}<noscript><style>.js-only{{display:none!important}}.menu-toggle{{display:none}}@media(max-width:1100px){{.navigation{{display:flex!important;position:static;flex-wrap:wrap;background:transparent;padding:16px 0;height:auto!important;max-height:none!important}}.header-inner{{flex-wrap:wrap}}.nav-extras{{display:none!important}}.nav-primary{{display:flex;flex-wrap:wrap;gap:0 16px}}.navigation a{{font-size:16px;padding:8px}}}}</style></noscript></body></html>'''
 if path=='contacts.html':
  for oldv,newv in [('Надежда Лизогубова',CFG['manager']),('ООО «Мастер Склад Владивосток»',CFG['legalName']),('2543104214',CFG['inn']),('254301001',CFG['kpp'])]:
   content=content.replace(oldv,e(newv))
 content=content.replace('Сведения об объёмах и периоде работ — по портфолио компании.','').replace('Данные о составе команды и технике — по портфолио компании.','')
 target=OUT/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(content)
 pages.append(path)
def intro(kicker,title,text,breadcrumb=None):
 crumb=f'<nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="../index.html">Главная</a><span>/</span><a href="../{breadcrumb[0]}.html">{breadcrumb[1]}</a></nav>' if breadcrumb else ''
 return f'<section class="page-intro">{crumb}<p class="eyebrow">{kicker}</p><div class="intro-grid"><h1>{title}</h1><p>{text}</p></div></section>'
def card(p,base='',catalog=False,slot=0):
 data=f' data-services="{e(" ".join(p.get("serviceIds",[])))}" data-city="{e(release8.city(p))}" data-category="{CATEGORIES[p["type"]]}" data-search="{e((p["title"]+" "+p["location"]+" "+p["work"]).lower())}"' if catalog else ''
 return f'<article class="project-card" data-project-id="{p["id"]}" data-slot="{slot}"{data}><a class="project-open" href="{base}projects/{p["id"]}.html"><span class="project-image">{img((p["images"] or [None])[0],p["title"],base)}<span class="project-tag">{p["volume"]}</span><span class="project-arrow">{ARROW}</span><span class="project-image-cta">Посмотреть объект</span></span><span class="project-meta">{p["type"]}<span>{p["location"].split(",")[0]}</span></span><h3>{p["title"]}</h3></a>{release8.card_details(globals(),p,base,catalog)}</article>'
def services(base=''):
 return visual5.service_cards(globals(),base)
def strip(title,text,base=''):
 return f'<section class="cta-strip"><div><h2>{title}</h2><p>{text}</p></div>{button("Обсудить задачу",base+"request.html")}</section>'
faq=[('Можно заказать отдельный этап?', 'Да. Можно обсудить полный фасадный комплекс или отдельные работы: монтаж, поставку, ремонт, инженерную подготовку. Точный состав закрепляется в договоре.'),('Что нужно для подготовки предложения?', 'Адрес и тип объекта, описание задачи, ориентировочный объём и желаемые сроки. Если есть чертежи, спецификации или фотографии — приложите их к письму менеджеру.'),('Что делать, если пока нет точных объёмов?', 'Опишите объект и оставьте поле площади пустым. Исходные данные и необходимость замеров можно обсудить с менеджером.'),('Работаете ли вы за пределами Владивостока?', 'Да, география работы — вся Россия, включая Дальний Восток и Северные регионы. Условия выхода на конкретный объект обсуждаются отдельно.'),('Как узнать стоимость и срок работ?', 'Они зависят от системы, объёма, сложности геометрии, высоты, логистики и готовности площадки. После изучения исходных данных согласуем предложение и график.'),('Как получить документы компании?', 'Реквизиты указаны на странице контактов. Документы СРО и лицензию МЧС можно запросить у менеджера.')]
def faqblock():
 return '<section class="section faq-section"><div class="section-heading"><div><p class="eyebrow">До начала работ</p><h2>Частые вопросы.</h2></div></div><div class="faq-list">'+''.join(f'<details><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>' for q,a in faq)+'</div></section>'
# Retain the established company facts and photographs; compose the public home anew.
home=re.search(r'<main id="main">(.*?)</main>',old,re.S).group(1)
home=home.replace('<div class="company-footnote">', '<a class="text-button company-link" href="about.html">Подробнее о команде '+ARROW+'</a><div class="company-footnote">')
home=release6.home(globals(),visual5.home(globals(),home))
page('index.html','Фасадные работы и сложное остекление','Фасадное остекление, оконные системы, ремонт и восстановление фасадов. 180 монтажников, 63 собственных подъёмника. Работаем по всей России.',home+faqblock())
filters=[('all','Все проекты',len(P))]+[(key,label,sum(CATEGORIES[p['type']]==key for p in P)) for key,label in [('housing','Жилые комплексы'),('hotels','Гостиницы'),('culture','Культура'),('construction','Строительство'),('public','Общественные объекты')]]
controls=f'<div class="catalog-tools js-only"><div class="filter-list" role="group" aria-label="Тип объекта">'+''.join(f'<button class="filter-button" data-filter="{key}" aria-pressed="{str(key=="all").lower()}">{label}<span>{count}</span></button>' for key,label,count in filters)+'</div><label class="search-field"><span>Поиск по проектам</span><input id="project-search" type="search" placeholder="Название, адрес или вид работ" autocomplete="off"></label><div class="catalog-status"><p id="results-count" role="status" aria-live="polite">Показано проектов: '+str(len(P))+'</p><button class="text-button" id="reset-filters" type="button" hidden>Сбросить фильтры ×</button></div></div>'
page('projects.html','Проекты',f'{len(P)} проектов ФАСАД.PRO: жилые комплексы, гостиницы, культурная инфраструктура и строительство.',intro(f'Портфолио / {len(P)} объектов','Работа, которую<br>можно увидеть.','От оконных систем жилых кварталов до сложной геометрии общественных зданий.')+'<section class="section catalog-section" aria-label="Каталог проектов">'+controls.replace('<div class="catalog-status">',release8.catalog_filters(globals())+'<div class="catalog-status">')+'<div class="project-grid catalog-grid editorial-grid">'+''.join(card(p,catalog=True,slot=i%4) for i,p in enumerate(P))+'</div><div class="empty-state" id="empty-results" hidden><h2>Проектов не найдено</h2><p>Попробуйте другое название или сбросьте фильтры.</p><button type="button" class="button" data-reset-filters>Показать все проекты</button></div></section>'+strip('У вас похожая задача?','Расскажите об объекте — обсудим подход к работам.'),'projects')
for i,p in enumerate(P):
 body,dialog=release6.project(globals(),p,*visual5.project(globals(),p,i))
 page('projects/'+p['id']+'.html',p['title'],p['work'],body,'projects',dialog)
page('services.html','Услуги', 'Фасадное остекление, оконные системы, ремонт, инженерная подготовка, производство и работы на высоте.',intro('Компетенции / 6 направлений','Весь фасадный<br>комплекс.','Берём на себя полный объём или подключаемся к отдельному этапу. Состав работ закрепляем в договоре.')+'<section class="section services-page">'+services()+'</section>'+faqblock(),'services')
for s in S:
 body=intro('Компетенции',s['title'],s['intro'],('services','Услуги'))+visual5.service_cover(globals(),s)+'<section class="section service-detail"><div><p class="eyebrow">Состав направления</p><h2>Что делаем.</h2><ul class="numbered-list">'+''.join(f'<li><span>0{i+1}</span>{item}</li>' for i,item in enumerate(s['items']))+'</ul></div><aside class="brief-panel"><p class="eyebrow">Для первого разговора</p><h3>Что подготовить</h3><ul>'+''.join(f'<li>{item}</li>' for item in s['inputs'])+'</ul><p>Нет всех данных? Начнём с описания задачи.</p>'+button('Обсудить работы','../request.html?service='+s['id'])+'</aside></section>'
 if s['projects']:
  body+='<section class="section related-services"><div class="section-heading"><div><p class="eyebrow">Опыт на объектах</p><h2>В проектах.</h2></div></div><div class="project-grid">'+''.join(card(PBY[key],'../') for key in s['projects'][:2] if key in PBY)+'</div></section>'
 body+='<section class="section other-services"><p class="eyebrow">Другие направления</p><div class="direction-links">'+''.join(f'<a href="{x["id"]}.html">{x["title"]} {ARROW}</a>' for x in S if x['id']!=s['id'])+'</div></section>'
 page('services/'+s['id']+'.html',s['title'],s['intro'],body,'services')
company=re.search(r'<section class="company section".*?</section>',home,re.S).group(0)
company=re.sub(r'<a class="text-button company-link".*?</a>','',company)
process=re.search(r'<section class="section process".*?</section>',home,re.S)
if not process: process=re.search(r'<section[^>]*id="process".*?</section>',home,re.S)
team=[('8','промышленных альпинистов'),('4','геодезиста'),('3','конструктора'),('2','инженера по безопасности'),('4','электрика')]
page('about.html','О компании','Команда ФАСАД.PRO: 15+ лет опыта, собственная техника и инженерное сопровождение. Работаем по всей России.',intro('О компании','Люди. Техника.<br>Ответственность.','ФАСАД.PRO — фирменный стиль компании «Мастер Склад Владивосток». Опыт команды объединяет инженерную подготовку, снабжение и монтаж.')+company+'<section class="section"><div class="section-heading"><div><p class="eyebrow">Профильные специалисты</p><h2>Каждая задача —<br>своему специалисту.</h2></div></div><div class="team-grid">'+''.join(f'<div><strong>{n}</strong><span>{label}</span></div>' for n,label in team)+'</div><p class="source-note">Данные о составе команды и технике — по портфолио компании.</p></section>'+(process.group(0) if process else '')+strip('Документы для вашего проекта','СРО, лицензию МЧС и условия работы можно запросить у менеджера.'),'about')
addresses=[('Владивосток',CFG['vladivostok']),('Москва',CFG['moscow'])]
contact=intro('Контакты','Начнём<br>с вашей задачи.','Расскажите об объекте. Если есть чертежи, спецификации или фотографии, приложите их к письму менеджеру.')+f'<section class="section contact-page"><div class="contact-person"><p class="eyebrow">Ваш менеджер</p><h2>{e(CFG["manager"])}</h2><a class="contact-big" href="tel:{re.sub(r"[^+0-9]","",CFG["phone"])}">{e(CFG["phone"])}</a><a class="contact-big" href="mailto:{e(CFG["email"])}">{e(CFG["email"])}</a>{button("Подготовить заявку","request.html")}</div><div class="office-list">'
for city,address in addresses:
 url='https://yandex.ru/maps/?text='+urllib.parse.quote(city+', '+address)
 contact+=f'<article><p class="eyebrow">{city}</p><h3>{e(address)}</h3><a class="text-button" href="{url}" target="_blank" rel="noopener noreferrer">Открыть на карте {ARROW}</a></article>'
contact+='</div></section><section class="section legal-section"><div><p class="eyebrow">Для документов</p><h2>Реквизиты.</h2></div><div><dl class="fact-list"><div><dt>Юридическое лицо</dt><dd>ООО «Мастер Склад Владивосток»</dd></div><div><dt>ИНН</dt><dd>2543104214</dd></div><div><dt>КПП</dt><dd>254301001</dd></div></dl><button class="text-button js-only" type="button" data-copy-legal>Скопировать реквизиты '+ARROW+'</button><p class="copy-status" role="status"></p></div></section>'
page('contacts.html','Контакты',f'{CFG["manager"]}, {CFG["phone"]}, {CFG["email"]}. Адреса в Москве и Владивостоке.',contact,'contacts')
from site_sections import extra_pages
extra_pages(globals())
release4.pages(globals())
release7.compare(globals())
release9.pages(globals())
page('404.html','Страница не найдена','Вернуться на сайт ФАСАД.PRO.',intro('404','Страница<br>не найдена.','Возможно, адрес изменился. Перейдите на главную или откройте каталог проектов.')+'<div class="section error-actions">'+button('На главную','index.html')+button('Смотреть проекты','projects.html')+'</div>')
(OUT/'favicon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#252525"/><path d="M7 26V6h18M7 16h15" fill="none" stroke="white" stroke-width="4"/></svg>')
(OUT/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>https://facadepro.ru/'+('' if x=='index.html' else x)+'</loc></url>' for x in pages if x!='404.html')+'</urlset>')
print(f'Built {len(pages)} pages')
