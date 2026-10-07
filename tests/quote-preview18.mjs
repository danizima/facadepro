import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizeQuoteDocument} from '../backend/quote-document15.mjs';

const context=vm.createContext({window:{}});
vm.runInContext(readFileSync(new URL('../site/admin/quote-preview18.js',import.meta.url),'utf8'),context);
const {calculate}=context.window.facadeQuotePreview18;
const row=(quantity='1',unitPrice='100')=>({title:'Проверяемая позиция',unit:'м²',quantity,unitPrice});
const document=(items,tax)=>({title:'Сверка предварительного итога',items,tax});
const totals=preview=>Object.fromEntries(['subtotalKopecks','taxKopecks','totalKopecks'].map(key=>[key,preview[key]]));
const equalToServer=(items,tax)=>{
 const saved=normalizeQuoteDocument(document(items,tax)),preview=calculate(items,tax);
 assert.equal(preview.ready,true);assert.deepEqual(totals(preview),saved.totals);
 assert.deepEqual(Array.from(preview.lineTotals),saved.items.map(item=>item.lineTotalKopecks));
};

for(const mode of ['none','included','extra']){
 for(const rate of mode==='none'?['0']:['0','5','10','20','22','30','21.99']){
  for(const items of [[row()], [row('1.5','1000.11')], [row('0.5','0.01'),row('0.5','0.01')], [row('1','0'),row('1','100')], [row(' 1,25 ','0,05'),row('0.001','500.00')]])equalToServer(items,{mode,rate});
 }
}
equalToServer([row('1','9999999999.99')],{mode:'none',rate:'0'});
equalToServer([row('1000000','1000')],{mode:'included',rate:'22'});
assert.deepEqual(totals(calculate([row('1','0.05')],{mode:'extra',rate:'10'})),{subtotalKopecks:5,taxKopecks:1,totalKopecks:6},'half-kopeck VAT rounds up');
assert.deepEqual(totals(calculate([row('1','122')],{mode:'included',rate:'22'})),{subtotalKopecks:12200,taxKopecks:2200,totalKopecks:12200},'included VAT is extracted');
for(let i=1;i<=60;i++){
 const quantity=(i*733/1000).toFixed(3),unitPrice=(i*137/100).toFixed(2);
 equalToServer([row(quantity,unitPrice),row('0.005','0.99')],{mode:i%2?'extra':'included',rate:'22'});
}
for(const items of [[],Array.from({length:51},()=>row()),[row('','100')],[row('0','100')],[row('1.0001','100')],[row('1000000.001','100')],[row('1','-1')],[row('1','1.001')],[row('1e3','100')],[row('01','100')],[row('1','99999999999')],[row('1','9999999999.99'),row('1','0.01')]]){
 const preview=calculate(items,{mode:'none',rate:'0'});assert.equal(preview.ready,false);assert.equal(preview.totalKopecks,null);assert.throws(()=>normalizeQuoteDocument(document(items,{mode:'none',rate:'0'})),{status:422});
}
for(const tax of [{mode:'',rate:''},{mode:'extra',rate:''},{mode:'extra',rate:'31'},{mode:'included',rate:'22.001'},{mode:'none',rate:'22'}]){
 const preview=calculate([row()],tax);assert.equal(preview.ready,false);assert.equal(preview.totalKopecks,null);assert.throws(()=>normalizeQuoteDocument(document([row()],tax)),{status:422});
}
for(const [items,tax] of [[[row('1','0')],{mode:'none',rate:'0'}],[[row('1','9999999999.99')],{mode:'extra',rate:'22'}]]){
 assert.equal(calculate(items,tax).ready,false);assert.equal(calculate(items,tax).totalKopecks,null);assert.throws(()=>normalizeQuoteDocument(document(items,tax)),{status:422});
}
console.log('PASS quote-preview18: server parity for decimal lines and VAT, half-up rounding, invalid/empty/overflow inputs do not show a final total');
