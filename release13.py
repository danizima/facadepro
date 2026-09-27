"""A clear first step and project evidence read from the editable content."""
import re


def entry_paths(g):
    rows = [
        ('01', 'Есть проект', 'Запросить КП', 'Чертежи, объёмы и сроки для расчёта.', 'quote.html'),
        ('02', 'Есть проблема', 'Отправить фото', 'Покажите участок фасада или конструкцию.', 'photo-request.html'),
        ('03', 'Проверяю подрядчика', 'Получить материалы', 'Реквизиты компании и портфолио для согласования.', 'kit.html'),
    ]
    return '<nav class="home-entry-paths" aria-label="С чего начать">' + ''.join(
        '<a href="'+url+'"><span class="entry-number">'+number+'</span><span class="entry-copy"><strong>'+title+'</strong><span>'+description+'</span><b>'+action+' '+g['ARROW']+'</b></span></a>'
        for number,title,action,description,url in rows) + '</nav>'


def home_projects(g):
    e = g['e']
    featured = [g['PBY'][key] for key in ['museum', 'restaurant', 'burny', 'golden-horn', 'brusnika'] if key in g['PBY']]
    if not featured:
        return ''
    cards = []
    for i,p in enumerate(featured):
        case = p.get('case', {})
        result = '<p class="proof-result"><span>Результат / участие</span>'+e(case['result'])+'</p>' if case.get('result') else ''
        facts = [(label,p.get(key,'')) for key,label in [('volume','Объём / участие'),('period','Период / срок')] if p.get(key)]
        cards.append('<article class="proof-card'+(' proof-featured' if i==0 else '')+'"><a class="proof-image" href="projects/'+p['id']+'.html">'+g['img']((p['images'] or [None])[0],p['title'],sizes='(max-width: 800px) calc(100vw - 40px), 50vw')+'<span>Посмотреть проект '+g['ARROW']+'</span></a><div class="proof-copy"><p class="eyebrow">'+e(p['type'])+'</p><h3><a href="projects/'+p['id']+'.html">'+e(p['title'])+'</a></h3><p class="proof-work">'+e(p['work'])+'</p><dl>'+''.join('<div><dt>'+label+'</dt><dd>'+e(value)+'</dd></div>' for label,value in facts)+'</dl>'+result+'</div></article>')
    return '<section class="section home-proof" id="projects"><div class="section-heading"><div><p class="eyebrow">01 / Наш опыт</p><h2>Объект. Работа.<br>Результат.</h2></div><div class="section-heading-note"><p>Отдельные здания, фасады и жилые кварталы.<br>Состав нашего участия — в каждом кейсе.</p><a class="text-button" href="projects.html">Все проекты '+g['ARROW']+'</a></div></div><div class="home-proof-grid">'+''.join(cards)+'</div></section>'


def brief(g,p):
    e=g['e']
    repeat=bool(p.get('volume')) and p['volume'].casefold() in p.get('period','').casefold()
    facts = [('Срок строительства' if repeat else 'Объём / участие',p.get('volume',''))]
    if not repeat:
        facts.append(('Период / срок',p.get('period','')))
    result=p.get('case',{}).get('result','')
    return '<section class="section project-brief" aria-label="Ключевые сведения о проекте"><dl>'+''.join('<div><dt>'+label+'</dt><dd>'+e(value)+'</dd></div>' for label,value in facts if value)+'</dl>'+('<div class="project-brief-result"><p class="eyebrow">Результат / участие</p><p>'+e(result)+'</p></div>' if result else '')+'</section>'


def apply_release13(g,route,body):
    if route=='index.html':
        body=re.sub(r'<div class="architecture-actions">.*?</div>', lambda _: '<div class="architecture-actions">'+g['button']('Запросить КП','quote.html',True)+'<a class="text-button" href="#projects">Посмотреть проекты '+g['ARROW']+'</a></div>',body,count=1,flags=re.S)
        body=re.sub(r'<nav class="home-shortcuts".*?</nav>',lambda _: entry_paths(g),body,count=1,flags=re.S)
        body=re.sub(r'<section class="section projects visual-projects home-projects".*?</section>',lambda _: home_projects(g),body,count=1,flags=re.S)
        body=re.sub(r'<nav class="home-materials".*?</nav>','',body,count=1,flags=re.S)
    if route.startswith('projects/'):
        p=g['PBY'].get(route.split('/')[-1][:-5])
        if p:
            body=re.sub(r'<section class="case-metrics">.*?</section>','',body,count=1,flags=re.S)
            # The participation figures and outcome appear before the gallery,
            # not behind a sequence of architectural photographs.
            at=body.find('<figure class="museum-cover"') if p['id']=='museum' else body.find('<section id="project-photos"')
            if at<0:
                at=body.find('<section class="project-gallery')
            if at>=0:
                body=body[:at]+brief(g,p)+body[at:]
            body=body.replace('За архитектурой —<br>точная работа.','Задача и состав<br>нашей работы.',1)
            # The facts are already shown in the brief and narrative. Keep the
            # PDF section about saving the same information, without a repeat.
            evidence=re.search(r'<section class="section project-evidence".*?</section>',body,re.S)
            if evidence:
                compact=re.sub(r'<dl>.*?</dl>','',evidence[0],count=1,flags=re.S)
                compact=compact.replace('с фотографией, объёмом и периодом участия','с фотографией, объёмом, периодом и описанием работ')
                body=body[:evidence.start()]+compact+body[evidence.end():]
    return body


enhance=apply_release13
