import pdfMake from 'pdfmake/build/pdfmake';
import fonts from 'pdfmake/build/vfs_fonts';
import htmlToPdfmake from 'html-to-pdfmake';
import type {Content,TDocumentDefinitions} from 'pdfmake/interfaces';
import {companyLogoSource} from '../common/CompanyLogo';
import {offerHtml} from './offerFormat';
import {offerDate,offerValues,type OfferDocument} from './OfferDocument';


async function logoImage(company:string){
 const src=companyLogoSource(undefined,company);if(!src)return null;
 const image=new Image();image.src=src;await image.decode();
 const canvas=document.createElement('canvas');canvas.width=704;canvas.height=256;
 const ctx=canvas.getContext('2d')!;ctx.fillStyle=src.includes('konectados')?'#102438':'#ffffff';ctx.fillRect(0,0,704,256);
 const scale=Math.max(704/image.width,256/image.height);ctx.drawImage(image,(704-image.width*scale)/2,(256-image.height*scale)/2,image.width*scale,image.height*scale);
 return canvas.toDataURL('image/png');
}
export async function offerPdfDefinition(d:OfferDocument):Promise<TDocumentDefinitions>{
 const s=d.snapshot,logo=await logoImage(s.company);
 const html=offerHtml(s.content,offerValues(d));
 const content:Content[]=[
  ...(logo?[{image:logo,width:132,margin:[0,0,0,16]} as Content]:[]),
  {text:'PROPUESTA LABORAL · '+s.company,fontSize:10,color:'#0f766e',margin:[0,0,0,8]},
  {text:s.title,fontSize:21,bold:true,margin:[0,0,0,14]},
  {text:s.name,fontSize:14,bold:true},
  ...(s.dni?[{text:'DNI / documento: '+s.dni,fontSize:10}]:[]),
  {text:s.campaign+' · '+s.group,fontSize:10,color:'#64748b',margin:[0,4,0,16]},
  {text:'Días de capacitación: '+(s.days||'Por definir')+'\nInicio: '+(s.startDate||'Por definir')+' · Fin de teoría: '+(s.endDate||'Por definir'),fontSize:10,margin:[0,0,0,18]},
  htmlToPdfmake(html,{window:window as unknown as NonNullable<Parameters<typeof htmlToPdfmake>[1]>['window'],tableAutoSize:false,defaultStyles:{p:{margin:[0,0,0,8]},h1:{fontSize:21,margin:[0,16,0,10]},h2:{fontSize:16,margin:[0,16,0,8]},h3:{fontSize:13,margin:[0,12,0,6]},th:{fillColor:'#edf4f8',bold:true},td:{margin:[5,5,5,5]}}}) as Content
 ];
 if(d.signedAt||d.signed_at){
  const strokes=(d.signature||[]).map(stroke=>'<polyline fill="none" stroke="#143c55" stroke-width="2.5" points="'+stroke.map(p=>p.map(Number).join(',')).join(' ')+'"/>').join('');
  content.push({unbreakable:true,stack:[{text:'Propuesta firmada',bold:true,color:'#0f766e',margin:[0,20,0,8]},{text:d.acceptance||'',fontSize:10},{svg:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200" viewBox="0 0 600 200">'+strokes+'</svg>',width:240},{text:'Firmada el '+offerDate(d.signedAt||d.signed_at)+' (hora de Lima).',fontSize:10}]});
 }
 content.push({text:'Documento: '+d.id+'\nIntegridad: '+(d.contentHash||d.content_hash||'Vista previa'),fontSize:7,color:'#64748b',margin:[0,20,0,0]});
 // Use the same full-width tables as the on-screen document.
 const formatTables=(value:unknown):void=>{
  if(Array.isArray(value)){value.forEach(formatTables);return;}
  if(!value||typeof value!=='object')return;
  const node=value as Record<string,unknown>;
  if((Array.isArray(node.style)?node.style:[node.style]).some(style=>typeof style==='string'&&/^html-h[123]$/.test(style)))node.headlineLevel=1;
  if(node.table){const table=node.table as {body:unknown[][];widths:unknown[];headerRows?:number};table.widths=Array(table.body[0]?.length||1).fill('*');node.layout={hLineColor:()=> '#cbd5e1',vLineColor:()=> '#cbd5e1',hLineWidth:()=>0.5,vLineWidth:()=>0.5};}
  Object.values(node).forEach(formatTables);
 };
 formatTables(content);
 return {pageSize:'A4',pageMargins:[42,42,42,46],defaultStyle:{font:'Roboto',fontSize:10.5,lineHeight:1.3,color:'#143c55'},content,
  pageBreakBefore:(node,following)=>node.headlineLevel===1&&following.length===0,
  footer:(page,total)=>({text:page+' / '+total,alignment:'center',fontSize:8,color:'#64748b',margin:[0,15,0,0]})};
}
export async function createOfferPdf(d:OfferDocument){
 const definition=await offerPdfDefinition(d);
 const filename='Propuesta-'+d.snapshot.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ -]/g,'').slice(0,80)+'.pdf';
 await new Promise<void>((resolve,reject)=>{try{pdfMake.createPdf(definition,undefined,undefined,fonts).download(filename,()=>resolve());}catch(e){reject(e);}});
}
