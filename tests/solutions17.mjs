import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../site/release4.js',import.meta.url),'utf8');
const solutions=JSON.parse(await readFile(new URL('../source/solutions.json',import.meta.url),'utf8'));
const services=JSON.parse(await readFile(new URL('../source/services.json',import.meta.url),'utf8'));
const content=JSON.parse(await readFile(new URL('../source/content.json',import.meta.url),'utf8'));
const projects=content.projects.map(p=>({...p,published:p.id==='museum'?false:p.published,title:p.id==='museum'?'PRIVATE_PROJECT_17':p.title}));
const buttons=solutions.map(s=>({dataset:{solution:s.id},attributes:{},setAttribute(name,value){this.attributes[name]=value;}}));
const result={hidden:true,innerHTML:''},object={value:''},request={href:''};
const nodes={'#release-data':{textContent:JSON.stringify({solutions,services,projects})},'#solution-result':result,'#solution-object':object,'#solution-request':request,'#solution-result h2':{focus(){}}};
const document={querySelector(selector){return nodes[selector]||null;},querySelectorAll(selector){return selector==='[data-solution]'?buttons:[];}};
vm.runInNewContext(source,{document,window:{facade:{offline:false}},location:{search:''},URLSearchParams});
const initialURL=()=>new URL(result.innerHTML.match(/id="solution-request"[^>]*href="([^"]+)"/)[1].replaceAll('&amp;','&'),'https://facadepro.ru/');
for(const [id,scope] of [['windows','supply-installation'],['installation','installation'],['measurements','engineering'],['help','']]){
    buttons.find(b=>b.dataset.solution===id).onclick();
    const first=initialURL();assert.equal(first.pathname,'/request.html');assert.equal(first.searchParams.get('solution'),id);assert.equal(first.searchParams.get('scope')||'',scope);
    assert.equal(result.hidden,false);assert.equal(buttons.filter(b=>b.attributes['aria-pressed']==='true').length,1);
    assert.ok(!result.innerHTML.includes('PRIVATE_PROJECT_17'),'hidden related projects stay hidden');
    assert.ok(!result.innerHTML.includes('tasks/'+id+'.html'),'new scenarios have no nonexistent detail route');
    object.value='Жилой комплекс';object.onchange();const changed=new URL(request.href,'https://facadepro.ru/');
    assert.equal(changed.searchParams.get('object'),'Жилой комплекс');assert.equal(changed.searchParams.get('scope')||'',scope,'object selection preserves participation scope');
    if(id==='help'){assert.ok(!result.innerHTML.includes('services/engineering.html'),'consultation does not recommend engineering');assert.match(result.innerHTML,/Уточним направление вместе/);}
}
buttons.find(b=>b.dataset.solution==='leak').onclick();assert.ok(result.innerHTML.includes('tasks/leak.html'),'existing task detail links remain available');
console.log('PASS v17 selector controller: scenario routes, preserved scope/object context, neutral help, no hidden projects or missing detail pages');
