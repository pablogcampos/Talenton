// Presentation contract for phase 4. Only backend-produced, evidence-based data may fill it.
export type CinthiaReport={completedAt:string;durationSeconds:number;summary:string;experience:string;availability:string;answers:{question:string;answer:string}[];evidence:{competency:string;quote:string}[];observations:string;transcript:string;humanReview:'PENDING'|'REVIEWED'};
export function CinthiaResult({report=null}:{report?:CinthiaReport|null}){
 return <section className="space-y-4 rounded-2xl border border-slate-200 p-4"><h3 className="font-semibold">Resultado y revisión humana</h3>
 {!report?<p className="text-sm text-slate-500">El informe y la revisión estructurada corresponden a una siguiente fase. Las entrevistas registradas se pueden consultar en la transcripción; no se generan calificaciones ni decisiones automáticas.</p>:<>
 <dl className="grid gap-4 text-sm sm:grid-cols-2">{[['Fecha',report.completedAt],['Duración',`${report.durationSeconds} segundos`],['Revisión humana',report.humanReview==='REVIEWED'?'Revisada':'Pendiente'],['Resumen',report.summary],['Experiencia declarada',report.experience],['Disponibilidad',report.availability],['Observaciones',report.observations]].map(([label,value])=><div key={label}><dt className="text-slate-500">{label}</dt><dd className="whitespace-pre-wrap">{value||'No informado'}</dd></div>)}</dl>
 <h4 className="text-sm font-semibold">Preguntas y respuestas</h4>{report.answers.map((r,i)=><div key={i} className="text-sm"><p className="font-medium">{r.question}</p><p className="whitespace-pre-wrap">{r.answer}</p></div>)}
 <h4 className="text-sm font-semibold">Evidencias de competencias</h4>{report.evidence.map((r,i)=><div key={i} className="text-sm"><p>{r.competency}</p><blockquote className="whitespace-pre-wrap border-l border-teal-200 pl-3">{r.quote}</blockquote></div>)}
 <details><summary className="cursor-pointer text-sm font-semibold">Transcripción completa</summary><p className="mt-3 whitespace-pre-wrap text-sm">{report.transcript}</p></details>
 </>}
 </section>;
}
