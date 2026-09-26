"""Project-specific editorial layouts, real survey film and schematic service guides."""
import json,re
from pathlib import Path
GUIDES=json.loads((Path(__file__).parent/'source/service-guides12.json').read_text())

def diagram(kind):
    # Explanatory SVG: deliberately no dimensions, fixing specification or project branding.
    common='<rect x="48" y="38" width="424" height="280" rx="4" fill="#e5e8e7"/><path d="M58 305 462 58M58 225 330 48" stroke="white" stroke-width="3" opacity=".8"/>'
    structure='<g data-guide-part="0"><path d="M48 38V318M260 38V318M472 38V318M48 38H472M48 178H472M48 318H472" fill="none" stroke="#454b4b" stroke-width="12"/></g>'
    glass='<g data-guide-part="1"><rect x="277" y="53" width="179" height="110" fill="#b9cfd0" stroke="#7c999a" stroke-width="2"/><path d="M290 148 438 66" stroke="white" stroke-width="3"/></g>'
    joints='<g data-guide-part="2"><path d="M69 53H241V162H69ZM277 194H456V301H277Z" fill="none" stroke="#a5a29a" stroke-width="7" stroke-dasharray="12 5"/></g>'
    if kind=='repair':glass='<g data-guide-part="1"><path d="M68 305H232M288 305H452" stroke="#627f85" stroke-width="6"/><path d="m106 283 12 14 12-14M360 283l12 14 12-14" fill="none" stroke="#627f85" stroke-width="3"/></g>';joints='<g data-guide-part="2"><path d="M63 53H245V163H63Z" fill="none" stroke="#a5a29a" stroke-width="7"/></g><path d="M420 200c-24 32-24 45 0 45s24-13 0-45Z" fill="#7f9fa5"/>'
    if kind=='replacement':glass='<g data-guide-part="1"><rect x="292" y="66" width="180" height="110" fill="#bed2d3" stroke="#6f8a8b" stroke-width="3"/><path d="M284 117h-46m12-12-12 12 12 12" stroke="#454b4b" stroke-width="3" fill="none"/></g>'
    return '<svg viewBox="0 0 520 360" role="img" aria-label="Условная схема фасадного остекления">'+common+structure+glass+joints+'</svg>'

def guide(g,key,base='../'):
    e=g['e'];v=GUIDES[key];parts=[]
    for i,(title,text) in enumerate(v['steps']):
        parts.append(f'<details class="guide-step" data-guide-step="{i}"'+(' open' if i==0 else '')+f'><summary><span>0{i+1}</span>{e(title)}<b aria-hidden="true">+</b></summary><p>{e(text)}</p></details>')
    return '<section class="section service-guide" id="service-guide"><div class="section-heading"><div><p class="eyebrow">Понятно о работе</p><h2>'+e(v['title'])+'</h2></div><p>'+e(v['intro'])+'</p></div><div class="service-guide-grid"><figure class="guide-diagram" data-guide-active="0">'+diagram(key)+'<figcaption>Условная схема. Решение для вашего объекта определяется после обследования и проработки проекта.</figcaption></figure><div>'+''.join(parts)+'<p class="guide-inputs">'+e(v['inputs'])+'</p><a class="text-button" href="'+base+'photo-request.html">Показать свой объект ↗</a></div></div></section>'

def film(g,base=''):
    return '<section class="section survey-film" id="site-film"><div><p class="eyebrow">Рабочая съёмка / 18 секунд</p><h2>Посмотреть на фасад<br>вблизи.</h2><p>Обход площадки: остекление, примыкания и условия доступа. Такие детали помогают подготовить исходные данные для обсуждения работ.</p><p class="film-caption">Фасад на стадии обследования. Без звука.</p></div><div class="film-player"><video controls playsinline preload="none" poster="'+base+'assets/facade-survey-poster.webp" aria-label="Обход фасада на стадии обследования"><source src="'+base+'assets/films/facade-survey.mp4" type="video/mp4"><a href="'+base+'assets/films/facade-survey.mp4">Скачать рабочее видео</a></video></div></section>'

def team(g):
    p=g['PBY'].get('restaurant')
    if not p or 'restaurant-facade' not in p['images']:return ''
    return '<section class="section field-team" id="field-team"><div class="field-team-photo">'+g['img']('restaurant-facade','Площадка ресторана на этапе строительства')+'<p>Ресторан в японском стиле · рабочая площадка</p></div><div><p class="eyebrow">Команда на объекте</p><h2>За результатом —<br>люди и организация.</h2><p class="field-team-lead">Инженерная подготовка, снабжение и монтаж должны работать в одной последовательности.</p><dl><div><dt>Руководитель проекта</dt><dd>Координация участков, поставок и согласований.</dd></div><div><dt>Инженеры</dt><dd>Замеры, конструктивные решения и техническая документация.</dd></div><div><dt>Монтажная команда</dt><dd>Выполнение согласованного объёма работ на площадке.</dd></div></dl><a class="text-button" href="projects/restaurant.html#case-chapters">Как строился ресторан ↗</a></div></section>'

STORIES={
 'museum':('Геометрия большого проекта.','Светопрозрачные конструкции в архитектуре музейно-театрального комплекса.', [('museum-glass-2026','Плоскость фасада','Рисунок стекла и алюминиевых элементов в общем объёме здания.'),('museum-geometry-2026','Геометрия в деталях','Смена плоскостей и высот фасадных участков.'),('museum-roof-2026','Объект целиком','Общий вид строительной площадки. Состав участия нашей команды указан отдельно.')]),
 'burny':('Вернуть фасаду рабочее состояние.','Восстановление существующих конструкций и монтаж светопрозрачных перегородок.',[('burny-evening','Фасад в масштабе здания','Общий вид комплекса позволяет увидеть протяжённость и форму остекления.'),('burny-promenade','Вблизи архитектуры','Вид здания со стороны благоустроенной территории. Благоустройство не относится к указанному здесь составу наших работ.')]),
 'restaurant':('Одно здание. Два месяца.','Круглосуточная организация и параллельная работа на нескольких участках.',[('restaurant-frame','Каркас','Этап возведения несущего каркаса здания.'),('restaurant-build','Работа на площадке','Сборка конструкции и организация участков строительства.'),('restaurant','Готовое здание','Ресторан в японском стиле. Итог двух месяцев работы.')])
}
def chapters(g,p):
    e=g['e'];title,intro,rows=STORIES[p['id']];rows=[r for r in rows if r[0] in p['images']]
    if not rows:return ''
    credits={r['asset'][:-5]:r['credit'] for r in g['PHOTO_SOURCES']['photos']}
    pieces=[]
    for i,(key,label,text) in enumerate(rows):
        credit='<small>Фото: '+e(credits[key])+'</small>' if key in credits else ''
        pieces.append(f'<article class="case-chapter"><button class="chapter-photo" type="button" data-gallery-open="{p["images"].index(key)}" aria-label="Увеличить: {e(label)}">'+g['img'](key,label,'../',sizes='(max-width:800px) 100vw, 65vw')+'<span>Открыть фотографию ↗</span></button><div><p class="eyebrow">'+f'{i+1:02} / '+e(label)+'</p><h3>'+e(label)+'</h3><p>'+e(text)+'</p>'+credit+'</div></article>')
    return '<section class="section case-chapters chapters-'+p['id']+'" id="case-chapters"><div class="section-heading"><div><p class="eyebrow">История объекта</p><h2>'+e(title)+'</h2></div><p>'+e(intro)+'</p></div>'+''.join(pieces)+'</section>'

def evidence(g,p):
    e=g['e']
    return '<section class="section project-evidence" id="project-evidence"><div><p class="eyebrow">Сведения о проекте</p><h2>Состав работ.<br>В одном документе.</h2><p>Сохраните карточку объекта с фотографией, объёмом и периодом участия. Документы по конкретному договору можно запросить у менеджера.</p></div><div><dl><div><dt>Наше участие</dt><dd>'+e(p['work'])+'</dd></div><div><dt>Период</dt><dd>'+e(p['period'])+'</dd></div></dl><button type="button" class="button js-only" data-project-pdf="'+e(p['id'])+'">Скачать карточку PDF ↓</button><p class="project-pdf-status" role="status"></p><a class="text-button" href="../portfolio.html?projects='+e(p['id'])+'">Добавить в подборку ↗</a></div></section>'

def enhance(g,route,body):
    if route.startswith('projects/'):
        p=g['PBY'].get(route.split('/')[-1][:-5])
        if p:
            sources={}
            for key in p['images']:
                if key.startswith('media/'):continue
                variants=[(g['IMAGE_SIZES'][key+suffix][0],'../assets/'+key+suffix+'.webp') for suffix in ['-small','-1280',''] if key+suffix in g['IMAGE_SIZES']]
                if variants:sources[key]=', '.join(url+' '+str(width)+'w' for width,url in sorted(dict(variants).items()))
            body=body.replace(' data-gallery=', ' data-gallery-sources="'+g['e'](json.dumps(sources))+'" data-gallery=',1)
            if p['id'] in STORIES:
                body=re.sub(r'<section class="case-photo-essay".*?</section>','',body,flags=re.S)
                section=chapters(g,p)
                body=body.replace('<section class="section case-narrative"',section+'<section class="section case-narrative"',1)
                if section:body=body.replace('aria-label="Разделы проекта">','aria-label="Разделы проекта"><a href="#case-chapters">История объекта</a>',1)
            body=body.replace('<section class="section case-cta">',evidence(g,p)+'<section class="section case-cta">',1)
    if route=='about.html':body=body.replace('<section class="company section"',team(g)+film(g)+'<section class="company section"',1)
    if route.startswith('services/'):
        key=route.split('/')[-1][:-5];kind={'glazing':'glazing','windows':'replacement','repair':'repair','engineering':'glazing','supply':'replacement','height':'replacement'}[key]
        body=body.replace('<section class="section other-services">',guide(g,kind)+(film(g,'../') if key=='repair' else '')+'<section class="section other-services">',1)
    if route=='index.html':
        body=body.replace('<section class="section home-directions"', '<section class="section home-directions"',1)
        # A short visual link keeps the homepage concise; the full story lives on About.
        body=body.replace('<section class="section faq-section">','<section class="team-teaser"><div><p class="eyebrow">Площадка. Люди. Процесс.</p><h2>Увидеть, как устроена работа.</h2></div><a class="button" href="about.html#field-team">Знакомство с командой ↗</a><a class="text-button" href="about.html#site-film">Смотреть рабочее видео ↗</a></section><section class="section faq-section">',1)
    return body
