import {it,expect} from 'vitest';
import {formatVoiceDiagnostic} from './cinthiaVoice';
it('shows reported origin, exact code, HTTP status and reference',()=>{
 const message=formatVoiceDiagnostic({source:'Gemini',code:'RESOURCE_EXHAUSTED',status:429,reference:'trace-123',at:'2026-11-13T21:09:19Z'});
 for(const value of ['Gemini','RESOURCE_EXHAUSTED','429','trace-123','2026-11-13T21:09:19Z'])expect(message).toContain(value);
 expect(message).not.toContain('pérdida de internet');
});
it('does not invent a cause for abnormal websocket close',()=>{
 const message=formatVoiceDiagnostic({source:'WebSocket del navegador',code:'SOCKET_CLOSED',status:1006});
 expect(message).toContain('1006');expect(message).toContain('La causa exacta no fue informada');
});
