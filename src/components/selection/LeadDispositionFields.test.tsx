// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {LeadDispositionFields,callbackInput,callbackInstant} from './LeadDispositionFields';
it('uses Peru timezone and rejects incomplete or impossible callback dates',()=>{
 expect(callbackInstant('2099-01-01T09:30')).toBe('2099-01-01T14:30:00.000Z');
 expect(callbackInput('2099-01-01T14:30:00Z')).toBe('2099-01-01T09:30');
 expect(callbackInstant('2099-02-30T09:30')).toBeNull();expect(callbackInstant('2099-01-01')).toBeNull();
});
it('requires the matching reason or callback date/time for each classification',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div'),root=createRoot(host);
 const props={outcome:'',callback:'',onStatus:vi.fn(),onOutcome:vi.fn(),onCallback:vi.fn()};
 try{
  await act(async()=>root.render(<LeadDispositionFields {...props} status="CONTACTADO"/>));
  expect(host.textContent).toContain('Acepta propuesta');expect(host.textContent).not.toContain('No responde');expect(host.querySelectorAll('select[required]')).toHaveLength(2);
  await act(async()=>root.render(<LeadDispositionFields {...props} status="NO_CONTACTADO"/>));
  expect(host.textContent).toContain('Corta llamada');expect(host.textContent).not.toContain('No apto');
  await act(async()=>root.render(<LeadDispositionFields {...props} status="REPROGRAMADO"/>));
  expect(host.querySelector('input[required][type="datetime-local"]')).not.toBeNull();expect(host.querySelectorAll('select')).toHaveLength(1);
 }finally{await act(async()=>root.unmount());}
});
