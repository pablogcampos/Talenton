import {escapeHtml} from './offerFormat';
// Presentation only: consume already sanitized HTML, retaining every original node.
export type OfferLayoutBlock={kind:'flow'|'facts'|'bonuses';html:string[]};
const heading=(el:Element)=>/^H[1-3]$/.test(el.tagName);
const bonus=(el:Element)=>heading(el)&&/\bbono\b.*\b(variable|adherencia|permanencia|cuartil)\b/i.test(el.textContent||'');
export function offerLayout(html:string):OfferLayoutBlock[]{
 const root=document.createElement('div');root.innerHTML=html;
 const nodes=Array.from(root.childNodes);
 const blocks:OfferLayoutBlock[]=[];
 for(let i=0;i<nodes.length;){
  const node=nodes[i];
  if(node instanceof Element&&bonus(node)){
   const items:string[]=[];
   while(i<nodes.length&&nodes[i] instanceof Element&&bonus(nodes[i] as Element)){
    let part=(nodes[i++] as Element).outerHTML;
    while(i<nodes.length&&!(nodes[i] instanceof Element&&heading(nodes[i] as Element))){
     part+=nodes[i] instanceof Element?(nodes[i] as Element).outerHTML:escapeHtml(nodes[i].textContent);i++;
    }
    items.push(part);
   }
   blocks.push({kind:'bonuses',html:items});continue;
  }
  // Only short, labeled facts directly after the training heading become columns.
  if(node instanceof Element&&heading(node)&&/^capacitación$/i.test((node.textContent||'').trim())){
   blocks.push({kind:'flow',html:[node.outerHTML]});i++;
   const items:string[]=[];
   while(i<nodes.length&&nodes[i] instanceof Element&&(nodes[i] as Element).tagName==='P'&&
    (nodes[i].textContent||'').length<200&&(nodes[i] as Element).querySelector('strong')){
    items.push((nodes[i++] as Element).outerHTML);
   }
   if(items.length)blocks.push({kind:'facts',html:items});continue;
  }
  blocks.push({kind:'flow',html:[node instanceof Element?node.outerHTML:escapeHtml(node.textContent)]});i++;
 }
 return blocks;
}
export function spatialOfferHtml(html:string){
 return offerLayout(html).map(b=>b.kind==='flow'?b.html.join(''):
  '<div class="offer-'+b.kind+'-grid">'+b.html.map(item=>'<div class="offer-layout-item">'+item+'</div>').join('')+'</div>').join('');
}
