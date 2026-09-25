"""Photographic portfolio, dated comparison and one contact chooser."""
import json
import re


def contact(g, base, route):
    e = g['e']
    project = g['PBY'].get(route.split('/')[-1][:-5]) if route.startswith('projects/') else None
    query = '?project=' + project['id'] if project else ''
    phone = re.sub(r'[^+0-9]', '', g['CFG']['phone'])
    return f'''<dialog class="contact-dialog" id="contact-dialog" aria-labelledby="contact-title"><button type="button" class="contact-close" data-contact-close aria-label="Закрыть выбор способа связи">Закрыть ×</button><p class="eyebrow">Ваш следующий объект</p><h2 id="contact-title">Как вам удобнее<br>начать разговор?</h2><p class="contact-context">{('Похожий проект: '+e(project['title'])) if project else 'Выберите способ связи. Начнём с тех материалов, которые у вас уже есть.'}</p><div class="contact-options"><a href="tel:{phone}"><span class="contact-option-number">01</span><div><strong>Позвонить менеджеру</strong><span>{e(g['CFG']['manager'])}<br>{e(g['CFG']['phone'])}</span></div>{g['ARROW']}</a><a href="{base}photo-request.html{query}" data-contact-photo><span class="contact-option-number">02</span><div><strong>Показать фотографии</strong><span>Фото объекта и ваш телефон</span></div>{g['ARROW']}</a><a href="{base}request.html{query}" data-contact-project><span class="contact-option-number">03</span><div><strong>Отправить проект</strong><span>Чертежи, объёмы и описание задачи</span></div>{g['ARROW']}</a></div><a class="contact-email-link" href="mailto:{e(g['CFG']['email'])}">{e(g['CFG']['email'])}</a></dialog>'''


def comparison(g, project):
    e = g['e']
    rows = []
    for report in sorted(project.get('reports', []), key=lambda r:r['publishedAt']):
        if not report.get('published', True):
            continue
        for photo in report['photos']:
            key = photo['key']
            rows.append({'image':'../'+key if key.startswith('media/') else '../assets/'+key+'.webp',
                         'period':report['period'], 'caption':photo['caption'], 'credit':report.get('credit',''),
                         'date':('Съёмка: ' if report.get('dateKind')=='shooting' else 'Публикация: ')+'.'.join(reversed(report['publishedAt'].split('-')))})
    if len(rows)<2:
        return ''
    panels=[]
    for side,index in [('left',0),('right',len(rows)-1)]:
        row=rows[index]
        options=''.join('<option value="'+str(i)+'"'+(' selected' if i==index else '')+'>'+e(r['period']+' · '+r['caption'])+'</option>' for i,r in enumerate(rows))
        panels.append('<div class="period-panel" data-period-panel="'+side+'"><label class="js-only">'+('Первый период' if side=='left' else 'Второй период')+'<select data-period-select="'+side+'">'+options+'</select></label><figure><img src="'+e(row['image'])+'" alt="'+e(row['caption'])+'" loading="lazy"><figcaption><strong data-period-name>'+e(row['period'])+'</strong><p data-period-caption>'+e(row['caption'])+'</p><span data-period-date>'+e(row['date'])+'</span><small data-period-credit>'+e(row['credit'])+'</small></figcaption></figure></div>')
    data=json.dumps(rows,ensure_ascii=False).replace('<','\\u003c')
    return '<section class="section period-comparison" id="period-comparison"><div class="section-heading"><div><p class="eyebrow">История в фотографиях</p><h2>Два периода.<br>Один масштаб.</h2></div><p>Выберите этапы и рассмотрите изменения. Ракурсы отличаются; фотографии показывают общий ход строительства объекта.</p></div><div class="period-panels">'+''.join(panels)+'</div><button type="button" class="text-button js-only" data-period-swap>Поменять периоды местами ↔</button><script type="application/json" id="period-data">'+data+'</script></section>'


def enhance(g, route, body):
    e=g['e']
    if route=='index.html':
        body=body.replace('class="architecture-hero"','class="architecture-hero portfolio-hero"',1)
        body=body.replace('От точного узла до выразительной архитектуры. Инженерная подготовка, комплектация и монтаж.','Остекление общественных зданий, жилых кварталов и гостиниц. От инженерной подготовки до монтажа и восстановления фасада.',1)
        body=body.replace('<a class="text-button" href="request.html">Обсудить объект','<a class="text-button" data-contact-open href="request.html">Обсудить объект',1)
    if route.startswith('projects/'):
        project=next((p for p in g['CONTENT']['projects'] if p['id']==route.split('/')[-1][:-5] and p.get('published',True)),None)
        if project:
            body=body.replace('<div class="case-intro-bottom">','<p class="case-scope-lead">'+e(project['work'])+'</p><div class="case-intro-bottom">',1)
            if project['id']=='museum':
                compare=comparison(g,project)
                body=body.replace('<section class="section museum-reports"',compare+'<section class="section museum-reports"',1) if '<section class="section museum-reports"' in body else body.replace('<section class="section case-directions">',compare+'<section class="section case-directions">',1)
                if compare:body=body.replace('<nav class="museum-nav" aria-label="Разделы проекта">','<nav class="museum-nav" aria-label="Разделы проекта"><a href="#period-comparison">Сравнить периоды</a>',1)
            credits={r['asset'][:-5]:r['credit'] for r in g['PHOTO_SOURCES']['photos'] if r['asset'][:-5] in project['images']}
            if credits:
                data=json.dumps(credits,ensure_ascii=False).replace('<','\\u003c')
                body=body.replace('<div class="gallery-ribbon">','<p class="gallery-credit" data-gallery-credit></p><script type="application/json" id="gallery-credits">'+data+'</script><div class="gallery-ribbon">',1)
            body=re.sub(r'(<section class="section case-cta">.*?<a class="button[^\"]*\")',r'\1 data-contact-open',body,count=1,flags=re.S)
    if route=='photo-request.html':
        body=body.replace('<fieldset disabled><legend>','<div class="photo-project-context" id="photo-project-context" hidden></div><fieldset disabled><legend>',1)
        projects=[{'id':p['id'],'title':p['title']} for p in g['CONTENT']['projects'] if p.get('published',True)]
        body+='<script type="application/json" id="photo-projects">'+json.dumps(projects,ensure_ascii=False).replace('<','\\u003c')+'</script>'
    return body
