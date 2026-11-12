import {it,expect,vi,afterEach} from 'vitest';
import {loadBootstrap} from './bootstrapRefresh';
import {workerApi,WorkerApiError} from './workerApi';
vi.mock('./workerApi',()=>({workerApi:vi.fn(),WorkerApiError:class extends Error{constructor(public status:number,message:string){super(message);}}}));
afterEach(()=>{vi.useRealTimers();vi.resetAllMocks();});
it('recovers transient failures with bounded retries',async()=>{vi.useFakeTimers();vi.mocked(workerApi).mockRejectedValueOnce(new WorkerApiError(502,'UNIFIED_READ_FAILED')).mockResolvedValueOnce({candidates:[]});const result=loadBootstrap();await vi.runAllTimersAsync();expect(await result).toEqual({candidates:[]});expect(workerApi).toHaveBeenCalledTimes(2);});
it('reports persistent failure after three attempts',async()=>{vi.useFakeTimers();vi.mocked(workerApi).mockRejectedValue(new WorkerApiError(503,'UNIFIED_READ_FAILED'));const result=loadBootstrap().catch(e=>e);await vi.runAllTimersAsync();expect(((await result) as WorkerApiError).status).toBe(503);expect(workerApi).toHaveBeenCalledTimes(3);});
it('does not retry permission errors',async()=>{vi.mocked(workerApi).mockRejectedValue(new WorkerApiError(403,'FORBIDDEN'));await expect(loadBootstrap()).rejects.toThrow('FORBIDDEN');expect(workerApi).toHaveBeenCalledTimes(1);});
it('stops retries after unmount or logout',async()=>{vi.useFakeTimers();let active=true;vi.mocked(workerApi).mockRejectedValue(new WorkerApiError(502,'UNIFIED_READ_FAILED'));const result=loadBootstrap(()=>active).catch(e=>e);await Promise.resolve();active=false;await vi.runAllTimersAsync();expect(workerApi).toHaveBeenCalledTimes(1);expect(((await result) as Error).message).toBe('BOOTSTRAP_CANCELLED');});
