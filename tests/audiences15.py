"""Check audience pages against current source portfolio and safe URL contracts."""
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import html
import json
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import audiences15

source = json.loads((ROOT/'source/content.json').read_text())
projects = {p['id']: p for p in source['projects'] if p.get('published', True)}
made = {}
g = {
    'e': lambda value: html.escape(str(value), quote=True),
    'PBY': projects,
    'ARROW': '<svg aria-hidden="true"></svg>',
    'PHOTO_SOURCES': json.loads((ROOT/'source/photo-sources.json').read_text()),
    'img': lambda key, alt, *args, **kwargs: '<img src="assets/'+html.escape(key)+'.webp" alt="'+html.escape(alt, quote=True)+'">',
    'card': lambda project: '<article data-project-id="'+project['id']+'"><a href="projects/'+project['id']+'.html">'+html.escape(project['title'])+'</a></article>',
    'page': lambda route, title, description, body, active: made.update({route: {'title': title, 'description': description, 'body': body, 'active': active}}),
}
audiences15.pages(g)
assert set(made) == {'for-contractors.html', 'for-owners.html'}
contractor, owner = made['for-contractors.html']['body'], made['for-owners.html']['body']
for body in [contractor, owner]:
    assert body.count('<h1>') == 1
    assert 'id="audience-inputs"' in body and 'id="audience-process"' in body and 'id="audience-start"' in body
    assert 'id="audience-cases"' in body
    assert not any(value in body for value in ['Гарантируем', 'За 24 часа', 'от 1000 ₽', 'Сертификат №', 'Оренстрой'])
assert '<table>' in contractor and '<caption>' in contractor
for subject in ['Инженерная подготовка', 'Конструкции и материалы', 'Техника и доступ', 'Логистика и хранение', 'Приёмка и документация']:
    assert subject in contractor
assert 'action="quote.html" method="get"' in contractor
assert 'name="deadline"' in contractor and 'value="supply-installation"' in contractor
assert 'kit.html' in contractor and 'intent=documents' in contractor
for subject in ['Когда и при каких условиях', 'Что уже делали', 'Доступ к участку', 'Часы и режим работы', 'Размещение техники', 'Последовательность ремонта']:
    assert subject in owner
assert 'photo-request.html?audience=owner&amp;context=survey' in owner
assert 'request.html?audience=owner&amp;context=survey&amp;service=repair' in owner
for identifier in ['museum', 'brusnika', 'restaurant']:
    assert 'data-project-id="'+identifier+'"' in contractor
for identifier in ['burny', 'golden-horn']:
    assert 'data-project-id="'+identifier+'"' in owner
for body in [contractor, owner]:
    assert 'Фото:' in body, 'existing portfolio image sources remain credited'
    assert '.webp' in body
assert parse_qs(urlparse(audiences15.url('contractor', service='glazing')).query) == {'audience': ['contractor'], 'context': ['tender'], 'service': ['glazing']}
home = audiences15.enhance(g, 'index.html', '<nav class="home-materials"><a href="kit.html">Материалы</a></nav>')
assert 'for-contractors.html' in home and 'for-owners.html' in home and 'href="kit.html"' in home
teaser = audiences15.enhance(g, 'contractors.html', '<section><h1>Партнёрам</h1></section><section>Исходная информация</section>')
assert 'for-contractors.html' in teaser and 'Исходная информация' in teaser
panels = ''.join('<section class="audience-panel" id="audience-panel-'+role+'"><div class="audience-copy"><a href="request.html?audience='+role+'">Заявка</a></div><div class="audience-projects">Опыт</div></section>' for role in ['contractor', 'developer', 'owner'])
about = audiences15.enhance(g, 'about.html', panels)
assert 'for-contractors.html' in about and 'for-owners.html' in about
assert all('request.html?audience='+role in about for role in ['contractor', 'developer', 'owner']), 'existing direct request shortcuts stay available'
assert audiences15.enhance(g, 'contacts.html', 'Original contact page') == 'Original contact page'
missing = {**g, 'PBY': {}}
for body in [audiences15.contractor(missing), audiences15.owner(missing)]:
    assert 'data-project-id=' not in body and '<img ' not in body, 'unpublished/missing projects cannot create fabricated case or image references'
print('PASS v15 audience pages: substantive tender/repair inputs, responsibility matrix, real credited portfolio, useful navigation, native deadline/scope transfer, published-only cases and safe URLs')
