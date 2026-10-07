import assert from 'node:assert/strict';
import {createSelectedPortfolio} from '../backend/selected-portfolio19.mjs';

const fail=(status,message)=>Object.assign(new Error(message),{status});
// The endpoint injects the existing store validator. Assert its unchanged
// recipient limit here; the integration suite exercises that validator over HTTP.
const text=(value,max)=>{
  assert.equal(max,140);
  if(typeof value!=='string'||value.length>max)throw fail(422,'Invalid recipient');
  return value.trim();
};
const seed=()=>({revision:1,settings:{manager:'Current manager'},projects:Array.from({length:21},(_,i)=>({id:'project-'+i,title:'Title '+i,published:true}))});
const status=expected=>error=>error.status===expected;

let current=seed(),calls=0,readCount=0,jobs=[];
const portfolio=createSelectedPortfolio({readContent:()=>{readCount++;return structuredClone(current);},text,fail,generate:async job=>{
  calls++;jobs.push(job);return Buffer.from('PDF '+calls+' '+job.recipient);
}});
for(const projects of [undefined,null,[],['project-0','project-0'],[1],Array.from({length:21},(_,i)=>'project-'+i)]) {
  await assert.rejects(portfolio({projects}),status(422));
}
await assert.rejects(portfolio({projects:['missing']}),status(422));
current.projects[0].published=false;
await assert.rejects(portfolio({projects:['project-0']}),status(422));
current.projects[0].published=true;
await assert.rejects(portfolio({projects:['project-0'],recipient:'x'.repeat(141)}),status(422));
assert.equal(calls,0,'invalid selections and recipient never start a renderer');

readCount=0;
const first=await portfolio({projects:['project-7','project-2'],recipient:'  Recipient <b>literal</b>  '});
assert.equal(first.toString(),'PDF 1 Recipient <b>literal</b>');
assert.deepEqual(jobs[0].projects.map(project=>project.id),['project-7','project-2'],'requested order is retained');
assert.deepEqual(jobs[0].settings,current.settings);
assert.equal(readCount,2,'current content is read again after generation');
const second=await portfolio({projects:['project-2','project-7'],recipient:'Other recipient'});
assert.equal(second.toString(),'PDF 2 Other recipient');
assert.notDeepEqual(first,second,'personal selections never reuse a cached PDF');
assert.deepEqual(jobs[1].projects.map(project=>project.id),['project-2','project-7']);
await portfolio({projects:current.projects.slice(0,20).map(project=>project.id),recipient:'x'.repeat(140)});
assert.equal(jobs[2].projects.length,20,'maximum valid selection remains supported');
assert.equal(jobs[2].recipient.length,140);

async function deferredRender(change,conflict=true) {
  let state=seed(),resume,started;
  const rendering=new Promise(resolve=>started=resolve);
  let renderCalls=0;
  const build=createSelectedPortfolio({readContent:()=>structuredClone(state),text,fail,generate:async job=>{
    renderCalls++;started(job);await new Promise(resolve=>resume=resolve);return Buffer.from('old PDF');
  }});
  const result=build({projects:['project-7','project-2'],recipient:'Private recipient'});
  assert.deepEqual((await rendering).projects.map(project=>project.id),['project-7','project-2']);
  change(state);resume();
  if(conflict)await assert.rejects(result,error=>error.status===409&&error.message==='Портфолио обновилось. Повторите сборку подборки.');
  else assert.equal((await result).toString(),'old PDF','unchanged content allows the deferred PDF to complete');
  assert.equal(renderCalls,1,'a personalized render completes or is discarded without a fallback or automatic retry');
}
await deferredRender(()=>{},false);
await deferredRender(state=>{state.revision++;state.projects[7].title='Edited title';});
await deferredRender(state=>{state.revision++;state.settings.manager='Changed manager';});
await deferredRender(state=>{state.revision++;state.projects[7].published=false;});
await deferredRender(state=>{state.revision++;state.projects=state.projects.filter(project=>project.id!=='project-2');});
// Explicit visibility checks also protect against a reader exposing hidden or
// removed content without a revision increment.
await deferredRender(state=>{state.projects[2].published=false;});
await deferredRender(state=>{state.projects=state.projects.filter(project=>project.id!=='project-7');});

let rejectRender=false;
const failure=Error('renderer unavailable');
const noFallback=createSelectedPortfolio({readContent:()=>structuredClone(current),text,fail,generate:async()=>{
  if(rejectRender)throw failure;return Buffer.from('previous successful PDF');
}});
await noFallback({projects:['project-0']});rejectRender=true;
await assert.rejects(noFallback({projects:['project-0']}),error=>error===failure,'renderer failure never serves a previous successful personalized PDF');
console.log('PASS selected portfolio19: ordered uncached private PDFs, unchanged selection/recipient limits, post-render revision/visibility/deletion conflicts and no stale fallback');
