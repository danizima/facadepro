"""Two audience-specific project briefs, using the current editable portfolio."""
import re
from urllib.parse import urlencode
from services14 import photo_credit


def url(audience, target='quote.html', context=None, **values):
    return target + '?' + urlencode({'audience': audience, 'context': context or ('tender' if audience == 'contractor' else 'survey'), **values})


def link(g, label, href, button=False):
    return '<a class="' + ('button' if button else 'text-button') + '" href="' + g['e'](href) + '">' + g['e'](label) + ' ' + g['ARROW'] + '</a>'


def hero(g, audience, title, lead, project_id, image_key, caption):
    project = g['PBY'].get(project_id)
    media = ''
    if project and image_key in project.get('images', []):
        media = '<figure class="audience-hero15-photo">' + g['img'](image_key, caption, eager=True, sizes='(max-width: 800px) calc(100vw - 40px), 52vw') + '<figcaption><a href="projects/' + project_id + '.html">' + g['e'](project['title']) + ' ↗</a><span>' + g['e'](caption) + '</span><small>' + photo_credit(g, image_key) + '</small></figcaption></figure>'
    request = url(audience, service='glazing') if audience == 'contractor' else url(audience, 'photo-request.html')
    return '<section class="page-intro audience-hero15" data-audience-landing="' + audience + '"><nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="index.html">Главная</a><span>/</span><span>' + ('Генподрядчику' if audience == 'contractor' else 'Собственнику здания') + '</span></nav><div class="audience-hero15-grid"><div><p class="eyebrow">' + ('Тендер · Подготовка · Монтаж' if audience == 'contractor' else 'Обследование · Ремонт · Эксплуатация') + '</p><h1>' + title + '</h1><p class="audience-hero15-lead">' + g['e'](lead) + '</p><div class="audience-actions15">' + link(g, 'Передать проект на расчёт' if audience == 'contractor' else 'Начать с фотографий', request, True) + link(g, 'Что подготовить', '#audience-inputs') + '</div></div>' + media + '</div></section>'


def navigation(audience):
    sections = [('audience-inputs', 'Исходные данные'), ('audience-responsibility' if audience == 'contractor' else 'audience-access', 'Границы работ' if audience == 'contractor' else 'Условия доступа'), ('audience-process', 'Следующие шаги'), ('audience-cases', 'Наш опыт'), ('audience-start', 'Начать обсуждение')]
    return '<nav class="audience-nav15" aria-label="Разделы страницы">' + ''.join('<a href="#' + key + '">' + label + '</a>' for key, label in sections) + '</nav>'


def cards(g, heading, intro, rows, section_id, kicker='До первого разговора'):
    e = g['e']
    return '<section class="section audience-section15" id="' + section_id + '"><div class="section-heading"><div><p class="eyebrow">' + e(kicker) + '</p><h2>' + heading + '</h2></div><p>' + e(intro) + '</p></div><div class="audience-cards15">' + ''.join('<article><span class="audience-index15">' + f'{i+1:02}' + '</span><h3>' + e(title) + '</h3><p>' + e(text) + '</p></article>' for i, (title, text) in enumerate(rows)) + '</div></section>'


def cases(g, ids, title):
    projects = [g['PBY'][key] for key in ids if key in g['PBY']]
    if not projects:
        return ''
    return '<section class="section audience-section15" id="audience-cases"><div class="section-heading"><div><p class="eyebrow">Работы из портфолио</p><h2>' + title + '</h2></div><p>Откройте объект: состав нашего участия и период работ указаны в его карточке.</p></div><div class="project-grid audience-projects15' + (' audience-projects15-three' if len(projects) == 3 else '') + '">' + ''.join(g['card'](project) for project in projects) + '</div></section>'


def process(g, audience):
    rows = [('Получаем исходные данные', 'Сверяем чертежи, спецификации, объёмы и срок подготовки предложения.'), ('Уточняем границы и график', 'Обсуждаем состав поставки, монтажные участки, условия доступа и ответственность сторон.'), ('Согласуем предложение', 'Фиксируем включённые работы, необходимые уточнения и порядок выхода на объект.')] if audience == 'contractor' else [('Разбираем вашу задачу', 'Смотрим фотографии и историю дефекта, уточняем систему и условия его появления.'), ('Определяем необходимость осмотра', 'Обсуждаем доступ к участку и состав обследования для подготовки ремонтного решения.'), ('Согласуем ремонт и проверку', 'Определяем участки, последовательность работ, ограничения эксплуатации и способ проверки результата.')]
    return cards(g, 'От исходных данных<br>к согласованному объёму.', 'Каждый следующий шаг связан с данными и условиями вашего объекта.', rows, 'audience-process', 'Порядок работы')


def contractor(g):
    body = hero(g, 'contractor', 'Фасадный участок.<br>В вашем графике.', 'Передайте проект для тендерного расчёта или согласования отдельного этапа. Свяжем объём работ с готовностью площадки, комплектацией и условиями монтажа.', 'museum', 'museum-glass-2026', 'Монтаж светопрозрачных конструкций музейно-театрального комплекса.') + navigation('contractor')
    body += cards(g, 'Что нужно<br>для предметного расчёта.', 'Передайте то, что уже готово. Недостающие данные обозначим при обсуждении предложения.', [
        ('Чертежи и спецификации', 'Фасады, разрезы, узлы и ведомости изделий. Для большого комплекта — ссылка на папку с проектом.'),
        ('Объём и система', 'Монтажная площадь или ведомость элементов, высота, профильная система и требования к заполнениям.'),
        ('График и дата КП', 'Желаемая дата предложения, начало работ, очереди и срок готовности каждого монтажного участка.'),
        ('Условия площадки', 'Адрес, проезд, разгрузка, хранение, доступ к фасаду и доступная техника.'),
    ], 'audience-inputs')
    rows = [
        ('Инженерная подготовка', 'Актуальный проект, обмеры, состояние оснований, согласующие специалисты.', 'Какие замеры и решения включены, кто согласует узлы и передаёт рабочую документацию.'),
        ('Конструкции и материалы', 'Чья поставка, комплектность изделий, спецификации и очередность готовности.', 'Поставка заказчика или наша комплектация; состав крепежа, заполнений и примыканий.'),
        ('Техника и доступ', 'Подъёмники, леса, кран, кровля, электричество и доступные рабочие зоны.', 'Кто обеспечивает каждый вид техники и подготовку участка, сроки доступности.'),
        ('Логистика и хранение', 'Маршрут доставки, разгрузка, перенос по объекту и место хранения.', 'Ответственность за доставку, разгрузку, перемещение и сохранность партий.'),
        ('Приёмка и документация', 'Требования заказчика к проверке участка и передаче результата.', 'Порядок промежуточной и итоговой приёмки, состав исполнительных материалов.'),
    ]
    body += '<section class="section audience-section15" id="audience-responsibility"><div class="section-heading"><div><p class="eyebrow">До расчёта и выхода на объект</p><h2>Границы ответственности.<br>По каждому этапу.</h2></div><p>Распределение обязанностей согласуем под выбранный формат заказа и закрепим в предложении и договоре.</p></div><div class="audience-matrix15"><table><caption>Вопросы для согласования ответственности сторон</caption><thead><tr><th scope="col">Участок</th><th scope="col">Что уточняем</th><th scope="col">Что фиксируем</th></tr></thead><tbody>' + ''.join('<tr><th scope="row">' + g['e'](title) + '</th><td data-label="Что уточняем">' + g['e'](inputs) + '</td><td data-label="Что фиксируем">' + g['e'](result) + '</td></tr>' for title, inputs, result in rows) + '</tbody></table></div></section>'
    body += '<section class="section audience-pack15"><div><p class="eyebrow">Для проверки подрядчика</p><h2>Материалы<br>для вашей команды.</h2><p>Соберите реквизиты, подходящие проекты и опубликованные документы. Дополнительные сведения для тендера можно запросить у менеджера.</p></div><div>' + link(g, 'Собрать пакет подрядчика', 'kit.html', True) + link(g, 'Запросить документы', 'request.html?audience=contractor&intent=documents') + '</div></section>'
    body += process(g, 'contractor') + cases(g, ['museum', 'brusnika', 'restaurant'], 'Разные участки.<br>Конкретный состав работ.')
    body += '<section class="section audience-start15" id="audience-start"><div><p class="eyebrow">Тендер или рабочий расчёт</p><h2>Передайте проект.<br>Обсудим условия.</h2><p>Формат участия и желаемую дату КП перенесём в заявку. Чертежи можно приложить там или передать ссылкой на папку.</p></div><form class="audience-brief15" action="quote.html" method="get"><input type="hidden" name="audience" value="contractor"><input type="hidden" name="context" value="tender"><input type="hidden" name="service" value="glazing"><label>Формат участия<select name="scope"><option value="installation">Только монтаж</option><option value="supply-installation">Поставка и монтаж</option></select></label><label>Желаемая дата КП<input type="date" name="deadline" aria-describedby="audience-deadline-note"></label><p id="audience-deadline-note">Укажите желаемую дату. Возможность подготовки предложения к этому сроку уточнит менеджер.</p><button class="button" type="submit">Перейти к заявке ' + g['ARROW'] + '</button></form></section>'
    return body


def owner(g):
    body = hero(g, 'owner', 'Фасад работает.<br>Здание живёт.', 'Протечка, повреждённое остекление или изношенные элементы? Начнём с описания проблемы и доступных фотографий. Согласуем обследование и ремонт с учётом работы здания.', 'burny', 'burny-evening', 'Общий вид МФК «Бурный». Наше участие — ремонт фасада и светопрозрачные перегородки.') + navigation('owner')
    body += cards(g, 'Опишите проблему.<br>Покажите участок.', 'Для первого обращения достаточно доступных сведений. Потребность в осмотре и замерах определим после знакомства с объектом.', [
        ('Где проявляется дефект', 'Общий вид здания, этаж и расположение проблемного участка, фотографии снаружи и изнутри.'),
        ('Когда и при каких условиях', 'После дождя, при ветре, в холодный период или постоянно. Когда заметили впервые и как менялась ситуация.'),
        ('Что уже делали', 'Предыдущие ремонты, замены, обследования и их результат. Документы и сведения о системе — если сохранились.'),
        ('Каким должен быть результат', 'Устранить конкретный дефект, заменить элементы или обсудить восстановление нескольких участков фасада.'),
    ], 'audience-inputs')
    body += cards(g, 'Учитываем<br>работу здания.', 'Обсудим ограничения до назначения осмотра и подготовки предложения.', [
        ('Доступ к участку', 'Можно ли попасть внутрь помещений, на кровлю и к фасаду; кто согласует и сопровождает доступ.'),
        ('Часы и режим работы', 'Время работы здания, допустимые окна для шума и работ, условия доступа в занятые помещения.'),
        ('Размещение техники', 'Подъезд, площадка для подъёмника, возможность ограждения участка и ограничения рядом с входами.'),
        ('Последовательность ремонта', 'Какие зоны можно передавать поэтапно, когда согласовать отключения или ограничения прохода.'),
    ], 'audience-access', 'Эксплуатация и организация')
    body += '<section class="section audience-choice15"><div><p class="eyebrow">Выберите удобный старт</p><h2>Фотографии.<br>Или подробная заявка.</h2></div><article><h3>Есть несколько фотографий</h3><p>Пришлите общий вид и место дефекта, кратко опишите ситуацию. Этого достаточно для первого разговора.</p>' + link(g, 'Отправить фотографии', url('owner', 'photo-request.html'), True) + '</article><article><h3>Есть чертежи и история ремонта</h3><p>Передайте исходные документы, ссылку на папку и ограничения эксплуатации в полной заявке.</p>' + link(g, 'Обсудить обследование и ремонт', url('owner', 'request.html', service='repair'), True) + '</article></section>'
    body += process(g, 'owner') + cases(g, ['burny', 'golden-horn'], 'Опыт восстановления<br>существующих фасадов.')
    body += '<section class="section audience-start15" id="audience-start"><div><p class="eyebrow">Первый разговор</p><h2>Покажите свой фасад.</h2><p>Опишите место дефекта, историю проблемы и доступ к участку. После изучения исходных данных согласуем следующий шаг.</p></div><div class="audience-actions15">' + link(g, 'Начать с фотографий', url('owner', 'photo-request.html'), True) + link(g, 'Передать документы', url('owner', 'request.html', service='repair')) + '</div></section>'
    return body


def pages(g):
    g['page']('for-contractors.html', 'Фасадные работы для генподрядчика', 'Тендерный расчёт фасадных работ: исходные данные, границы ответственности, сроки КП, монтажный график и материалы для проверки подрядчика.', contractor(g), 'contractors')
    g['page']('for-owners.html', 'Обследование и ремонт фасада для собственника', 'Фотографии и история дефекта, обследование и ремонт фасада с учётом доступа, часов работы и эксплуатации здания.', owner(g), 'services')


def entry(g):
    return '<nav class="audience-entry15" aria-label="Ваш сценарий сотрудничества"><a href="for-contractors.html"><span class="eyebrow">Генподрядчику</span><strong>Расчёт. Границы. График.</strong><span>Тендер и подготовка монтажного участка ' + g['ARROW'] + '</span></a><a href="for-owners.html"><span class="eyebrow">Собственнику здания</span><strong>Обследование и ремонт.</strong><span>С учётом работы вашего объекта ' + g['ARROW'] + '</span></a></nav>'


def enhance(g, route, body):
    if route == 'index.html':
        marker = '<nav class="home-materials"'
        body = body.replace(marker, entry(g) + marker, 1) if marker in body else body + entry(g)
    if route == 'contractors.html':
        end = body.find('</section>')
        if end >= 0:
            end += len('</section>')
            teaser = '<aside class="audience-route15"><p>Готовите тендер или передаёте монтажный участок?</p>' + link(g, 'Исходные данные, ответственность и срок КП', 'for-contractors.html') + '</aside>'
            body = body[:end] + teaser + body[end:]
    if route == 'about.html':
        def insert(match):
            audience, panel = match[1], match[0]
            target, label = ('for-contractors.html', 'Генподрядчику: подготовка расчёта') if audience == 'contractor' else ('for-owners.html', 'Собственнику: обследование и ремонт')
            marker = '</div><div class="audience-projects">'
            return panel.replace(marker, link(g, label, target) + marker, 1)
        body = re.sub(r'<section class="audience-panel" id="audience-panel-(contractor|owner)".*?</section>', insert, body, flags=re.S)
    return body
