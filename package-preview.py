"""Package self-contained public/admin previews and the deployable source ZIP."""
from pathlib import Path
import json,re,base64,zipfile,sys
root=Path(__file__).resolve().parent;site=root/'site'
out=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root.parent/'output'
if out.is_relative_to(root):raise SystemExit('Choose an output directory outside the project.')
out.mkdir(parents=True,exist_ok=True)
def js(value):return json.dumps(value,ensure_ascii=False).replace('<','\\u003c')
def data(path,mime):return 'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode()
assets={p.name:data(p,'image/svg+xml' if p.suffix=='.svg' else 'image/webp') for p in (site/'assets').iterdir() if p.is_file()}
downloads={'portfolio.pdf':data(site/'downloads/portfolio.pdf','application/pdf')}
css='\n'.join((site/name).read_text() for name in ['styles.css','enhancements.css','business.css','release4.css','visual5.css','museum.css','release6.css','release7.css','release8.css','release9.css','vendor/leaflet/leaflet.css'])
app='\n'.join((site/name).read_text() for name in ['vendor/leaflet/leaflet.js','app.js','public.js','request.js','release4.js','visual5.js','museum.js','release6.js','release7.js','release8.js','release9.js'])
pages={}
for path in site.rglob('*.html'):
 if path.name.startswith('_') or 'admin' in path.relative_to(site).parts:continue
 text=path.read_text();text=re.sub(r'<link rel="stylesheet"[^>]+>','',text);text=re.sub(r'<link rel="icon"[^>]+>','',text);text=re.sub(r'<script src="[^"]+" defer></script>','',text);text=re.sub(r' srcset="[^"]+"','',text);text=text.replace('</head>','__SHARED_HEAD__</head>');text=re.sub(r'src="(?:\.\./|/)?assets/([^\"]+)"',r'src="__ASSET_\1__"',text)
 pages[str(path.relative_to(site))]=text
bridge=r'''const frame=document.querySelector('iframe');window.facadeAssets=ASSETS;
function route(){return location.hash.slice(2)||'index.html';}
function render(){const url=new URL(route(),'https://offline.invalid/'),key=url.pathname.slice(1),html=PAGES[key]||PAGES['404.html'];
 const boot=`window.facadeOffline=true;window.facadePath=${JSON.stringify('/'+key)};window.facadeQuery=${JSON.stringify(url.search)};window.facadeAsset=k=>parent.facadeAssets[k+'.webp'];window.facadeUpdateSearch=q=>parent.history.replaceState(null,'','#/'+${JSON.stringify(key)}+(q?'?'+q:''));document.addEventListener('click',event=>{if(event.defaultPrevented)return;const a=event.target.closest('a');if(!a)return;const href=a.getAttribute('href');if(!href)return;if(href.startsWith('#')){event.preventDefault();document.getElementById(href.slice(1))?.scrollIntoView();return;}const u=new URL(href,'https://offline.invalid/'+${JSON.stringify(key)});if(u.pathname.includes('/downloads/')){event.preventDefault();const data=parent.DOWNLOADS[u.pathname.split('/').pop()];if(data){const link=document.createElement('a');link.href=data;link.download='Портфолио_ФАСАД_PRO_2026.pdf';link.click();}return;}if(u.origin==='https://offline.invalid'){event.preventDefault();parent.location.hash='/'+u.pathname.slice(1)+u.search+u.hash;}});`;
 frame.srcdoc=html.replace(/__ASSET_(.+?)__/g,(_,name)=>ASSETS[name]||'').replace('__SHARED_HEAD__','<style>'+CSS+'</style><script>'+boot+'<\/script><script defer src="data:text/javascript;base64,'+APP+'"><\/script>');frame.onload=()=>{document.title=frame.contentDocument.title;if(url.hash)frame.contentDocument.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView();};}
window.addEventListener('hashchange',render);render();'''
script='const ASSETS='+js(assets)+',PAGES='+js(pages)+',CSS='+js(css)+',APP='+js(base64.b64encode(app.encode()).decode())+';window.DOWNLOADS='+js(downloads)+';\n'+bridge
html='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ФАСАД.PRO — предпросмотр</title><style>html,body{margin:0;height:100%;background:#232729}iframe{display:block;width:100%;height:100%;border:0}</style></head><body><iframe title="Сайт ФАСАД.PRO"></iframe><noscript>Для автономного предпросмотра включите JavaScript.</noscript><script>'+script+'</script></body></html>'
(out/'Фасад_PRO_предпросмотр.html').write_text(html)
admin=(site/'admin/index.html').read_text();admin=re.sub(r'<link[^>]+>','',admin);admin=re.sub(r'<script[^>]+></script>','',admin)
admin=re.sub(r'<button[^>]+data-tab="(?:showcases|workflow|notifications|materials)"[^>]*>.*?</button>','',admin)
admin=admin.replace('id="preview-project"','hidden id="preview-project"')
admin=admin.replace('src="/assets/logo.svg"','src="'+assets['logo.svg']+'"')
admin=admin.replace('<a href="/" target="_blank" rel="noopener">Открыть сайт ↗</a>','<span class="muted">Автономная демонстрация</span>')
admin=admin.replace('<a href="/" target="_blank" rel="noopener"><img','<a href="#" aria-label="ФАСАД.PRO"><img')
admin=admin.replace('<a class="admin-portfolio-link" href="/portfolio.html" target="_blank" rel="noopener">Собрать портфолио PDF ↗</a>','<span class="muted">Сборка PDF — в предпросмотре сайта</span>')
admin=admin.replace('<p id="mail-notice"','<p class="demo-notice">Демонстрационные данные. Изменения работают только в этом открытом файле и сбрасываются при обновлении. Реальные заявки и почта не подключены.</p><p id="mail-notice"')
admincss='\n'.join((site/name).read_text() for name in ['styles.css','enhancements.css','admin/admin.css'])+'\n.demo-notice{padding:18px 22px;background:#dfeaf0;border-left:3px solid #4d6b7b;margin-top:25px;font-size:14px}'
admin=admin.replace('</head>','<style>'+admincss+'</style></head>')
images={k.removesuffix('.webp').removesuffix('-small'):v for k,v in assets.items() if k.endswith('-small.webp')}
seed=json.loads((root/'source/content.json').read_text())
mock=(root/'scripts/admin-demo.js').read_text().replace('DEMO_CONTENT',js(seed)).replace('DEMO_IMAGES',js(images))
appadmin=(site/'admin/admin.js').read_text().replace('Проект сохранён. Страницы сайта обновлены.','Изменения сохранены только в демонстрации.').replace('Сохранено. Контакты обновлены на сайте.','Изменения сохранены только в демонстрации.').replace('Проект удалён с сайта.','Проект удалён только из демонстрации.')
admin=admin.replace('</body>','<script>'+mock.replace('</script','<\\/script')+'\n'+appadmin.replace('</script','<\\/script')+'</script></body>')
(out/'Фасад_PRO_панель_демо.html').write_text(admin)
allowed={'site','source','backend','scripts','tests','deploy'}
rootfiles={'package.json','server.mjs','build.py','site_sections.py','release4.py','visual5.py','museum.py','release6.py','release7.py','release8.py','release9.py','assets9.py','requirements.txt','THIRD_PARTY.md','package-preview.py','Dockerfile','compose.yaml','nginx.conf','.dockerignore','.gitignore','.env.example','README.md','DEPLOY.md'}
with zipfile.ZipFile(out/'Фасад_PRO_сайт_Timeweb.zip','w',zipfile.ZIP_DEFLATED) as z:
 for path in sorted(root.rglob('*')):
  rel=path.relative_to(root)
  if not path.is_file() or any(p in ['__pycache__','.git','node_modules','data','.sites-runtime'] for p in rel.parts) or path.name.startswith('_qa'):continue
  if rel.parts[0] not in allowed and str(rel) not in rootfiles:continue
  if path.name.startswith('.env') and path.name!='.env.example':continue
  z.write(path,'facadepro/'+str(rel))
print('Public pages:',len(pages),'Output:',out)
