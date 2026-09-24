"""Release 7: concise contact flow, project comparison and real company materials."""
import json

def callback(g,base=''):
 e=g['e']
 return '<section class="section callback-section" id="callback"><div><p class="eyebrow">Начнём с разговора</p><h2>Расскажите<br>о вашем объекте.</h2><p>Оставьте номер и удобное время. Менеджер свяжется с вами, чтобы уточнить задачу.</p><a class="text-button" href="'+base+'request.html">Есть чертежи? Отправить полную заявку ↗</a></div><form class="callback-form" method="post" action="/api/callback"><label>Как к вам обращаться<input name="name" autocomplete="name" maxlength="100" required></label><label>Телефон<input name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="40" placeholder="+7 …" required></label><label>Удобное время и часовой пояс <span class="optional">необязательно</span><input name="preferredTime" maxlength="160" placeholder="Например, будни после 14:00, Москва"></label><label class="callback-trap" aria-hidden="true">Сайт<input name="website" tabindex="-1" autocomplete="off"></label><label class="check-line"><input name="consent" type="checkbox" required><span>Согласен на <a href="'+base+'privacy.html">обработку данных</a> для ответа на обращение.</span></label><button class="button" type="submit">Попросить перезвонить ↗</button><p class="callback-status" role="status" tabindex="-1"></p><p class="callback-hint">Указанное время — пожелание для связи, а не подтверждённая запись.</p><noscript><p>Для отправки формы включите JavaScript или позвоните <a href="tel:'+''.join(c for c in g['CFG']['phone'] if c in '+0123456789')+'">'+e(g['CFG']['phone'])+'</a>.</p></noscript></form></section>'

def materials(g,project=None):
 e=g['e'];rows=[r for r in g['CONTENT'].get('materials',[]) if r.get('published') and r.get('confirmed') and (not r.get('project') or r['project'] in g['PBY']) and (not project or r.get('project')==project)]
 if not rows:return ''
 base='../' if project else '';cards=[]
 for r in rows:
  title=e(r['title']);text=e(r.get('text',''));file=base+r['file'] if r.get('file') else ''
  if r['kind']=='video':
   poster=base+r['poster'] if r['poster'].startswith('media/') else base+'assets/'+r['poster']+'.webp'
   top='<video controls playsinline preload="none" poster="'+poster+'" aria-label="'+title+'"><source src="'+file+'" type="'+('video/webm' if file.endswith('.webm') else 'video/mp4')+'">Ваш браузер не поддерживает видео. <a href="'+file+'">Скачать видео</a></video>'
  elif r['kind']=='review':top='<blockquote>'+text+'</blockquote><p class="material-author">'+e(r['author'])+'</p>';text=''
  else:top='<span class="material-kind">PDF / Документ</span>'
  link='<a class="text-button" href="'+file+'" target="_blank" rel="noopener">Открыть документ ↗</a>' if file and r['kind']!='video' else ''
  date='<time datetime="'+r['date']+'">'+'.'.join(reversed(r['date'].split('-')))+'</time>' if r.get('date') else ''
  cards.append('<article class="material-card">'+top+'<div><h3>'+title+'</h3><p>'+text+'</p>'+date+link+'</div></article>')
 return '<section class="section materials-section"><div class="section-heading"><div><p class="eyebrow">Опыт в деталях</p><h2>На объектах.<br>В отзывах. В документах.</h2></div></div><div class="materials-grid">'+''.join(cards)+'</div></section>'

def compare(g):
 cards=''.join('<label class="compare-choice"><input type="checkbox" value="'+p['id']+'"><span>'+g['img'](p['images'][0],p['title'])+'<strong>'+p['title']+'</strong><small>'+p['location']+'</small></span></label>' for p in g['P'])
 body=g['intro']('Портфолио / Сравнение','Разные объекты.<br>Близкие задачи.','Выберите до трёх проектов и сравните состав нашего участия, масштаб и особенности.')+'<section class="section compare-section"><form id="compare-picker"><fieldset><legend>Выберите 2–3 проекта</legend><div class="compare-choices">'+cards+'</div></fieldset></form><p id="compare-status" role="status" aria-live="polite"></p><div class="compare-actions"><button type="button" class="button" id="compare-pdf" disabled>Скачать выбранные проекты PDF ↓</button><button type="button" class="text-button" id="compare-copy" disabled>Копировать ссылку ↗</button><button type="button" class="text-button" id="compare-clear">Очистить выбор ×</button></div><div id="compare-result"></div><noscript><p>Для сравнения включите JavaScript. Все объекты доступны в <a href="projects.html">каталоге проектов</a>.</p></noscript></section>'
 g['page']('compare.html','Сравнение проектов','Сравните проекты ФАСАД.PRO по составу работ, масштабу и особенностям.',body,'projects')
