import {WorkerApiError,workerApi} from './workerApi';
export async function loadBootstrap<T>(active:()=>boolean=()=>true):Promise<T>{
 for(let attempt=0;;attempt++){
  if(!active())throw new Error('BOOTSTRAP_CANCELLED');
  try{return await workerApi<T>('/api/bootstrap');}catch(error){
   const transient=error instanceof WorkerApiError&&[0,408,429,500,502,503,504].includes(error.status);
   if(!active()||!transient||attempt>=2)throw error;
   await new Promise(resolve=>setTimeout(resolve,1000*2**attempt));
  }
 }
}
