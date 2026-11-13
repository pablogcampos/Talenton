import {it,expect,vi,afterEach} from 'vitest';
import {VoiceFault,voiceDiagnostic,cinthiaRpc} from '../src/cinthiaLive';
afterEach(()=>vi.unstubAllGlobals());
it('keeps provider and HTTP status without exposing exception payloads',()=>{
 expect(voiceDiagnostic(new VoiceFault('Gemini','RESOURCE_EXHAUSTED',429))).toMatchObject({source:'Gemini',code:'RESOURCE_EXHAUSTED',status:429});
 const d=voiceDiagnostic(new Error('secret token and transcript'));
 expect(d.code).toBe('CAUSE_NOT_REPORTED');expect(JSON.stringify(d)).not.toContain('secret');
});
it('preserves database error code and status without exposing rows',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({code:'23505',message:'private row data'}),{status:409})));
 await expect(cinthiaRpc({SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test'},'test',{})).rejects.toMatchObject({source:'Supabase',code:'23505',status:409});
});
