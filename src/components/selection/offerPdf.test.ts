// @vitest-environment jsdom
import {describe,it,expect,vi} from 'vitest';
import {offerPdfDefinition} from './offerPdf';
import {encodeOfferHtml} from './offerFormat';
vi.mock('../common/CompanyLogo',()=>({companyLogoSource:()=>undefined,CompanyLogo:()=>null}));
describe('PDF de propuestas',()=>{
 it('conserva tablas, firma y encabezados unidos al texto siguiente',async()=>{
  const d=await offerPdfDefinition({id:'prueba',snapshot:{company:'Empresa',campaign:'Campaña',group:'Grupo',days:3,startDate:'2026-11-10',endDate:'2026-11-12',title:'Propuesta',name:'María',content:encodeOfferHtml('<h2>Condiciones</h2><p>Texto de condiciones de la propuesta.</p><table><tbody><tr><td>Puesto</td><td>Ventas</td></tr></tbody></table>')},signedAt:'2026-11-04T17:00:00Z',signature:[[[0,0],[10,10]]],acceptance:'Aceptado'});
  const json=JSON.stringify(d.content);
  expect(json).toContain('"headlineLevel":1');expect(json).toContain('"widths":["*","*"]');expect(json).toContain('<svg');expect(json).toContain('Propuesta firmada');
  expect(json).not.toContain('Fin de teoría:');expect(json).not.toContain('2026-11-10');
  expect(d.pageBreakBefore!({headlineLevel:1} as never,[],[],[])).toBe(true);
  expect(d.pageBreakBefore!({headlineLevel:1} as never,[{}] as never,[],[])).toBe(false);
 });
});
