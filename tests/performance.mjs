// Repeatable lab comparison; timings are not real-user Core Web Vitals.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../',import.meta.url).pathname,data=await mkdtemp(path.join(tmpdir(),'facade-perf-'));
const label=process.argv[2]||'current';if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid report label');
const base='http://127.0.0.1:18749';
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,DATA_DIR:data,PORT:'18749',PUBLIC_URL:base,NODE_ENV:'test',SMTP_HOST:'',TELEGRAM_BOT_TOKEN:''},stdio:'ignore'});
let browser;
try{
 for(let i=0;i<150;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}if(i===149)throw Error('Server unavailable');await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 const samples=[];
 for(const route of ['/','/projects.html'])for(let run=0;run<3;run++){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();
  const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:200000,uploadThroughput:100000});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.addInitScript(()=>{try{localStorage.setItem('facade_statistics','no');}catch{}window.lab={lcp:0,cls:0,tbt:0};
   new PerformanceObserver(list=>{for(const e of list.getEntries())window.lab.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
   new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.lab.cls+=e.value;}).observe({type:'layout-shift',buffered:true});
   new PerformanceObserver(list=>{for(const e of list.getEntries())window.lab.tbt+=Math.max(0,e.duration-50);}).observe({type:'longtask',buffered:true});
  });
  await page.goto(base+route,{waitUntil:'networkidle',timeout:60000});await page.waitForTimeout(500);
  const result=await page.evaluate(()=>{const entries=[...performance.getEntriesByType('navigation'),...performance.getEntriesByType('resource')];return {...window.lab,fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime||0,requests:entries.length,bytes:entries.reduce((sum,e)=>sum+e.encodedBodySize,0),jsCssBytes:entries.filter(e=>/\.(js|css)(\?|$)/.test(e.name)).reduce((sum,e)=>sum+e.encodedBodySize,0)};});
  samples.push({route,run,...result});await context.close();console.log(JSON.stringify(samples.at(-1)));
 }
 const directory=path.join(root,'artifacts/performance');await mkdir(directory,{recursive:true});
 const report={label,conditions:{viewport:'390x844',latencyMs:100,downloadBytesPerSecond:200000,cpuSlowdown:4,cache:false},samples};
 await writeFile(path.join(directory,label+'.json'),JSON.stringify(report,null,2));
}finally{if(browser)await browser.close();const done=new Promise(r=>server.once('close',r));server.kill();await done;await rm(data,{recursive:true,force:true});}
