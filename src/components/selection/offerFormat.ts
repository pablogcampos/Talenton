import DOMPurify from 'dompurify';

// Versioned and encoded so the legacy SQL text substitutions cannot corrupt markup.
export const OFFER_FORMAT_PREFIX='TALENT_OFFER_HTML_V1:';
export const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function cleanOfferHtml(html:string):string{
 const clean=DOMPurify.sanitize(html,{ALLOWED_TAGS:['p','br','h1','h2','h3','strong','em','u','s','ul','ol','li','blockquote','hr','table','tbody','thead','tr','th','td','span'],ALLOWED_ATTR:['colspan','rowspan','style'],ALLOW_DATA_ATTR:false});
 const root=document.createElement('div');root.innerHTML=clean;
 root.querySelectorAll<HTMLElement>('[style]').forEach(el=>{const align=el.style.textAlign;el.removeAttribute('style');if(['left','center','right','justify'].includes(align))el.style.textAlign=align;});
 root.querySelectorAll('[colspan],[rowspan]').forEach(el=>{for(const key of ['colspan','rowspan'])if(el.hasAttribute(key)){const n=Number(el.getAttribute(key));if(!Number.isInteger(n)||n<1||n>20)el.removeAttribute(key);}});
 return root.innerHTML;
}
export function encodeOfferHtml(html:string){
 const safe=cleanOfferHtml(html);
 const bytes=new TextEncoder().encode(safe);
 const encoded=OFFER_FORMAT_PREFIX+btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
 if(encoded.length>40000)throw Error('La propuesta es demasiado extensa. Reduce el contenido antes de guardar.');
 return encoded;
}
export function offerHtml(content:string,values:Record<string,unknown>={}):string{
 let html:string;
 if(content.startsWith(OFFER_FORMAT_PREFIX)){
  try{html=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(content.slice(OFFER_FORMAT_PREFIX.length)),c=>c.charCodeAt(0)));}catch{throw Error('No se pudo interpretar el formato de esta propuesta.');}
 }else html=content.split(/\r?\n/).map(line=>'<p>'+escapeHtml(line||' ')+'</p>').join('');
 const root=document.createElement('div');root.innerHTML=cleanOfferHtml(html);
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 let node:Node|null;
 while((node=walker.nextNode()))node.textContent=node.textContent!.replace(/\{\{([^{}]+)\}\}/g,(match,key)=>Object.prototype.hasOwnProperty.call(values,key)?String(values[key]??''):match);
 return root.innerHTML;
}
export const initialOfferHtml=()=>`<h2>Condiciones laborales</h2><table><tbody>
<tr><th><p>Concepto</p></th><th><p>Condiciones ofrecidas</p></th></tr>
<tr><td><p>Puesto</p></td><td><p>[Completar puesto]</p></td></tr>
<tr><td><p>Sueldo</p></td><td><p>[Completar importe y periodicidad]</p></td></tr>
<tr><td><p>Bono variable</p></td><td><p>[Completar importe y condiciones]</p></td></tr>
<tr><td><p>Bono de movilidad</p></td><td><p>[Completar importe y condiciones]</p></td></tr>
<tr><td><p>Modalidad</p></td><td><p>[Completar modalidad]</p></td></tr>
<tr><td><p>Horario laboral</p></td><td><p>[Completar horario]</p></td></tr>
</tbody></table><h2>Capacitación</h2><p><strong>Días de capacitación:</strong> {{dias}}</p><p><strong>Fechas:</strong> {{inicio}} al {{fin}}</p><p><strong>Horario de capacitación:</strong> [Completar horario]</p>
<h2>Bonos y fechas de pago</h2><p>[Completar fechas de pago, requisitos y condiciones aplicables a los bonos y a la capacitación.]</p>
<h2>Políticas y acuerdos</h2><p>[Completar las políticas y los acuerdos de esta propuesta.]</p>
<h2>Aceptación</h2><p>Yo, {{nombre}}, declaro haber leído y aceptado las condiciones de esta propuesta laboral.</p>`;
