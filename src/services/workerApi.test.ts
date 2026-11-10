// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';
const m=vi.hoisted(()=>({token:vi.fn()}));vi.mock('./supabase',()=>({supabaseAccessToken:m.token}));
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetModules();});
it('limita sesión bloqueada y no envía después de vencer la espera',async()=>{
 vi.stubEnv('VITE_ADMIN_API_URL','https://test');vi.useFakeTimers();let resolve!:(s:string)=>void;m.token.mockReturnValue(new Promise<string>(r=>resolve=r));const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const {workerApi}=await import('./workerApi');
 const failed=expect(workerApi('/api/candidates',{method:'POST',body:'{}'})).rejects.toThrow('WORKER_REQUEST_TIMEOUT');await vi.advanceTimersByTimeAsync(45000);await failed;resolve('token');await Promise.resolve();expect(fetch).not.toHaveBeenCalled();
});
it('limita respuesta de red bloqueada',async()=>{
 vi.stubEnv('VITE_ADMIN_API_URL','https://test');vi.useFakeTimers();m.token.mockResolvedValue('token');vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})));const {workerApi}=await import('./workerApi');const failed=expect(workerApi('/api/candidates',{method:'POST',body:'{}'})).rejects.toThrow('WORKER_REQUEST_TIMEOUT');await vi.advanceTimersByTimeAsync(45000);await failed;
});
