// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {spatialOfferHtml,offerLayout} from './offerLayout';
describe('composición pública sin alterar condiciones',()=>{
 it('agrupa cuatro bonos y datos breves; conserva tabla y cláusulas generales completas',()=>{
  const html='<h2>Condiciones laborales</h2><table><tr><td>Sueldo</td><td>S/ 1230</td></tr></table><h2>Capacitación</h2><p><strong>Días:</strong> 4</p><p><strong>Fechas:</strong> 04 al 07</p><h2>Políticas de bonos</h2>'+
   ['variable','adherencia','permanencia','cuartil'].map(b=>'<h3>Bono '+b+'</h3><ul><li>Condición intacta S/ 300.</li></ul>').join('')+'<h3>Condiciones generales</h3><p>Texto legal completo.</p>';
  const source=document.createElement('div'),output=document.createElement('div');source.innerHTML=html;output.innerHTML=spatialOfferHtml(html);
  expect(output.textContent).toBe(source.textContent);
  expect(output.querySelectorAll('.offer-bonuses-grid>.offer-layout-item')).toHaveLength(4);
  expect(output.querySelectorAll('.offer-facts-grid>.offer-layout-item')).toHaveLength(2);
  expect(output.querySelector('table')!.parentElement).toBe(output);
  expect(Array.from(output.children).find(el=>el.textContent==='Condiciones generales')?.parentElement).toBe(output);
  expect(offerLayout(html).find(b=>b.kind==='bonuses')!.html).toHaveLength(4);
 });
 it('no convierte texto escapado en marcado ejecutable',()=>{
  const root=document.createElement('div');root.innerHTML=spatialOfferHtml('&lt;img src=x onerror=alert(1)&gt;<p>Condición</p>');
  expect(root.querySelector('img')).toBeNull();expect(root.textContent).toContain('<img');
 });
});
