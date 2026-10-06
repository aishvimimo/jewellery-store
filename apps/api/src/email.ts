import { createCipheriv,createDecipheriv,randomBytes,randomUUID } from 'node:crypto';
import { and,asc,eq,sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import * as s from './schema.js';
import { CommerceError } from './quote.js';
import { money } from '@store/contracts';
export type EmailOptions={driver:'local'|'resend'|'disabled',siteUrl:string,encryptionKey:string,from:string,apiKey?:string,production:boolean,send?:(id:string,recipient:string,subject:string,text:string)=>Promise<string>};
export type CommerceDb=NodePgDatabase<typeof s>;
export type CommerceTx=Parameters<Parameters<CommerceDb['transaction']>[0]>[0];
export function emailService(db:CommerceDb,options:EmailOptions){
 const key=Buffer.from(options.encryptionKey,'hex');if(key.length!==32)throw new Error('Email encryption key must be 32 bytes');
 if(options.production&&options.driver==='local')throw new Error('Local email preview cannot run in production');
 function encrypt(text:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const body=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),body].map(b=>b.toString('base64')).join('.');}
 function decrypt(value:string){const [iv,tag,body]=value.split('.').map(v=>Buffer.from(v,'base64'));const cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(body),cipher.final()]).toString('utf8');}
 async function enqueue(tx:CommerceTx|CommerceDb,eventKey:string,recipient:string,subject:string,text:string,validUntil:Date|null=null){await tx.insert(s.emailOutbox).values({id:randomUUID(),eventKey,recipient,subject,encryptedPayload:encrypt(text),validUntil}).onConflictDoNothing({target:s.emailOutbox.eventKey});}
 async function generate(){
  const events=await db.select({event:s.orderEvents,order:s.orders}).from(s.orderEvents).innerJoin(s.orders,eq(s.orders.id,s.orderEvents.orderId)).leftJoin(s.emailOutbox,sql`${s.emailOutbox.eventKey}='order-event:'||${s.orderEvents.id}`).where(and(sql`${s.emailOutbox.id} IS NULL`,sql`${s.orderEvents.createdAt}>=(SELECT enabled_at FROM notification_settings WHERE id='orders')`)).orderBy(asc(s.orderEvents.createdAt),asc(s.orderEvents.id)).limit(30);
  for(const {event,order} of events){const customer=order.customer as {email:string,name:string};const title=event.status==='shipped'?'Order dispatched':event.status==='confirmed'?'Order confirmed':event.status==='pending'?'Order received':event.status==='cancelled'?'Order cancelled':'Order update';const tracking=order.tracking as {carrier:string,number:string}|null;
   const lines=await db.select().from(s.orderLines).where(eq(s.orderLines.orderId,order.id));const totals=order.totals as {totalPaise:number};
   const text=`${order.mode==='test'?'TEST ORDER — no real payment or shipment\n\n':''}Hello ${customer.name},\n\n${title}: ${order.number}\nStatus: ${event.status}\nPayment: ${event.paymentStatus}\n\n${lines.map(l=>`${l.name} · ${l.label} × ${l.quantity}: ${money(l.lineTotalPaise)}`).join('\n')}\nTotal: ${money(totals.totalPaise)}\n${event.status==='shipped'&&tracking?`Carrier: ${tracking.carrier}\nTracking: ${tracking.number}\n`:''}\nView your orders: ${options.siteUrl}/account/\nSign in with the checkout email and verify it to link your guest orders.\n`;
   await enqueue(db,'order-event:'+event.id,customer.email,`${order.mode==='test'?'[TEST] ':''}${title} · ${order.number}`,text);
  }
  const eventsReturn=await db.select({event:s.returnEvents,request:s.returnRequests,order:s.orders}).from(s.returnEvents).innerJoin(s.returnRequests,eq(s.returnRequests.id,s.returnEvents.requestId)).innerJoin(s.orders,eq(s.orders.id,s.returnRequests.orderId)).leftJoin(s.emailOutbox,sql`${s.emailOutbox.eventKey}='return-event:'||${s.returnEvents.id}`).where(sql`${s.emailOutbox.id} IS NULL`).orderBy(asc(s.returnEvents.createdAt)).limit(20);
  for(const {event,request,order} of eventsReturn){const c=order.customer as {email:string};await enqueue(db,'return-event:'+event.id,c.email,`${order.mode==='test'?'[TEST] ':''}Return/refund update · ${order.number}`,`Order: ${order.number}\nRequest: ${request.kind}\nStatus: ${event.state}\n${event.note}\n\nView: ${options.siteUrl}/account/\n${order.mode==='test'?'This is a test order; no real payment or shipment.':''}`);}
 }
 async function send(id:string,recipient:string,subject:string,text:string){if(options.send)return options.send(id,recipient,subject,text);const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+options.apiKey,'Content-Type':'application/json','Idempotency-Key':'store-mail/'+id},body:JSON.stringify({from:options.from,to:[recipient],subject,text}),signal:AbortSignal.timeout(10000),redirect:'error'});if(!response.ok)throw new Error('Email provider unavailable');return z.object({id:z.string()}).parse(await response.json()).id;}
 async function tick(){
  await generate();if(options.driver==='disabled')return;
  for(let i=0;i<10;i++){
   const row=await db.transaction(async tx=>{const selected=(await tx.select().from(s.emailOutbox).where(and(sql`${s.emailOutbox.state} IN ('queued','processing')`,sql`${s.emailOutbox.availableAt}<=now()`)).orderBy(asc(s.emailOutbox.createdAt)).limit(1).for('update',{skipLocked:true}))[0];if(!selected)return null;
    if((selected.validUntil&&selected.validUntil<=new Date())||(selected.firstAttemptAt&&Date.now()-selected.firstAttemptAt.getTime()>23*3600000)){await tx.update(s.emailOutbox).set({state:selected.validUntil&&selected.validUntil<=new Date()?'expired':'review',issue:'Expired message or uncertain delivery outside safe retry window',encryptedPayload:null}).where(eq(s.emailOutbox.id,selected.id));return {skip:true} as const;}
    await tx.update(s.emailOutbox).set({state:'processing',attempts:selected.attempts+1,firstAttemptAt:selected.firstAttemptAt??new Date(),availableAt:new Date(Date.now()+120000)}).where(eq(s.emailOutbox.id,selected.id));return {skip:false,row:selected} as const;
   });if(!row)break;if(row.skip)continue;
   const mail=row.row;
   try{if(!mail.encryptedPayload)throw new Error('Missing payload');const text=decrypt(mail.encryptedPayload);if(options.driver==='local'){await db.update(s.emailOutbox).set({state:'preview',issue:null}).where(eq(s.emailOutbox.id,mail.id));}else{const providerId=await send(mail.id,mail.recipient,mail.subject,text);await db.update(s.emailOutbox).set({state:'sent',providerId,encryptedPayload:null,issue:null}).where(eq(s.emailOutbox.id,mail.id));}}
   catch{await db.update(s.emailOutbox).set({state:'queued',issue:'Delivery failed; retry queued',availableAt:new Date(Date.now()+Math.min(3600000,30000*2**Math.min(mail.attempts,7)))}).where(eq(s.emailOutbox.id,mail.id));}
  }
  await db.update(s.emailOutbox).set({encryptedPayload:null,state:'expired'}).where(and(eq(s.emailOutbox.state,'preview'),sql`${s.emailOutbox.createdAt}<now()-interval '7 days'`));
 }
 return {options,enqueue,tick,generate,
  async list(){const rows=await db.select().from(s.emailOutbox).orderBy(sql`${s.emailOutbox.createdAt} DESC`).limit(100);return rows.map(r=>({id:r.id,recipient:r.recipient,subject:r.subject,state:r.state,attempts:r.attempts,issue:r.issue,createdAt:r.createdAt.toISOString(),previewAvailable:!options.production&&options.driver==='local'&&!!r.encryptedPayload}));},
  async preview(id:string){if(options.production||options.driver!=='local')throw new CommerceError(403,'PREVIEW_DISABLED','Email content preview is available only in local development');const r=(await db.select().from(s.emailOutbox).where(eq(s.emailOutbox.id,id)))[0];if(!r?.encryptedPayload)throw new CommerceError(404,'NOT_FOUND','Email preview not found');return {recipient:r.recipient,subject:r.subject,text:decrypt(r.encryptedPayload)};},
 };
}
export type EmailService=ReturnType<typeof emailService>;
