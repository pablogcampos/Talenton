/** Identity rules shared by the public form and the server. */
export function captureIdentityIssue(v:Record<string,unknown>,companyForm=true):{field:string;message:string}|undefined{
 const text=(value:unknown,max:number)=>typeof value==='string'?value.normalize('NFKC').trim().replace(/\s+/g,' ').slice(0,max):'';
 const fullName=text(v.fullName,120),type=text(v.documentType,20),document=text(v.documentNumber,24).toUpperCase().replace(/[\s-]/g,'');
 let phone=text(v.phone,40).replace(/\D/g,'');if(phone.length===11&&phone.startsWith('51'))phone=phone.slice(2);
 const email=text(v.email,160),district=text(v.district,companyForm?160:80);
 if(fullName.length<5||!fullName.includes(' '))return {field:'fullName',message:'Ingresa tus nombres y apellidos completos.'};
 if(!(companyForm?['DNI','CE','OTRO']:['DNI','CE','PASAPORTE']).includes(type))return {field:'documentType',message:'Selecciona un tipo de documento válido.'};
 if(!(type==='DNI'?/^\d{8}$/.test(document):/^[A-Z0-9]{6,20}$/.test(document)))return {field:'documentNumber',message:type==='DNI'?'El DNI debe tener 8 dígitos.':'El documento debe tener entre 6 y 20 letras o números.'};
 if(!/^9\d{8}$/.test(phone))return {field:'phone',message:'Ingresa un celular peruano de 9 dígitos que empiece con 9. Puedes incluir +51.'};
 if((companyForm&&!email)||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return {field:'email',message:'Ingresa un correo electrónico válido.'};
 if(district.length<2)return {field:'district',message:'Ingresa tu provincia o distrito (mínimo 2 caracteres).'};
}
