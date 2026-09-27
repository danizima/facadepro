"""Page-specific share cards and structured data, using published project data."""
from html import unescape
from urllib.parse import quote

ORIGIN = 'https://facadepro.ru/'


def metadata(g, route, title, description):
    settings = g['CFG']
    projects = g['PBY']
    project = projects.get(route.removeprefix('projects/').removesuffix('.html')) if route.startswith('projects/') else None
    service = next((s for s in g['S'] if route == 'services/' + s['id'] + '.html'), None)
    image, image_alt = 'assets/company-social.png', 'ФАСАД.PRO'
    if project and project.get('images'):
        key = project['images'][0]
        image = key if key.startswith('media/') else 'assets/' + key + '.webp'
        image_alt = unescape(str(project['title']))
    elif service:
        related = next((projects[key] for key in service['projects'] if key in projects and projects[key].get('images')), None)
        if related:
            key = related['images'][0]
            image = key if key.startswith('media/') else 'assets/' + key + '.webp'
            image_alt = unescape(str(related['title'])) + ' — ' + service['title']
    elif route == 'index.html' and projects.get('museum', {}).get('images'):
        key = projects['museum']['images'][0]
        image = key if key.startswith('media/') else 'assets/' + key + '.webp'
        image_alt = unescape(str(projects['museum']['title']))
    company = {'@type': 'Organization', '@id': ORIGIN + '#company', 'name': 'ФАСАД.PRO',
               'legalName': settings['legalName'], 'url': ORIGIN, 'telephone': settings['phone'],
               'email': settings['email'], 'logo': ORIGIN + 'assets/company-social.png',
               'taxID': settings['inn'], 'address': [
                   {'@type': 'PostalAddress', 'addressCountry': 'RU', 'addressLocality': 'Владивосток', 'streetAddress': settings['vladivostok']},
                   {'@type': 'PostalAddress', 'addressCountry': 'RU', 'addressLocality': 'Москва', 'streetAddress': settings['moscow']} ]}
    if settings.get('ogrn'):
        company['identifier'] = {'@type': 'PropertyValue', 'propertyID': 'ОГРН', 'value': settings['ogrn']}
    graph = [company]
    if route not in ('index.html', '404.html'):
        crumbs = [{'@type': 'ListItem', 'position': 1, 'name': 'Главная', 'item': ORIGIN}]
        if project:
            crumbs.append({'@type': 'ListItem', 'position': 2, 'name': 'Проекты', 'item': ORIGIN + 'projects.html'})
        elif service:
            crumbs.append({'@type': 'ListItem', 'position': 2, 'name': 'Услуги', 'item': ORIGIN + 'services.html'})
        crumbs.append({'@type': 'ListItem', 'position': len(crumbs) + 1, 'name': unescape(str(title)), 'item': ORIGIN + route})
        graph.append({'@type': 'BreadcrumbList', 'itemListElement': crumbs})
    if service:
        graph.append({'@type': 'Service', 'name': service['title'], 'description': service['intro'],
                      'url': ORIGIN + route, 'provider': {'@id': ORIGIN + '#company'}, 'areaServed': 'RU'})
    return {'image': ORIGIN + quote(image, safe='/'), 'image_alt': image_alt,
            'schema': {'@context': 'https://schema.org', '@graph': graph}}
