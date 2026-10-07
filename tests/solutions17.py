"""Catalog and public-data contracts for customer task selection."""
from pathlib import Path
import copy
import html
import json
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import release4

solutions = json.loads((ROOT/'source/solutions.json').read_text())
services = json.loads((ROOT/'source/services.json').read_text())
content = json.loads((ROOT/'source/content.json').read_text())
service_ids = {item['id'] for item in services}
project_ids = {item['id'] for item in content['projects']}
scopes = {'installation', 'supply-installation', 'engineering', 'supply', 'height'}
ids = [item['id'] for item in solutions]
assert len(ids) == len(set(ids))
for item in solutions:
    assert re.fullmatch(r'[a-z][a-z0-9-]{0,19}', item['id']), 'solution fits the existing 20-character API field'
    assert item['services'] and set(item['services']) <= service_ids
    assert set(item['projects']) <= project_ids, 'every example comes from the actual portfolio'
    assert not item.get('scope') or item['scope'] in scopes

by_id = {item['id']: item for item in solutions}
assert by_id['windows']['scope'] == 'supply-installation'
assert by_id['installation']['scope'] == 'installation'
assert by_id['measurements']['scope'] == 'engineering'
assert set(by_id['windows']['services']) == {'windows'}
assert by_id['help']['consultation'] is True and not by_id['help'].get('scope')
assert 'Направление работ пока не определено' in by_id['help']['requestNote']
assert all(by_id[key]['detail'] is False for key in ['windows', 'installation', 'measurements', 'help']), 'new scenarios do not invent detail-page routes'

# Hide an existing project that is referenced by a scenario. Neither its content
# nor its image metadata may be embedded in the public selector/map/portfolio.
private_content = copy.deepcopy(content)
private_project = private_content['projects'][0]
private_project.update(published=False, title='PRIVATE_PROJECT_17', work='PRIVATE_WORK_17')
made = {}
g = {
    'ROOT': ROOT, 'CONTENT': private_content, 'S': services, 'CFG': content['settings'],
    'e': lambda value: html.escape(str(value), quote=True),
    'intro': lambda *args: '<h1>'+str(args[1])+'</h1>',
    'button': lambda label, href, *args: '<a href="'+html.escape(href, quote=True)+'">'+html.escape(label)+'</a>',
    'page': lambda route, title, description, body, active: made.update({route: body}),
}
release4.pages(g)
assert set(made) == {'map.html', 'portfolio.html', 'solutions.html'}
for body in made.values():
    assert 'PRIVATE_PROJECT_17' not in body and 'PRIVATE_WORK_17' not in body
    payload = json.loads(re.search(r'<script type="application/json" id="release-data">(.*?)</script>', body, re.S).group(1))
    assert all(project['id'] != private_project['id'] for project in payload['projects'])
assert all('data-solution="'+key+'"' in made['solutions.html'] for key in ['windows', 'installation', 'measurements', 'help'])
assert '<script>' not in release4.data_element({'example': '</script><script>unsafe</script>'})
print('PASS v17 solutions: API-compatible IDs/scopes, actual project references, neutral consultation, existing routes and published-only payloads')
