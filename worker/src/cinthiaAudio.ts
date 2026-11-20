/** Private stereo PCM recording of server-received microphone and relayed CinthIA audio. */
export class CinthiaAudioRecorder {
 private chunks:{at:number;channel:number;samples:Int16Array}[]=[];
 private writes=Promise.resolve();
 private origin:number;private cursor:number;private outputEnd:number;
 constructor(private persist:(wav:Uint8Array,startedAt:string,durationMs:number)=>Promise<void>,private now=()=>Date.now()){this.origin=this.cursor=this.outputEnd=now();}
 add(data:string,rate:number,channel:0|1){
  if(![16000,24000,48000].includes(rate))return;
  const raw=atob(data);if(raw.length%2||raw.length>131072)return;
  const input=new DataView(Uint8Array.from(raw,c=>c.charCodeAt(0)).buffer),length=Math.floor(raw.length/2*16000/rate),samples=new Int16Array(length);
  for(let n=0;n<length;n++)samples[n]=input.getInt16(Math.min(raw.length/2-1,Math.floor(n*rate/16000))*2,true);
  const duration=length/16,at=channel===1?Math.max(this.now(),this.outputEnd):Math.max(this.cursor,this.now()-duration);
  if(channel===1)this.outputEnd=at+duration;
  if(at-this.now()>30000)throw Error('CINTHIA_AUDIO_BACKLOG');
  this.chunks.push({at,channel,samples});
 }
 interrupt(){const now=this.now();this.chunks=this.chunks.flatMap(c=>c.channel===0?[c]:c.at>=now?[]:[{...c,samples:c.samples.slice(0,Math.max(0,Math.floor((now-c.at)*16)))}]);this.outputEnd=now;}
 flush(){const next=this.writes.catch(()=>{}).then(()=>this.flushNow());this.writes=next;return next;}
 private async flushNow(){
  const end=this.now(),duration=Math.min(60000,end-this.cursor);if(duration<1)return;
  const count=Math.floor(duration*16),bytes=new Uint8Array(44+count*4),v=new DataView(bytes.buffer);
  const text=(at:number,s:string)=>[...s].forEach((c,i)=>v.setUint8(at+i,c.charCodeAt(0)));
  text(0,'RIFF');v.setUint32(4,bytes.length-8,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,16000,true);v.setUint32(28,64000,true);v.setUint16(32,4,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,count*4,true);
  const cutoff=this.cursor+duration;
  for(const c of this.chunks){const offset=Math.round((c.at-this.cursor)*16);for(let n=Math.max(0,-offset);n<c.samples.length&&n+offset<count;n++)v.setInt16(44+(n+offset)*4+c.channel*2,c.samples[n],true);}
  await this.persist(bytes,new Date(this.cursor).toISOString(),Math.round(duration));
  this.cursor=cutoff;this.chunks=this.chunks.filter(c=>c.at+c.samples.length/16>cutoff);
 }
}
