import {it,expect,vi} from 'vitest';
import {createHandler} from './index';
const secret='test-only-voicebot-key-with-32-characters';
const env=(key:string)=>({VOICEBOT_API_KEY:secret,SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only'}[key]);
const request=(body:unknown,key=secret)=>new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json','x-voicebot-key':key},body:JSON.stringify(body)});
it('rechaza claves incorrectas y configuración ausente sin tocar la base',async()=>{
 const send=vi.fn();const handler=createHandler(env,send);
 expect((await handler(request({external_id:'1',phone:'999111222'},'incorrecta'))).status).toBe(401);
 expect((await createHandler(()=>undefined,send)(request({}))).status).toBe(503);expect(send).not.toHaveBeenCalled();
});
it('inserta solo recepción; no expone credenciales y usa source fijo',async()=>{
 const send=vi.fn().mockResolvedValue(new Response(null,{status:201}));
 const result=await createHandler(env,send)(request({external_id:'lead-001',phone:'999111222',workday:'Semifull',payload:{extra:'original'}}));
 expect(result.status).toBe(201);expect(await result.json()).toEqual({ok:true,duplicate:false,external_id:'lead-001'});
 expect(String(send.mock.calls[0][0])).toBe('https://example.supabase.co/rest/v1/voicebot_leads');
 const init=send.mock.calls[0][1];expect(init.method).toBe('POST');expect(JSON.parse(init.body)).toEqual({source:'voicebot',external_id:'lead-001',phone:'999111222',workday:'Semifull',payload:{extra:'original'}});
});
it('rechaza campos de gestión, tipos inválidos, datos grandes y fechas sin zona',async()=>{
 const send=vi.fn(),handler=createHandler(env,send),valid={external_id:'1',phone:'999111222'};
 for(const extra of [{status:'CONTACTADO'},{owner_auth_id:'user'},{received_at:'2026-01-01'},{source:'otro'},{phone:999111222},{external_id:''},{occurred_at:'2026-11-09T12:00:00'},{payload:[]},{full_name:'x'.repeat(301)}])expect((await handler(request({...valid,...extra}))).status).toBe(400);
 expect((await handler(request({...valid,transcript:'x'.repeat(200001)}))).status).toBe(413);
 expect(send).not.toHaveBeenCalled();
});
it('reintentos duplicados no sobrescriben; fallos no filtran mensajes SQL',async()=>{
 const send=vi.fn().mockResolvedValueOnce(Response.json({code:'23505',message:'private SQL'},{status:409})).mockResolvedValueOnce(Response.json({code:'42501',message:'private SQL'},{status:403}));
 const handler=createHandler(env,send),data={external_id:'1',phone:'999111222'};
 const duplicate=await handler(request(data));expect(duplicate.status).toBe(200);expect((await duplicate.json()).duplicate).toBe(true);
 const failure=await handler(request(data));expect(failure.status).toBe(503);expect(await failure.text()).not.toContain('private');expect(send).toHaveBeenCalledTimes(2);
});
it('no admite lectura, borrado o actualización',async()=>{
 const send=vi.fn();for(const method of ['GET','DELETE','PATCH','OPTIONS'])expect((await createHandler(env,send)(new Request('https://example.test',{method}))).status).toBe(405);
 expect(send).not.toHaveBeenCalled();
});
