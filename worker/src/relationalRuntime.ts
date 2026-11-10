import {supabaseServerHeaders,SupabaseError,type SupabaseEnv} from './supabase';
type D=Record<string,any>;
type Snapshot={companyId:string;revision:number;tables:Record<string,D[]>};
export type RuntimeEnv=SupabaseEnv&{RELATIONAL_RUNTIME?:RelationalRuntime;ORG_ENABLED?:string;ORG_COMPANY?:string};
const clone=<T>(v:T):T=>structuredClone(v);
const clean=(v:D)=>Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined));
const date=(v:any)=>v?String(v).slice(0,10):null;
const digest=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const fields:Record<string,D>={
 companies:{legalName:'legal_name',taxId:'tax_id',name:'name',managed:'catalog_managed'},
 profiles:{username:'username',uid:'auth_user_id',displayName:'display_name',nickname:'nickname',tagline:'tagline',avatarUrl:'avatar_url',phone:'phone',dni:'document_number',jobTitle:'job_title',role:'role',status:'status',enabled:'enabled',mustChangePassword:'must_change_password'},
 campaigns:{companyCampaignId:'company_campaign_id',code:'code',title:'title',status:'status',vacancies:'vacancies',salaryBase:'salary_base',variableBonus:'variable_bonus',adminBonus:'admin_bonus',mobilityBonus:'mobility_bonus',processType:'process_type',managementType:'management_type',requestDate:'request_date',startDate:'start_date',endDate:'end_date',shift:'schedule',observations:'observations',assignedAnalystId:'assigned_analyst_id',allowOverTargetQuota:'allow_over_target'},
 persons:{fullName:'full_name',firstName:'first_name',lastName:'last_name',birthDate:'birth_date',phone:'phone',email:'email',district:'district',address:'address',age:'age',experienceMonths:'experience_months',englishLevel:'english_level',avatarUrl:'avatar_url',currentStage:'current_stage',currentProcess:'current_process',captureOnly:'capture_only',documentType:'document_type',dni:'document_number',source:'source_name',cvUrl:'cv_url',observationsGeneral:'general_observations',recruiterId:'owner_id'},
 applications:{candidateId:'person_id',campaignId:'campaign_id',recruiterId:'recruiter_id',status:'status',stage:'stage',applicationDate:'application_date',closedAt:'closed_at',closeReason:'closure_reason',processSnapshot:'process_snapshot',originEventId:'capture_id'},
 training_groups:{archivedAt:'archived_at',code:'code',name:'name',campaignId:'campaign_id',trainerId:'trainer_id',coordinatorId:'coordinator_id',startDate:'start_date',endDate:'theory_end_date',ojtStartDate:'ojt_start_date',ojtEndDate:'ojt_end_date',totalDays:'theory_days',ojtTotalDays:'ojt_days',ojtExtensionDays:'extension_days',schedule:'schedule',modality:'modality',maxCapacity:'capacity',passingMinGrade:'passing_grade',status:'status',roomOrLink:'room_or_link',observations:'observations',trainerAssignmentNotes:'trainer_assignment_notes',trainerAssignedAt:'trainer_assigned_at',trainerAssignedBy:'trainer_assigned_by'},
 participants:{status:'status',trainingApproved:'training_approved'},
 capture_links:{companyCampaignId:'company_campaign_id',ownerUid:'owner_id',active:'active',deletedAt:'archived_at'},
 captures:{candidateId:'person_id',linkId:'link_id',ownerUid:'owner_id',status:'status',conflict:'conflict'},
 process_templates:{campaignId:'campaign_id',familyId:'family_id',version:'revision',name:'name',description:'description',position:'position_name',rules:'rules'},
 message_templates:{campaignId:'campaign_id',name:'name',type:'communication_type',content:'body'},
 attendance_unlocks:{trainingId:'group_id',date:'day_date',requestedBy:'requested_by',reason:'reason',status:'status',decidedBy:'decided_by',decidedAt:'decided_at',decisionReason:'decision_reason',expiresAt:'expires_at'},
 person_documents:{candidateId:'person_id',type:'document_type',isMandatory:'mandatory',validatedAt:'validated_at',notes:'observation'},
 salary_accounts:{hasAccount:'has_account',bank:'bank',accountNumber:'account_number',cci:'cci',currency:'currency',requestOpening:'request_opening',openingStatus:'opening_status',notes:'notes'},
 hiring:{status:'status',documentsValidated:'documents_validated',welcomeEmailSent:'welcome_email_sent'},
};
const excluded=['id','companyId','createdAt','updatedAt','__updateTime','__rowVersion','uid','scope','scopeCampaignIds','module','allowedModules','subordinateUserIds','responsibles','assignedUserIds','sources','statusHistory','managementHistory','participantIds','enrolledCount','activeCount','passedCount','dropoutCount','selection','training','ojt','hiring','documents','salaryAccount','history','interviews','evaluationAttempts','communications','evaluations','attendance','traceability','applicant','stages','responsibleIds','interviewFields','configuration'];
export class RelationalRuntime {
 private snapshot!:Snapshot;
 private changed=new Map<string,{table:string;row:D;expected:number|null}>();
 private documents=new Map<string,D>();
 private resetIds=new Set<string>();
 private companyGrants?:{userId:string;grants:unknown[]};
 setCompanyGrants(userId:string,grants:unknown[]){this.companyGrants={userId,grants};}
 readonly newAuthIds:string[]=[];
 committed=false;
 private authAfterCommit:Array<()=>Promise<void>>=[];
 deferAuth(work:()=>Promise<void>){this.authAfterCommit.push(work);}
 constructor(private env:SupabaseEnv,readonly actorId:string|null,private publicToken?:string){}
 private hash:string|null=null;
 private async rpc<T>(name:string,data:D):Promise<T>{
  const r=await fetch(this.env.SUPABASE_URL!.replace(/\/$/,'')+'/rest/v1/rpc/'+name,{method:'POST',headers:supabaseServerHeaders(this.env),body:JSON.stringify(data)});
  if(!r.ok){const e=await r.json<{code?:string;message?:string}>().catch(()=>({} as any));const codes:Record<string,string>={PT409:'CAPTURE_RETRY','23505':'DUPLICATE_RECORD','23503':'RELATED_RECORD_INVALID','23514':'DATA_VALIDATION_FAILED','23502':'DATA_VALIDATION_FAILED','22007':'INVALID_DATA_FORMAT','22008':'INVALID_DATA_FORMAT','22P02':'INVALID_DATA_FORMAT'};throw new SupabaseError(e.code==='PT409'||e.code==='23505'?409:r.status,({OFFER_SIGNATURES_PENDING:'OFFER_SIGNATURES_PENDING',TALENT_LAST_GLOBAL_ADMIN_REQUIRED:'LAST_GLOBAL_ADMIN_REQUIRED',TALENT_GLOBAL_ADMIN_ROLE_REQUIRED:'GLOBAL_ADMIN_ROLE_REQUIRED'} as Record<string,string>)[e.message||'']||codes[e.code||'']||(e.message==='PASSWORD_CHANGE_REQUIRED'?'PASSWORD_CHANGE_REQUIRED':'RELATIONAL_WRITE_FAILED'));}
  // PostgREST returns an empty body for the void commit RPC.
  if(name==='talent_runtime_commit'||name==='talent_org_user_commit')return undefined as T;
  return r.json<T>();
 }
 async load(){this.hash=this.publicToken?await digest(this.publicToken):null;this.snapshot=this.actorId&&this.env.ORG_ENABLED==='true'?await this.rpc('talent_org_snapshot',{p_actor:this.actorId,p_company:this.env.ORG_COMPANY}):await this.rpc('talent_runtime_snapshot',{p_actor:this.actorId,p_public_hash:this.hash});return this;}
 get companyId(){return this.snapshot.companyId;}
 async requestUnlock(group:string,day:string,reason:string){
  const id=await this.rpc<string>('talent_unlock_request',{p_actor:this.actorId,p_company:this.companyId,p_group:group,p_day:day,p_reason:reason});
  this.documents.clear();await this.load();
  return this.get('attendanceUnlockRequests/'+id);
 }
 async decideUnlock(id:string,approve:boolean,reason:string,expiresAt:string|null){
  const request=this.find('attendance_unlocks',id);
  if(!request)throw new SupabaseError(404,'ATTENDANCE_UNLOCK_NOT_FOUND');
  await this.rpc('talent_unlock_decide',{p_actor:this.actorId,p_company:this.companyId,p_unlock:id,p_expected:request.version,p_approve:approve,p_reason:reason,p_expires:expiresAt});
  this.documents.clear();await this.load();
  return this.get('attendanceUnlockRequests/'+id);
 }
 async captureCatalog():Promise<{companyName:string;campaigns:import('../../shared/techCenterForm').CaptureCampaignOption[]}>{
  if(!this.hash)throw new SupabaseError(403,'FORBIDDEN');
  return this.rpc('talent_capture_catalog',{p_hash:this.hash});
 }
 rows(table:string){return this.snapshot.tables[table]||[];}
 private find(table:string,id:string){return this.rows(table).find(x=>String(x.id)===id);}
 private relate(table:string,key:string,id:string){return this.rows(table).filter(x=>x[key]===id&&x.archived_at==null);}
 private project(table:string,row:D):D{
  const out:D={...row.annotations,id:String(row.id),companyId:row.company_id,createdAt:row.created_at,updatedAt:row.updated_at,__rowVersion:row.version};
  for(const[k,col]of Object.entries(fields[table]||{}))if(row[col]!=null)out[k]=row[col];
  return out;
 }
 private put(table:string,id:string,data:D){
  const previous=this.find(table,id);const key=table+':'+id;
  const next=clean({...previous,...data,id,company_id:this.companyId});
  const changed=Object.entries(data).some(([k,v])=>v!==undefined&&JSON.stringify(v)!==JSON.stringify(previous?.[k]));
  if(!previous||changed){
   const original=this.changed.get(key);this.changed.set(key,{table,row:next,expected:original?original.expected:(previous?.version??null)});
   if(previous)Object.assign(previous,next);else(this.snapshot.tables[table]??=[]).push(next);
  }
  return next;
 }
 private base(table:string,id:string,data:D,extra:D={}){
  const patch:D={...extra};
  for(const[k,col]of Object.entries(fields[table]||{}))if(data[k]!==undefined)patch[col]=data[k]===''?null:data[k];
  const reserved=new Set([...excluded,...Object.keys(fields[table]||{})]);
  patch.annotations={...(this.find(table,id)?.annotations||{}),...(extra.annotations||{}),...Object.fromEntries(Object.entries(data).filter(([k,v])=>!reserved.has(k)&&v!==undefined))};
  return this.put(table,id,patch);
 }
 private archiveMissing(table:string,key:string,id:string,keep:string[]){
  for(const row of this.relate(table,key,id))if(!keep.includes(row.id))this.put(table,row.id,{archived_at:new Date().toISOString()});
 }
 private events(stream:string,target:D,events:D[]=[]){
  for(let i=0;i<events.length;i++){
   const e=events[i];const id=String(e.id||[stream,...Object.values(target),i].join(':'));
   if(this.find('contract_events',id))continue;
   this.put('contract_events',id,{...target,stream,actor_id:this.actorId,occurred_at:e.at||e.recordedAt||e.date&&String(e.date).slice(0,10)+'T'+(e.time||'00:00')+':00Z'||new Date().toISOString(),action:e.action||null,previous_state:e.previousStage||e.previousStatus||null,new_state:e.newStage||e.newStatus||e.status||null,description:e.observation||e.reason||e.note||e.detail||null,event_metadata:e});
  }
 }
 private history(stream:string,key:string,id:string){return this.relate('contract_events',key,id).filter(e=>e.stream===stream).map(e=>e.event_metadata);}
 private source(name:string){const old=this.rows('recruitment_sources').find(x=>x.name===name);if(old)return old.id;const id='source:'+name;this.put('recruitment_sources',id,{name});return id;}
 private personForApp(id:string){return this.find('applications',id)?.person_id;}
 private participant(personId:string,groupId?:string){
  return this.rows('participants').find(p=>(!groupId||p.group_id===groupId)&&this.personForApp(p.application_id)===personId&&p.archived_at==null);
 }
 private template(id:string):D|undefined {
  const t=this.find('process_templates',id);if(!t)return;
  return {...this.project('process_templates',t),stages:this.relate('process_stages','template_id',id).sort((a,b)=>a.ordinal-b.ordinal).map(s=>({stage:s.stage,requirements:s.requirements||''})),responsibleIds:this.relate('template_responsibles','template_id',id).map(s=>s.user_id),evaluations:this.relate('evaluation_definitions','template_id',id).map(d=>this.definition(d)),interviewFields:t.annotations?.interviewFields||[]};
 }
 private definition(d:D):D{return {...d.annotations,id:d.annotations?.logicalId||d.id,name:d.name,minScore:d.min_score,questions:this.relate('evaluation_items','definition_id',d.id).sort((a,b)=>a.ordinal-b.ordinal).map(q=>({...q.annotations,id:q.annotations?.logicalId||q.id,label:q.label,type:q.item_type,points:q.points,options:this.relate('evaluation_options','item_id',q.id).sort((a,b)=>a.ordinal-b.ordinal).map(o=>o.label),correctIndex:this.relate('evaluation_options','item_id',q.id).sort((a,b)=>a.ordinal-b.ordinal).findIndex(o=>o.is_correct)}))};}
 private evalProjection(e:D):D {const def=this.find('evaluation_definitions',e.definition_id);return {...e.annotations,id:e.id,name:def?.name||'',title:def?.name||'',moduleName:def?.name||'',score:e.score,maxScore:def?.max_score,minRequired:def?.min_score,result:e.result,passed:['APTO','APROBADO'].includes(e.result),date:date(e.evaluated_at),comments:e.comments||'',definitionId:def?.annotations?.logicalId||def?.id};}
 private participantProjection(p:D):D {
  const person=this.personForApp(p.application_id);
  const attendance=this.relate('attendance','participant_id',p.id).map(a=>({...a.annotations,id:a.id,date:date(a.day_date),status:a.status,attendance:a.status,notes:a.notes||'',recordedAt:a.marked_at}));
  const evals=this.relate('evaluations','participant_id',p.id).map(e=>this.evalProjection(e));
  const metrics=this.relate('ojt_metrics','participant_id',p.id).map(m=>({...m.annotations,id:m.id,date:date(m.day_date),dayNumber:m.day_number,attendance:m.attendance_status,hoursManaged:Number(m.hours_worked||0),hoursWorked:Number(m.hours_worked||0),sales:m.sales||0,sph:Number(m.hours_worked)>0?Number((Number(m.sales||0)/Number(m.hours_worked)).toFixed(2)):0,spd:m.sales||0,calls:m.calls,leads:m.leads,conversions:m.conversions,qaScore:m.qa_score,ahtSeconds:m.aht_seconds,observations:m.observations,feedback:m.coach_feedback}));
  const skills=this.relate('ojt_skills','participant_id',p.id).at(-1);
  const feedback=this.relate('feedback','participant_id',p.id).map(f=>({...f.annotations,id:f.id,date:date(f.created_at),strongPoints:f.strong_points,improvementPoints:f.improvement_points,actionPlan:f.action_plan,commitmentDate:date(f.commitment_date),participantSigned:f.participant_signed}));
  const dropout=this.relate('dropouts','participant_id',p.id).at(-1);
  return {...this.project('participants',p),candidateId:person,campaignId:this.find('training_groups',p.group_id)?.campaign_id,attendance,evaluations:evals,traceability:this.history('participant','participant_id',p.id),dropout:dropout?{...dropout.annotations,date:date(dropout.occurred_on),stage:dropout.phase,category:dropout.category,observation:dropout.observation}:undefined,ojt:{...(p.annotations?.ojtMeta||{}),status:p.ojt_status,dailyMetrics:metrics,skillsMatrix:skills?{manejoObjeciones:skills.manejo_objeciones,diccionModulacion:skills.diccion_modulacion,velocidadSistemas:skills.velocidad_sistemas,empatiaEscucha:skills.empatia_escucha,tecnicaCierre:skills.tecnica_cierre,cumplimientoProcesos:skills.cumplimiento_procesos}:{},coachingFeedbacks:feedback,traceability:this.history('ojt','participant_id',p.id)}};
 }
 async get(path:string):Promise<D|undefined>{
  if(this.documents.has(path))return clone(this.documents.get(path));
  const [root,id,child,childId]=path.split('/');let out:D|undefined;
  const names:D={companies:'companies',users:'profiles',campaigns:'campaigns',candidates:'persons',trainings:'training_groups',captureLinks:'capture_links',captations:'captures',selectionApplications:'applications',selectionMessages:'message_templates',attendanceUnlockRequests:'attendance_unlocks'};
  const row=this.find(names[root]||root,id);
  if(root==='selectionTemplates')out=this.template(id);
  else if(root==='selectionTemplateFamilies'){const ts=this.rows('process_templates').filter(t=>t.family_id===id).sort((a,b)=>b.revision-a.revision);if(ts[0])out={id,companyId:this.companyId,campaignId:ts[0].campaign_id,version:ts[0].revision,latestId:ts[0].id};}
  else if(root==='systemSettings'){const setting=this.rows('system_settings').find(s=>s.id===id);if(setting)out={...setting.configuration,id,companyId:this.companyId};}
  else if(root.startsWith('capture')&&['captureIdentities','captureRequests','captureRateLimits'].includes(root)){const r=this.find('capture_runtime',root+':'+id);if(r)out={id,companyId:this.companyId,candidateId:r.candidate_id,fingerprint:r.fingerprint,count:r.request_count,expiresAt:r.expires_at,createdAt:r.created_at};}
  else if(child==='participants'){const p=this.participant(childId,id);if(p)out=this.participantProjection(p);}
  else if(child==='documents'){const d=this.find('person_documents',childId);if(d&&d.person_id===id){const f=this.find('files',d.file_id);out={...this.project('person_documents',d),name:d.annotations?.name||f?.original_name,status:d.storage_status,objectKey:f?.object_key,fileName:f?.original_name,fileSizeBytes:f?.size_bytes,mimeType:f?.mime_type};}}
  else if(row){
   out=this.project(names[root],row);
   if(root==='users'){
    out={...out,uid:row.auth_user_id||row.annotations?.canonicalAuthId||row.id,name:row.display_name,module:this.relate('user_modules','user_id',id).map(m=>m.module),allowedModules:this.relate('user_modules','user_id',id).map(m=>m.module),scope:this.relate('campaign_assignments','user_id',id).filter(a=>a.assignment_kind==='SCOPE').map(a=>a.campaign_id),subordinateUserIds:this.relate('supervision','supervisor_id',id).map(s=>s.subordinate_id)};
   }else if(root==='campaigns'){
    const r=this.relate('campaign_assignments','campaign_id',id).filter(a=>a.assignment_kind==='RESPONSIBLE');
    const people=await Promise.all(r.map(async a=>({userId:a.user_id,userName:(await this.get('users/'+a.user_id))?.displayName,userRole:this.find('profiles',a.user_id)?.role,target:a.target||0,hiredCount:this.rows('hiring').filter(h=>h.status==='CONTRATADO'&&this.find('applications',h.application_id)?.campaign_id===id&&this.find('applications',h.application_id)?.recruiter_id===a.user_id).length,isDirectResponsible:a.annotations?.isDirectResponsible})));
    const covered=this.rows('hiring').filter(h=>h.status==='CONTRATADO'&&this.find('applications',h.application_id)?.campaign_id===id).length;
    out={...out,responsibles:people,assignedUserIds:r.map(a=>a.user_id),statusHistory:this.history('campaign','campaign_id',id),positionsCovered:covered,positionsPending:Math.max(0,row.vacancies-covered),sources:row.annotations?.sourceConfiguration||[],assignedAnalystName:this.find('profiles',row.assigned_analyst_id)?.display_name};
   }else if(root==='trainings'){
    const p=this.relate('participants','group_id',id);const c=await this.get('campaigns/'+row.campaign_id);
    out={...out,campaignName:c?.title,company:c?.company,trainerName:this.find('profiles',row.trainer_id)?.display_name||'',trainerEmail:this.find('profiles',row.trainer_id)?.username||'',coordinatorName:this.find('profiles',row.coordinator_id)?.display_name||'',participantIds:p.map(p=>this.personForApp(p.application_id)),enrolledCount:p.length,activeCount:p.filter(x=>!['NO_APTO','DESERTO','NSP'].includes(x.status)).length,passedCount:p.filter(x=>['APTO_ALTA','OJT_APROBADO'].includes(x.status)).length,dropoutCount:this.rows('dropouts').filter(d=>p.some(x=>x.id===d.participant_id)).length,managementHistory:this.history('group','group_id',id),evaluationsConfig:this.relate('evaluation_definitions','group_id',id).map(d=>({id:d.annotations?.logicalId||d.id,name:d.name,date:d.annotations?.date,maxScore:d.max_score,minScore:d.min_score}))};
   }else if(root==='captureLinks'){out={...out,id:row.annotations?.publicToken||id,source:this.find('recruitment_sources',row.source_id)?.name};}
   else if(root==='captations'){const p=this.find('persons',row.person_id);out={...out,createdAt:row.received_at||row.created_at,source:this.find('recruitment_sources',row.source_id)?.name,applicant:{fullName:row.applicant_name||p?.full_name,phone:row.applicant_phone||p?.phone,email:row.applicant_email??p?.email,documentType:row.applicant_document_type||p?.document_type,documentNumber:row.applicant_document_number||p?.document_number,district:row.applicant_district||p?.district,...(row.annotations?.applicant?.techCenterAnswers?{techCenterAnswers:row.annotations.applicant.techCenterAnswers}:{}),...(row.annotations?.applicant?.formSubmission?{formSubmission:row.annotations.applicant.formSubmission}:{})},history:this.history('capture','capture_id',id)};}
   else if(root==='selectionApplications'){out={...out,processSnapshot:row.process_snapshot||null,rules:row.annotations?.rules||{},interviews:this.relate('interviews','application_id',id).map(i=>({...i.annotations,id:i.id,status:i.status,scheduledAt:i.scheduled_at,interviewerId:i.interviewer_id,notes:i.notes,result:i.result})),evaluationAttempts:this.relate('evaluations','application_id',id).map(e=>this.evalProjection(e)),communications:this.relate('messages','application_id',id).map(m=>({...m.annotations,id:m.id,content:m.body,status:m.status,templateId:m.template_id,at:m.sent_at})),history:this.history('application','application_id',id)};}
   else if(root==='candidates'){
    const app=this.find('applications',row.current_application_id)||this.rows('applications').filter(a=>a.person_id===id).at(-1);const p=this.participant(id);const pr=p?this.participantProjection(p):undefined;const group=p?await this.get('trainings/'+p.group_id):undefined;const c=app?await this.get('campaigns/'+app.campaign_id):undefined;const scores=app?this.relate('selection_scores','application_id',app.id)[0]:undefined;
    const hire=app?this.relate('hiring','application_id',app.id)[0]:undefined;const salary=this.relate('salary_accounts','person_id',id)[0];
    const interview=app?this.relate('interviews','application_id',app.id).filter(i=>i.result).at(-1):undefined;
    const tech=app?this.relate('technical_verifications','application_id',app.id).at(-1):undefined;
    out={...out,city:row.district||'',dni:row.document_number||'',documentNumber:row.document_number||'',birthDate:date(row.birth_date)||'',experienceMonths:row.experience_months||0,englishLevel:row.english_level||'NINGUNO',campaignId:app?.campaign_id||'',campaignName:c?.title||'',campaignCode:c?.code||'',jobProfile:c?.title||'',recruiterId:app?.recruiter_id||row.owner_id,recruiterName:this.find('profiles',app?.recruiter_id||row.owner_id)?.display_name,analystId:c?.assignedAnalystId,analystName:c?.assignedAnalystName,applicationDate:date(app?.application_date)||date(row.created_at),selectionApplicationId:app?.annotations?.initialized?app.id:undefined,selectionActive:app?.status==='ACTIVA',selectionProcessSnapshot:app?.process_snapshot||null,trainingId:p?.group_id,
     selection:{...(app?.annotations?.selectionMeta||{}),callId:app?.campaign_id||'',stage:app?.stage||'NUEVO',status:app?.selection_status||'ACTIVO',scores:{psicometrico:scores?.psychometric||0,vozDiccion:scores?.diction||0,tipificacionWPM:scores?.wpm||0,simulacionRoleplay:scores?.roleplay||0,overall:scores?.overall||0},processChecks:app?.process_checks||{},contactHistory:app?this.relate('contacts','application_id',app.id).map(x=>({...x.annotations,id:x.id,date:date(x.contacted_at),type:x.channel,summary:x.summary,outcome:x.outcome,nextStep:x.next_step})):[],evaluations:app?this.relate('evaluations','application_id',app.id).map(e=>this.evalProjection(e)):[],evaluationsList:app?this.relate('evaluations','application_id',app.id).map(e=>this.evalProjection(e)):[],observations:this.relate('observations','person_id',id).map(o=>({...o.annotations,id:o.id,text:o.body,tag:o.tag,date:date(o.created_at)})),traceability:app?this.history('selection','application_id',app.id):[],interviewResult:interview?{...interview.annotations,status:interview.result,notes:interview.notes,date:date(interview.performed_at||interview.scheduled_at)}:undefined,technicalVerification:tech?{...tech.annotations,status:tech.result,notes:tech.notes,date:date(tech.verified_at)}:undefined,documents:[]},
     training:{...(p?.annotations?.trainingMeta||{}),cohortId:p?.group_id,cohortName:group?.name,cohortCode:group?.code,trainerName:group?.trainerName,startDate:group?.startDate,endDate:group?.endDate,ojtStartDate:group?.ojtStartDate,ojtEndDate:group?.ojtEndDate,status:pr?.status||'PENDIENTE_INICIO',finalGrade:pr?.finalGrade??p?.annotations?.trainingMeta?.finalGrade,theoryCompletedAt:pr?.theoryCompletedAt??p?.annotations?.trainingMeta?.theoryCompletedAt,attendance:pr?.attendance||[],evaluations:pr?.evaluations||[],dropoutRecord:pr?.dropout,dropoutDate:pr?.dropout?.date},
     ojt:pr?.ojt||{status:'NO_INICIADO',dailyMetrics:[],skillsMatrix:{},coachingFeedbacks:[]},
     hiring:{...(hire?this.project('hiring',hire):{}),status:hire?.status||'PENDIENTE_CONTRATACION',documentsValidated:hire?.documents_validated||false,laborData:hire?.annotations?.laborExtras?{...hire.annotations.laborExtras,baseSalary:hire.base_salary,variableBonus:hire.variable_bonus,contractType:hire.contract_type,officialStartDate:date(hire.official_start)}:{},contract:hire?.annotations?.contractExtras?{...hire.annotations.contractExtras,contractNumber:hire.contract_number,signatureStatus:hire.signature_status,contractVersion:hire.contract_version,generatedDate:date(hire.generated_at),signedDate:date(hire.signed_at)}:{}},salaryAccount:salary?this.project('salary_accounts',salary):undefined,documents:[]};
    out.documents=await this.query('candidates/'+id+'/documents',{});out.selection.documents=out.documents.map((d:D)=>({...d,status:({VALIDATED:'VALIDADO',UPLOADED:'CARGADO',OBSERVED:'OBSERVADO',REJECTED:'RECHAZADO',PENDING:'PENDIENTE'} as D)[d.status]||d.status}));
   }
  }
  return out?clone(out):undefined;
 }
 async query(collection:string,filters:D={},limit=2001):Promise<D[]> {
  const [root,parent,child]=collection.split('/');let paths:string[]=[];
  if(child==='participants')paths=this.relate('participants','group_id',parent).map(p=>collection+'/'+this.personForApp(p.application_id));
  else if(child==='documents')paths=this.relate('person_documents','person_id',parent).map(d=>collection+'/'+d.id);
  else {
   const tables:D={users:'profiles',campaigns:'campaigns',candidates:'persons',trainings:'training_groups',captureLinks:'capture_links',captations:'captures',attendanceUnlockRequests:'attendance_unlocks',selectionApplications:'applications',selectionTemplates:'process_templates',selectionMessages:'message_templates'};
   paths=this.rows(tables[root]||root).filter(r=>r.archived_at==null).map(r=>root+'/'+r.id);
  }
  paths=Array.from(new Set([...paths,...Array.from(this.documents.keys()).filter(p=>p.split('/').slice(0,-1).join('/')===collection)]));
  const docs=(await Promise.all(paths.map(p=>this.get(p)))).filter((x):x is D=>!!x);
  return docs.filter(x=>Object.entries(filters).every(([k,v])=>JSON.stringify(x[k])===JSON.stringify(v))).slice(0,limit);
 }
 // Entrada es contrato validado por las funciones de negocio existentes, no cuerpo libre del frontend.
 async write(path:string,patch:D,create=false){
  const existing=await this.get(path);if(create&&existing)throw new SupabaseError(409,'DUPLICATE_RECORD');
  const data=clean({...existing,...patch});if(data.companyId&&data.companyId!==this.companyId)throw new SupabaseError(403,'FORBIDDEN');
  this.documents.set(path,{...data,id:path.split('/').at(-1),companyId:this.companyId});
 }
 markPasswordReset(uid:string){this.resetIds.add(uid);}
 async commit(){
  if(!this.documents.size&&!this.resetIds.size)return;
  const items=Array.from(this.documents.entries());
  const priority=(p:string)=>p.startsWith('users/')?0:p.startsWith('campaigns/')?1:p.startsWith('candidates/')&&!p.includes('/documents/')?2:p.startsWith('selectionTemplates/')?3:p.startsWith('selectionApplications/')?4:p.startsWith('trainings/')&&!p.includes('/participants/')?5:6;
  items.sort((a,b)=>priority(a[0])-priority(b[0]));
  for(const [path,data]of items)await this.serialize(path,data);
  const commit={p_actor:this.actorId,p_company:this.companyId,p_revision:this.snapshot.revision,p_rows:Array.from(this.changed.values()),p_resets:Array.from(this.resetIds)};
  if(this.companyGrants)await this.rpc('talent_org_user_commit',{...commit,p_user:this.companyGrants.userId,p_grants:this.companyGrants.grants});
  else await this.rpc('talent_runtime_commit',{...commit,p_public_hash:this.hash});
  this.committed=true;
  for(const work of this.authAfterCommit)await work();
 }
 private async serialize(path:string,d:D):Promise<void>{
  const [root,id,child,childId]=path.split('/');
  if(root==='users'){
   this.base('profiles',id,d,{auth_user_id:id,display_name:d.displayName||d.name||d.username,status:d.status||'ACTIVO',enabled:d.enabled!==false});
   if(d.module||d.allowedModules){const keep:string[]=[];for(const m of d.allowedModules||d.module){const k=id+':module:'+m;keep.push(k);this.put('user_modules',k,{user_id:id,module:m,archived_at:null});}this.archiveMissing('user_modules','user_id',id,keep);}
   if(d.scope){const keep:string[]=[];for(const c of d.scope){if(c===this.companyId)continue;const k=id+':scope:'+c;keep.push(k);this.put('campaign_assignments',k,{campaign_id:c,user_id:id,assignment_kind:'SCOPE',archived_at:null});}for(const a of this.relate('campaign_assignments','user_id',id).filter(a=>a.assignment_kind==='SCOPE'))if(!keep.includes(a.id))this.put('campaign_assignments',a.id,{archived_at:new Date().toISOString()});}
   if(d.subordinateUserIds){const keep=d.subordinateUserIds.map((u:string)=>id+':sub:'+u);d.subordinateUserIds.forEach((u:string)=>this.put('supervision',id+':sub:'+u,{supervisor_id:id,subordinate_id:u,archived_at:null}));this.archiveMissing('supervision','supervisor_id',id,keep);}return;
  }
  if(root==='campaigns'){
   this.base('campaigns',id,d,{code:d.code||id,status:d.status||'EN_PROCESO',vacancies:d.vacancies||1});
   if(d.sources)this.put('campaigns',id,{annotations:{...this.find('campaigns',id)?.annotations,sourceConfiguration:d.sources}});
   if(d.responsibles){const keep:string[]=[];for(const r of d.responsibles){const k=id+':resp:'+r.userId;keep.push(k);this.put('campaign_assignments',k,{campaign_id:id,user_id:r.userId,target:r.target||0,assignment_kind:'RESPONSIBLE',archived_at:null});}for(const a of this.relate('campaign_assignments','campaign_id',id).filter(a=>a.assignment_kind==='RESPONSIBLE'))if(!keep.includes(a.id))this.put('campaign_assignments',a.id,{archived_at:new Date().toISOString()});}
   this.events('campaign',{campaign_id:id},d.statusHistory);return;
  }
  if(root==='trainings'&&!child){
   this.base('training_groups',id,d,{code:d.code||id,name:d.name||d.code||id,theory_end_date:date(d.endDate)||date(d.startDate),theory_days:d.totalDays||5,ojt_days:d.ojtTotalDays||5,schedule:d.schedule||'09:00-16:00',status:d.status||'PENDIENTE_ASIGNACION',modality:d.modality||'PRESENCIAL'});
   this.events('group',{group_id:id},d.managementHistory);
   for(const e of d.evaluationsConfig||[])this.ensureDefinition(e,id,null);
   return;
  }
  if(root==='candidates'&&!child){
   let identityId:string|undefined;
   const documentNumber=String(d.dni||d.documentNumber||'').trim().toUpperCase();
   if(this.env.ORG_ENABLED==='true'&&!this.find('persons',id)&&documentNumber){
    if(!this.env.IDENTITY_HASH_SECRET)throw new SupabaseError(503,'IDENTITY_SERVICE_NOT_CONFIGURED');
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(this.env.IDENTITY_HASH_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signed=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(['PE',String(d.documentType||'DNI').toUpperCase(),documentNumber])));
    const fingerprint=Array.from(new Uint8Array(signed)).map(b=>b.toString(16).padStart(2,'0')).join('');
    identityId=await this.rpc('talent_org_identity_reserve',{p_actor:this.actorId,p_company:this.companyId,p_public_hash:this.hash,p_fingerprint:fingerprint});
   }
   const existing=this.find('persons',id);const appId=d.selectionApplicationId||existing?.current_application_id||(d.campaignId?'APP:'+id+':'+d.campaignId:null);
   this.base('persons',id,d,{...(identityId?{shared_identity_id:identityId}:{}),full_name:d.fullName||'',district:d.district||d.city||'',birth_date:date(d.birthDate),owner_id:d.recruiterId||null,current_application_id:appId});
   if(appId&&d.campaignId){
    const app=this.find('applications',appId);
    this.put('applications',appId,{person_id:id,campaign_id:d.campaignId,recruiter_id:d.recruiterId,status:d.selectionActive===false?'CERRADA':app?.status||'ACTIVA',stage:d.selection?.stage||app?.stage||'NUEVO',selection_status:d.selection?.status||app?.selection_status||'ACTIVO',application_date:date(d.applicationDate)||date(new Date().toISOString()),template_id:d.selectionProcessSnapshot?.id||app?.template_id||null,process_snapshot:d.selectionProcessSnapshot||app?.process_snapshot||null,process_checks:d.selection?.processChecks||app?.process_checks||{},annotations:{...app?.annotations,selectionMeta:Object.fromEntries(Object.entries(d.selection||{}).filter(([k])=>!['stage','status','callId','scores','contactHistory','evaluations','evaluationsList','documents','observations','traceability','interviewResult','technicalVerification','processChecks'].includes(k))),initialized:!!d.selectionApplicationId}});
    const scores=d.selection?.scores;if(scores)this.put('selection_scores',appId,{application_id:appId,psychometric:scores.psicometrico||0,diction:scores.vozDiccion||0,wpm:scores.tipificacionWPM||0,roleplay:scores.simulacionRoleplay||0,overall:scores.overall||0});
    this.events('selection',{application_id:appId},d.selection?.traceability);
    for(const c of d.selection?.contactHistory||[])this.put('contacts',c.id,{application_id:appId,actor_id:this.actorId,contacted_at:c.date+'T'+(c.time||'00:00')+':00Z',channel:c.type||'LLAMADA',outcome:c.outcome||null,summary:c.summary||'',next_step:c.nextStep||null,annotations:c});
    for(const o of d.selection?.observations||[])this.put('observations',o.id,{person_id:id,application_id:appId,author_id:this.actorId,body:o.text||'',tag:o.tag||'GENERAL',annotations:o});
    const interview=d.selection?.interviewResult;if(interview)this.put('interviews','legacy-interview:'+appId,{application_id:appId,interviewer_id:interview.responsibleId||this.actorId,status:'Realizada',result:interview.status,notes:interview.notes||'',performed_at:interview.date||new Date().toISOString(),annotations:interview});
    const tech=d.selection?.technicalVerification;if(tech)this.put('technical_verifications','technical:'+appId,{application_id:appId,evaluator_id:this.actorId,result:tech.status,notes:tech.notes||'',verified_at:tech.date||new Date().toISOString(),annotations:tech});
    for(const e of d.selection?.evaluationsList||d.selection?.evaluations||[])this.evaluation(e,id,appId,null);
   }
   if(d.trainingId&&appId){const p=this.participant(id,d.trainingId);const pid=p?.id||d.trainingId+':'+id;this.put('participants',pid,{group_id:d.trainingId,application_id:appId,status:d.training?.status||p?.status||'PENDIENTE_INICIO',joined_at:p?.joined_at||new Date().toISOString(),ojt_status:d.ojt?.status||p?.ojt_status||'NO_INICIADO',annotations:{...p?.annotations,trainingMeta:Object.fromEntries(Object.entries(d.training||{}).filter(([k])=>!['status','attendance','evaluations','dropoutRecord'].includes(k)))}});if(d.ojt||d.training)this.serializeParticipant(pid,{...this.participantProjection(this.find('participants',pid)!),status:d.training?.status||p?.status,attendance:d.training?.attendance||[],evaluations:d.training?.evaluations||[],ojt:d.ojt||{}},id);}
   if(d.salaryAccount)this.base('salary_accounts',id,d.salaryAccount,{person_id:id,has_account:d.salaryAccount.hasAccount===true});
   if(d.hiring&&appId){const h=d.hiring,l=h.laborData||{},c=h.contract||{};this.base('hiring',appId,h,{application_id:appId,participant_id:this.participant(id)?.id||null,status:h.status||'PENDIENTE_CONTRATACION',contract_type:l.contractType||null,base_salary:l.baseSalary||l.remuneration||0,variable_bonus:l.variableBonus||0,official_start:date(l.officialStartDate),planned_start:date(l.plannedStartDate),contract_number:c.contractNumber||null,signature_status:c.signatureStatus||null,contract_version:c.contractVersion||null,generated_at:c.generatedDate||null,signed_at:c.signedDate||null});this.put('hiring',appId,{annotations:{...this.find('hiring',appId)?.annotations,laborExtras:l,contractExtras:c}});}
   return;
  }
  if(root==='trainings'&&child==='participants'){
   const app=this.find('persons',childId)?.current_application_id;if(!app)throw new SupabaseError(409,'PARTICIPANT_APPLICATION_MISSING');
   const p=this.participant(childId,id),pid=p?.id||id+':'+childId;
   this.base('participants',pid,d,{group_id:id,application_id:app,joined_at:p?.joined_at||d.createdAt||new Date().toISOString(),status:d.status||'PENDIENTE_INICIO',ojt_status:d.ojt?.status||p?.ojt_status||'NO_INICIADO'});
   this.serializeParticipant(pid,d,childId);return;
  }
  if(child==='documents'){
   const fid=d.objectKey?'file:'+childId+':'+await digest(d.objectKey):this.find('person_documents',childId)?.file_id||'file:'+childId;
   if(d.objectKey)this.put('files',fid,{object_key:d.objectKey,original_name:d.fileName||d.name||'Documento',mime_type:d.mimeType||'application/pdf',size_bytes:d.fileSizeBytes||0,uploaded_by:d.uploadedBy||this.actorId,state:'AVAILABLE'});
   this.base('person_documents',childId,d,{person_id:id,file_id:d.objectKey?fid:this.find('person_documents',childId)?.file_id||null,status:({UPLOADED:'CARGADO',VALIDATED:'VALIDADO',OBSERVED:'OBSERVADO',REJECTED:'RECHAZADO',PENDING:'PENDIENTE'} as D)[d.status]||d.status,storage_status:d.status,validated_by:d.status==='VALIDATED'?this.actorId:null});return;
  }
  if(root==='selectionApplications'){
   this.base('applications',id,d,{person_id:d.candidateId,campaign_id:d.campaignId,recruiter_id:d.recruiterId,stage:this.find('applications',id)?.stage||'NUEVO',application_date:date(d.createdAt)||date(new Date().toISOString()),template_id:d.processSnapshot?.id||null,process_snapshot:d.processSnapshot||null,annotations:{...this.find('applications',id)?.annotations,rules:d.rules,initialized:true}});
   for(const i of d.interviews||[])this.put('interviews',i.id,{application_id:id,interviewer_id:i.interviewerId,status:i.status,scheduled_at:i.scheduledAt,notes:i.notes||'',result:i.result||null,annotations:i});
   for(const e of d.evaluationAttempts||[])this.evaluation(e,d.candidateId,id,null);
   for(const m of d.communications||[])this.put('messages',m.id,{application_id:id,template_id:m.templateId||null,sender_id:this.actorId,body:m.content,status:m.status||'PREPARADO',sent_at:m.at,annotations:m});
   this.events('application',{application_id:id},d.history);return;
  }
  if(root==='selectionTemplates'){
   this.base('process_templates',id,d,{family_id:d.familyId||id,revision:d.version||1,name:d.name,annotations:{...d.annotations,interviewFields:d.interviewFields||[]}});
   (d.stages||[]).forEach((s:D,i:number)=>this.put('process_stages',id+':stage:'+i,{template_id:id,stage:s.stage,ordinal:i+1,requirements:s.requirements}));
   (d.responsibleIds||[]).forEach((u:string)=>this.put('template_responsibles',id+':resp:'+u,{template_id:id,user_id:u}));
   for(const e of d.evaluations||[])this.ensureDefinition(e,null,id);return;
  }
  if(root==='selectionTemplateFamilies')return; // Derivada de la familia/revisión de templates.
  if(root==='selectionMessages'){this.base('message_templates',id,d);return;}
  if(root==='captureLinks'){this.base('capture_links',id,d,{token_hash:await digest(id),source_id:this.source(d.source),annotations:{publicToken:id}});return;}
  if(root==='captations'){this.base('captures',id,d,{source_id:this.source(d.source),received_at:this.find('captures',id)?.received_at||d.createdAt||new Date().toISOString(),applicant_name:d.applicant?.fullName,applicant_phone:d.applicant?.phone,applicant_email:d.applicant?.email,applicant_document_type:d.applicant?.documentType,applicant_document_number:d.applicant?.documentNumber,applicant_district:d.applicant?.district,...(d.applicant?.techCenterAnswers||d.applicant?.formSubmission?{annotations:{applicant:{...(d.applicant.techCenterAnswers?{techCenterAnswers:d.applicant.techCenterAnswers}:{}),...(d.applicant.formSubmission?{formSubmission:d.applicant.formSubmission}:{})}}}:{})});this.events('capture',{capture_id:id},d.history);return;}
  if(['captureIdentities','captureRequests','captureRateLimits'].includes(root)){this.put('capture_runtime',root+':'+id,{kind:({captureIdentities:'IDENTITY',captureRequests:'REQUEST',captureRateLimits:'RATE'} as D)[root],candidate_id:d.candidateId||null,fingerprint:d.fingerprint||null,request_count:d.count||0,expires_at:d.expiresAt||null});return;}
  if(root==='attendanceUnlockRequests'){
   const group=d.trainingId;const day=date(d.date)!;this.ensureDay(group,day,1);
   this.base('attendance_unlocks',id,d,{group_id:group,day_date:day,requested_by:d.requestedBy||d.requestedByUid||this.actorId,status:d.status||'PENDIENTE',decided_by:d.status==='PENDIENTE'?null:this.actorId,decided_at:d.decidedAt||null,expires_at:d.status==='APROBADA'?(d.expiresAt||new Date(Date.now()+30*60000).toISOString()):null});
   return;
  }
  if(root==='systemSettings'){this.put('system_settings',id,{name:'main',configuration:d});return;}
  if(root==='auditLogs'||root==='captureAudit'){this.events('audit',{user_id:this.actorId},[{...d,id,previousValue:undefined,newValue:undefined}]);return;}
  throw new SupabaseError(400,'UNKNOWN_RELATIONAL_CONTRACT');
 }
 private ensureDay(groupId:string,day:string,dayNumber:number){
  const existing=this.rows('training_days').find(d=>d.group_id===groupId&&date(d.day_date)===day);if(existing)return;
  const group=this.find('training_groups',groupId);const clock=String(group?.schedule||'09:00').match(/\d{2}:\d{2}/)?.[0]||'09:00';
  this.put('training_days',groupId+':day:'+day,{group_id:groupId,day_date:day,phase:group?.ojt_start_date&&day>=date(group.ojt_start_date)!?'OJT':'TEORIA',day_number:dayNumber||1,starts_at:day+'T'+clock+':00-05:00'});
 }
 private ensureDefinition(e:D,group:string|null,template:string|null){
  const id=(template||group||'selection')+':def:'+(e.definitionId||e.evaluationId||e.id);
  if(this.find('evaluation_definitions',id))return id;
  this.put('evaluation_definitions',id,{name:e.name||e.title||e.moduleName||'Evaluación',domain:group?'FORMACION':'SELECCION',revision:e.processVersion||1,family_id:id,max_score:e.maxScore||e.questions?.reduce((s:number,q:D)=>s+q.points,0)||100,min_score:e.minScore??e.minRequired??0,group_id:group,template_id:template,annotations:{logicalId:e.definitionId||e.evaluationId||e.id,date:e.date}});
  (e.questions||[]).forEach((q:D,i:number)=>{const qid=id+':question:'+q.id;this.put('evaluation_items',qid,{definition_id:id,label:q.label,item_type:q.type,points:q.points,ordinal:i+1,annotations:{logicalId:q.id}});(q.options||[]).forEach((o:string,j:number)=>this.put('evaluation_options',qid+':option:'+j,{item_id:qid,label:o,is_correct:j===q.correctIndex,ordinal:j+1}));});
  return id;
 }
 private evaluation(e:D,person:string,app:string,participant:string|null){
  const group=participant?this.find('participants',participant)?.group_id:null;
  const appRow=this.find('applications',app);
  const templateId=appRow?.process_snapshot?.id||null;
  const def=this.ensureDefinition(e.definitionSnapshot||e,group||null,templateId);
  const id=String(e.id||app+':eval:'+e.evaluationId);
  const previous=this.find('evaluations',id);if(previous&&Number(previous.score)===Number(e.score||0)&&previous.result===(e.result||(e.passed?'APTO':'NO_APTO'))&&String(previous.comments||'')===String(e.comments||e.feedback||''))return;
  this.put('evaluations',id,{definition_id:def,person_id:person,application_id:app,participant_id:participant,evaluator_id:e.responsibleId||e.trainerId||this.actorId,evaluated_at:e.recordedAt||e.date||new Date().toISOString(),score:e.score||0,result:e.result||(e.passed?'APTO':'NO_APTO'),comments:e.comments||e.feedback||'',annotations:Object.fromEntries(Object.entries(e).filter(([k])=>!['answers','definitionSnapshot','score','maxScore','result','date','responsibleId','trainerId'].includes(k)))});
  for(const a of e.answers||[]){const qid=def+':question:'+a.questionId;this.put('evaluation_answers',id+':answer:'+a.questionId,{evaluation_id:id,item_id:qid,option_id:a.choice!==undefined?qid+':option:'+a.choice:null,answer_text:a.text||null,points:a.points||0,annotations:a});}
 }
 private serializeParticipant(pid:string,d:D,person:string){
  const p=this.find('participants',pid)!;
  const o=d.ojt||{};this.put('participants',pid,{ojt_status:o.status||p.ojt_status,training_approved:d.trainingApproved===true,annotations:{...p.annotations,ojtMeta:Object.fromEntries(Object.entries(o).filter(([k])=>!['status','dailyMetrics','skillsMatrix','coachingFeedbacks','traceability'].includes(k)))}});
  for(const a of d.attendance||[]){const day=date(a.date)!;const previous=this.find('attendance',pid+':attendance:'+day);if(previous&&previous.status===(a.attendance||a.status)&&String(previous.notes||'')===String(a.notes||a.observation||''))continue;this.ensureDay(p.group_id,day,a.dayNumber||1);this.put('attendance',pid+':attendance:'+day,{group_id:p.group_id,participant_id:pid,day_date:day,status:a.attendance||a.status,notes:a.notes||a.observation||null,marked_by:a.trainerId||this.actorId,annotations:a});}
  for(const e of d.evaluations||[])this.evaluation(e,person,p.application_id,pid);
  for(let i=0;i<(o.dailyMetrics||[]).length;i++){const m=o.dailyMetrics[i];this.put('ojt_metrics',pid+':ojt:'+date(m.date),{participant_id:pid,day_date:date(m.date),day_number:m.dayNumber||i+1,attendance_status:m.attendance||null,hours_worked:m.hoursManaged??m.hoursWorked??0,sales:m.sales||0,calls:m.calls||0,leads:m.leads||0,conversions:m.conversions||0,aht_seconds:m.ahtSeconds||null,qa_score:m.qaScore??null,observations:m.observations||'',coach_feedback:m.feedback||m.coachFeedback||'',annotations:m});}
  if(o.skillsMatrix&&Object.keys(o.skillsMatrix).length){const s=o.skillsMatrix;const id=pid+':skills:'+JSON.stringify(s);if(!this.find('ojt_skills',id))this.put('ojt_skills',id,{participant_id:pid,assessed_by:this.actorId,assessed_at:new Date().toISOString(),manejo_objeciones:s.manejoObjeciones,diccion_modulacion:s.diccionModulacion,velocidad_sistemas:s.velocidadSistemas,empatia_escucha:s.empatiaEscucha,tecnica_cierre:s.tecnicaCierre,cumplimiento_procesos:s.cumplimientoProcesos});}
  for(const f of o.coachingFeedbacks||[])this.put('feedback',f.id,{person_id:person,participant_id:pid,author_id:this.actorId,strong_points:f.strongPoints,improvement_points:f.improvementPoints,action_plan:f.actionPlan,commitment_date:date(f.commitmentDate),participant_signed:f.participantSigned===true,annotations:f});
  const dropout=d.dropout||d.dropoutRecord;
  if(dropout)this.base('dropouts',pid+':dropout:'+date(dropout.date),dropout,{participant_id:pid,occurred_on:date(dropout.date),phase:dropout.stage||'CAPACITACION_TEORICA',category:dropout.category||'OTRO',observation:dropout.observation||dropout.reason||'',recorded_by:this.actorId});
  this.events('participant',{participant_id:pid},d.traceability);this.events('ojt',{participant_id:pid},o.traceability);
 }
}
