import {it,expect,vi,afterEach} from 'vitest';
vi.mock('./workerApi',()=>({workerApi:vi.fn()}));
import {publicCaptureApi} from './captureApi';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();});
it('solo confirma envíos con acuse explícito del servidor',async()=>{
 vi.stubEnv('VITE_ADMIN_API_URL','https://api.test');
 const fetch=vi.fn().mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response('{"ok":true}'));
 vi.stubGlobal('fetch',fetch);
 await expect(publicCaptureApi('token',{requestId:'same'})).rejects.toThrow('confirmación');
 await expect(publicCaptureApi('token',{requestId:'same'})).resolves.toEqual({ok:true});
});
it('conserva el error de validación del servidor',async()=>{
 vi.stubEnv('VITE_ADMIN_API_URL','https://api.test');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"message":"Revisa tu documento"}',{status:400})));
 await expect(publicCaptureApi('token',{})).rejects.toThrow('Revisa tu documento');
});
it('acota la espera sin afirmar que un envío incierto no fue guardado',async()=>{
 vi.useFakeTimers();vi.stubEnv('VITE_ADMIN_API_URL','https://api.test');
 vi.stubGlobal('fetch',vi.fn((_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))))));
 const request=expect(publicCaptureApi('token',{})).rejects.toThrow('No se pudo confirmar');
 await vi.advanceTimersByTimeAsync(45000);await request;
});
