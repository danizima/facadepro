"""Project links, transfer feedback and the private client continuation page."""
import re
import shutil


LINK = '<label class="project-link-field">Ссылка на проект <span class="optional">необязательно</span><input name="projectLink" type="url" maxlength="2000" inputmode="url" placeholder="https://…" aria-describedby="project-link-hint"><span id="project-link-hint" class="field-hint">Если проект не помещается во вложения, добавьте ссылку на папку с доступом для просмотра.</span></label>'


def transfer(prefix):
    return '<div id="'+prefix+'-transfer" class="transfer-feedback" hidden><progress id="'+prefix+'-progress" max="100" value="0" aria-label="Загрузка материалов"></progress><p id="'+prefix+'-progress-text" role="status" aria-live="polite"></p></div>'


def continuation(prefix):
    return '<div id="'+prefix+'-continuation" class="request-continuation" hidden><p>Сохраните личную ссылку, чтобы дослать материалы и узнать следующий шаг.</p><div class="result-actions"><a class="button" id="'+prefix+'-open-continuation" href="followup.html">Открыть обращение ↗</a><button class="text-button" type="button" id="'+prefix+'-copy-continuation">Скопировать ссылку</button><button class="text-button" type="button" id="'+prefix+'-save-continuation">Сохранить ссылку ↓</button></div><p class="privacy-note">Личная ссылка открывает доступ к обращению. Передавайте её только участникам вашего проекта.</p><p id="'+prefix+'-continuation-status" role="status"></p></div>'


def enhance(g, route, body):
    if route in ('request.html', 'quote.html'):
        body = body.replace('<input type="hidden" name="solution" value="">', '<input type="hidden" name="solution" value=""><input type="hidden" name="scope" value=""><div id="request-scope-context" class="solution-context" hidden></div>', 1)
        body = body.replace('<div class="upload-zone" id="upload-zone">', LINK+'<div class="upload-zone" id="upload-zone">', 1)
        body = body.replace('<p class="form-status"', transfer('request')+'<p class="form-status"', 1)
        body = body.replace('<a class="text-button" id="after-submit"', continuation('request')+'<a class="text-button" id="after-submit"', 1)
    if route == 'photo-request.html':
        body = body.replace('<label class="callback-trap"', LINK+'<label class="callback-trap"', 1)
        body = body.replace('<p id="photo-send-status"', transfer('photo')+'<p id="photo-send-status"', 1)
        body = body.replace('<a class="button" href="projects.html">Посмотреть наши работы', continuation('photo')+'<a class="button" href="projects.html">Посмотреть наши работы', 1)
    return body


def pages(g):
    """This route intentionally loads only its own controller, without analytics."""
    e, cfg = g['e'], g['CFG']
    phone = re.sub(r'[^+0-9]', '', cfg['phone'])
    body = '''<header class="followup-header"><a href="index.html" aria-label="ФАСАД.PRO — на главную"><img src="assets/logo.svg" width="160" height="44" alt="ФАСАД.PRO"></a><span>Ваше обращение</span></header>
<main id="main" class="followup-main"><div class="followup-intro"><p class="eyebrow">Личная страница проекта</p><h1>Продолжим<br>работу над задачей.</h1><p>Здесь можно передать дополнительные материалы и посмотреть следующий шаг.</p></div>
<p id="followup-load-status" class="followup-load-status" role="status" tabindex="-1">Открываем обращение…</p><button class="text-button" id="followup-retry" type="button" hidden>Повторить загрузку</button>
<div id="followup-content" hidden><section class="followup-overview" aria-labelledby="followup-reference"><div><p class="eyebrow">Номер обращения</p><h2 id="followup-reference"></h2><p id="followup-status" class="followup-status"></p><p id="followup-next"></p></div><aside><p class="eyebrow">Ваш менеджер</p><p id="followup-manager"></p><a id="followup-phone" hidden></a><a id="followup-email" hidden></a><p id="followup-expires" class="privacy-note"></p></aside></section>
<section id="followup-quote" class="followup-quote" aria-labelledby="followup-quote-title" hidden><div><p class="eyebrow">Коммерческое предложение</p><h2 id="followup-quote-title">Ваше КП готово.</h2><p id="followup-quote-version" class="followup-quote-version"></p><dl class="followup-quote-details"><div><dt>Стоимость</dt><dd id="followup-quote-amount"></dd></div><div><dt>Срок выполнения</dt><dd id="followup-quote-timeframe"></dd></div><div><dt>Опубликовано</dt><dd id="followup-quote-date"></dd></div></dl></div><div class="followup-quote-file"><p id="followup-quote-name"></p><p id="followup-quote-size" class="privacy-note"></p><div class="followup-quote-actions"><button id="followup-quote-download" class="button" type="button">Скачать КП · PDF ↓</button><button id="followup-quote-question" class="text-button" type="button">Задать вопрос по КП</button></div><p id="followup-quote-feedback" role="status" aria-live="polite"></p></div></section>
<section id="followup-response" class="followup-response" aria-labelledby="followup-response-title" hidden><div><p class="eyebrow">Ответ на предложение</p><h2 id="followup-response-title">Как продолжим?</h2><p>Выберите следующий шаг. Менеджер получит ваш ответ и свяжется с вами.</p><div id="followup-response-latest" class="followup-response-latest" hidden><p id="followup-response-last-choice"></p><time id="followup-response-last-date"></time><p id="followup-response-last-comment"></p></div></div><form id="followup-response-form" novalidate><fieldset><legend class="visually-hidden">Ваш ответ на коммерческое предложение</legend><div class="followup-response-choices" role="group" aria-label="Следующий шаг по КП"><button type="button" data-quote-choice="discuss" aria-pressed="false">Обсудить условия</button><button type="button" data-quote-choice="reprice" aria-pressed="false">Нужен пересчёт</button><button type="button" data-quote-choice="proceed" aria-pressed="false">Готов перейти к договору</button></div><label for="followup-response-comment">Комментарий <span class="optional">необязательно</span><textarea id="followup-response-comment" rows="3" maxlength="1500" placeholder="Что нужно уточнить или изменить?"></textarea></label><button id="followup-response-submit" class="button" type="submit" disabled>Отправить ответ ↗</button></fieldset><p id="followup-response-status" role="status" aria-live="polite" tabindex="-1"></p></form></section>
<section class="followup-materials" aria-labelledby="followup-materials-title"><div><p class="eyebrow">Дополнение к обращению</p><h2 id="followup-materials-title">Передать материалы.</h2><p>Добавьте комментарий, чертежи, фотографии или ссылку на проект. Они попадут в то же обращение.</p><p class="privacy-note">Файлы доступны команде, которая работает над вашим проектом.</p></div><form id="followup-form" novalidate><fieldset><legend class="visually-hidden">Дополнительные материалы</legend><label>Комментарий<textarea name="comment" rows="4" maxlength="3000" placeholder="Уточнение задачи или описание вложений"></textarea></label>'''+LINK+'''
<div class="followup-upload" id="followup-drop"><label for="followup-files"><strong>Приложить файлы</strong><span>Выберите или перетащите сюда</span></label><input id="followup-files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.dwg,.dxf,.xlsx,.docx,.txt,.zip" aria-describedby="followup-upload-hint"><p id="followup-upload-hint">До 5 файлов, до 10 МБ каждый и до 25 МБ суммарно. PDF, фото, DWG, DXF, XLSX, DOCX, TXT, ZIP.</p></div><ul id="followup-selected-files" class="followup-selected-files" aria-label="Выбранные файлы"></ul><p id="followup-file-error" class="field-error" role="status"></p><button class="button" id="followup-submit" type="submit">Отправить дополнение ↗</button></fieldset>'''+transfer('followup')+'''
<p id="followup-send-status" role="status" aria-live="polite" tabindex="-1"></p></form></section>
<section class="followup-history" aria-labelledby="followup-history-title"><p class="eyebrow">Полученные дополнения</p><h2 id="followup-history-title">История материалов.</h2><div id="followup-updates"></div></section>
<section class="followup-save"><p>Сохраните личную ссылку, чтобы вернуться к обращению.</p><div><button class="text-button" id="followup-copy-link" type="button">Скопировать ссылку</button><button class="text-button" id="followup-save-link" type="button">Сохранить ссылку ↓</button></div><p class="privacy-note">Личная ссылка открывает доступ к обращению. Передавайте её только участникам вашего проекта.</p><p id="followup-link-status" role="status"></p></section></div>
<noscript><p>Для личной страницы включите JavaScript или свяжитесь с менеджером.</p></noscript></main>'''
    body += '<footer class="followup-footer"><a href="tel:'+phone+'">'+e(cfg['phone'])+'</a><a href="mailto:'+e(cfg['email'])+'">'+e(cfg['email'])+'</a><a href="privacy.html">Обработка данных</a><span>© 2026 ФАСАД.PRO</span></footer>'
    content = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#252525"><title>Ваше обращение — ФАСАД.PRO</title><link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="followup14.css"><script src="followup14.js" defer></script></head><body class="followup-page">'+body+'</body></html>'
    (g['OUT']/'followup.html').write_text(content)
    for name in ('followup14.js', 'followup14.css'):
        source, target = g['ROOT']/'site'/name, g['OUT']/name
        if source.resolve() != target.resolve():
            shutil.copyfile(source, target)
