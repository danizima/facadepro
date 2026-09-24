"""Build immutable assets, loading page-specific controllers only where needed."""
import hashlib
from pathlib import Path

CSS=['styles.css','enhancements.css','business.css','release4.css','visual5.css','museum.css','release6.css','release7.css','release8.css','release9.css','visual10.css']


def write_bundle(g,names,extension):
    value=('\n;\n' if extension=='js' else '\n').join((g['ROOT']/'site'/n).read_text() for n in names)
    digest=hashlib.sha256(value.encode()).hexdigest()[:16]
    name='bundles/'+('site' if extension=='css' else 'page')+'-'+digest+'.'+extension
    target=g['OUT']/name
    if not target.exists():target.parent.mkdir(parents=True,exist_ok=True);target.write_text(value)
    return name


def assets(g,route,body,base):
    scripts=['app.js','public.js']
    if 'id="request-form"' in body:scripts.append('request.js')
    if route in ('map.html','solutions.html','portfolio.html'):scripts.append('release4.js')
    scripts.append('visual5.js')
    scripts.append('visual10.js')
    if 'report-viewer' in body or 'id="reports"' in body or 'museum-reports' in body:scripts.append('museum.js')
    if any(marker in body for marker in ('data-audience=', 'data-detail-pin=', 'data-report-year=', 'data-selection-pdf')) or route in ('request.html','quote.html'):scripts.append('release6.js')
    if 'callback-form' in body or route=='compare.html':scripts.append('release7.js')
    if 'id="release8-data"' in body:scripts.append('release8.js')
    if 'id="contractor-kit"' in body:scripts.append('release9.js')
    css=write_bundle(g,CSS,'css');js=write_bundle(g,scripts,'js')
    return f'<link rel="stylesheet" href="{base}{css}"><script src="{base}{js}" defer></script>'
