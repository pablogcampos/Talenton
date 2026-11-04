export const offerWorkdays={FULL_TIME:'Fulltime',SEMI_FULL:'Semifull',PART_TIME:'Part time'} as const;
export type OfferWorkday=keyof typeof offerWorkdays;
export function normalizeOfferWorkday(value:unknown):OfferWorkday|undefined{
 if(typeof value!=='string')return;
 const key=value.toLowerCase().replace(/[^a-z]/g,'');
 if(key==='fulltime'||key==='full')return 'FULL_TIME';
 if(key==='semifull'||key==='semiful')return 'SEMI_FULL';
 if(key==='parttime'||key==='part')return 'PART_TIME';
}
