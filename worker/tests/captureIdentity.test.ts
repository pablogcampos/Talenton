import {it,expect} from 'vitest';
import {captureIdentityIssue} from '../../shared/captureIdentity';
import {captureInput} from '../src/capture';
const valid={fullName:'Persona de Prueba',documentType:'DNI',documentNumber:'12345678',phone:'+51 933 984 694',email:'persona@example.com',district:'Lima',consent:true};
it('valida identidad y permite prefijo peruano sin alterar reglas',()=>{
 expect(captureIdentityIssue(valid)).toBeUndefined();expect(captureInput(valid).phone).toBe('933984694');
 for(const [field,value] of [['fullName','Ana'],['documentNumber','123'],['phone','123456789'],['email','x'],['district','x'],['documentType','inventado']]){
  expect(captureIdentityIssue({...valid,[field]:value})?.field).toBe(field);
  try{captureInput({...valid,[field]:value});throw Error('Expected failure');}catch(error){expect(error).toHaveProperty('field',field);}
 }
 expect(()=>captureInput({...valid,consent:false})).toThrow('privacidad');
});
