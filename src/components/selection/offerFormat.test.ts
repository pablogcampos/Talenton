// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {encodeOfferHtml,offerHtml,cleanOfferHtml,initialOfferHtml} from './offerFormat';
describe('documentos de propuesta laboral',()=>{
 it('conserva tablas, formato, acentos y datos automáticos en una nueva versión',()=>{
  const html='<h2>Capacitación</h2><table><tbody><tr><td><p><strong>{{nombre}}</strong></p></td><td><p>S/ 1,500</p></td></tr></tbody></table>';
  const encoded=encodeOfferHtml(html);
  expect(encoded).not.toContain('{{nombre}}');
  const result=offerHtml(encoded,{nombre:'María & José "A" <B>'});
  expect(result).toContain('<strong>María &amp; José "A" &lt;B&gt;</strong>');
  expect(result).toContain('<table>');expect(result).toContain('S/ 1,500');
 });
 it('mantiene propuestas antiguas como texto, sin interpretar etiquetas',()=>{
  expect(offerHtml('Políticas\n<script>alert(1)</script>')).toContain('&lt;script&gt;');
 });
 it('elimina contenido activo, estilos superpuestos y recursos externos',()=>{
  const safe=cleanOfferHtml('<p style="position:fixed;text-align:center" onclick="alert(1)">Hola</p><script>alert(2)</script><img src="https://evil.test/track"><iframe src="x"></iframe><a href="javascript:alert(1)">texto</a>');
  expect(safe).toContain('text-align: center');expect(safe).not.toMatch(/onclick|position|script|iframe|img|href/);
 });
 it('rechaza contenido corrupto y demasiado extenso',()=>{
  expect(()=>offerHtml('TALENT_OFFER_HTML_V1:%%%')).toThrow();
  expect(()=>encodeOfferHtml('<p>'+'a'.repeat(40000)+'</p>')).toThrow(/extensa/);
 });
 it('incluye todos los campos acordados sin inventar importes',()=>{
  const html=initialOfferHtml();
  for(const label of ['Puesto','Sueldo','Bono variable','Bono de movilidad','Modalidad','Horario laboral','Capacitación','Horario de capacitación','Bonos y fechas de pago','Políticas y acuerdos','Aceptación'])expect(html).toContain(label);
  expect(html).toContain('{{nombre}}');expect(html).toContain('{{dias}}');
 });
});
