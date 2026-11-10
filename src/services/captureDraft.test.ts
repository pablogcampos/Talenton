// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';
import {readCaptureDraft,writeCaptureDraft,clearCaptureDraft,captureSecurityMessage} from './captureDraft';
afterEach(()=>{sessionStorage.clear();vi.restoreAllMocks();vi.useRealTimers();});
const draft={answers:{preferredCampaign:'camp',fullName:'Nombre Prueba',custom:['a','b']},step:4,requestId:'same-request',revision:4,attachments:['cv.pdf']};
it('recupera respuestas y requestId exclusivamente para su enlace',()=>{
 expect(writeCaptureDraft('one',draft)).toBe(true);expect(readCaptureDraft('one')).toMatchObject(draft);expect(readCaptureDraft('two')).toBeNull();
 clearCaptureDraft('one');expect(readCaptureDraft('one')).toBeNull();
});
it('descarta borradores vencidos o dañados',()=>{
 vi.useFakeTimers();writeCaptureDraft('one',draft);vi.advanceTimersByTime(4*60*60*1000+1);expect(readCaptureDraft('one')).toBeNull();
 sessionStorage.setItem('talent:capture:draft:v1:one','invalid');expect(readCaptureDraft('one')).toBeNull();
});
it('maneja almacenamiento bloqueado sin romper el formulario',()=>{
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});expect(writeCaptureDraft('one',draft)).toBe(false);
});
it('distingue dominio no autorizado y conserva códigos para diagnóstico',()=>{
 expect(captureSecurityMessage('110200')).toContain('dominio no está autorizado');expect(captureSecurityMessage('200500')).toContain('200500');
});
