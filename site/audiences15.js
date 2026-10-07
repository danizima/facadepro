(() => {
 'use strict';
 const params=new URLSearchParams(window.facadeQuery??location.search),audience=params.get('audience'),context=params.get('context');
 const form=document.querySelector('#request-form')||document.querySelector('#photo-request-form');if(!form)return;
 const brief=audience==='contractor'&&context==='tender'?'Тендерный расчёт фасадных работ.\nГраницы поставки и монтажа: \nГрафик готовности участков: \nУсловия доступа и техника: ':audience==='owner'&&context==='survey'?'Собственник здания. Обследование и ремонт фасада.\nПроблема и её расположение: \nКогда проявляется и что уже ремонтировали: \nДоступ к участку и часы работы здания: ':'';
 const comment=form.elements.namedItem('comment');if(brief&&comment&&!comment.value.trim())comment.value=brief;
 const deadline=form.elements.namedItem('deadline'),value=params.get('deadline');
 if(audience==='contractor'&&context==='tender'&&deadline&&!deadline.value&&/^\d{4}-\d{2}-\d{2}$/.test(value||'')){
  const parsed=new Date(value+'T00:00:00Z');if(!Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value&&Number(value.slice(0,4))>=1900&&Number(value.slice(0,4))<=2100)deadline.value=value;
 }
})();
