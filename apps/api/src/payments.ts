import { createHash,randomUUID } from 'node:crypto';
import { and,asc,eq,sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import * as s from './schema.js';
import { CommerceError } from './quote.js';
import type { OrderRepository } from './orders.js';
import { validSignature,type PaymentGateway,type GatewayOrder,type GatewayPayment } from './razorpay.js';
export function paymentService(db:NodePgDatabase<typeof s>,orders:OrderRepository,gateway:PaymentGateway){
 const fingerprint=(body:Buffer)=>createHash('sha256').update(body).digest('hex');
 async function local(id:string){const row=(await db.select().from(s.orders).where(eq(s.orders.id,id)))[0];if(!row||row.paymentMethod!=='online'||row.mode!=='test')throw new CommerceError(404,'NOT_FOUND','Online test order not found');return row;}
 async function session(id:string){return (await db.select().from(s.paymentSessions).where(eq(s.paymentSessions.orderId,id)))[0];}
 function validateOrder(row:typeof s.orders.$inferSelect,remote:GatewayOrder){if(remote.receipt!==row.id||remote.amount!==row.totalPaise||remote.currency!=='INR'||!remote.notes||Array.isArray(remote.notes)||remote.notes.local_order_id!==row.id)throw new CommerceError(409,'PAYMENT_MISMATCH','Payment order details do not match. Store review is required.');}
 async function attach(row:typeof s.orders.$inferSelect,remote:GatewayOrder){
  validateOrder(row,remote);
  await db.transaction(async tx=>{await tx.select().from(s.orders).where(eq(s.orders.id,row.id)).for('update');const current=(await tx.select().from(s.paymentSessions).where(eq(s.paymentSessions.orderId,row.id)).for('update'))[0];if(!current||current.keyId!==gateway.keyId)throw new CommerceError(409,'KEY_CHANGED','The payment key changed. Contact the store.');if(current.gatewayOrderId&&current.gatewayOrderId!==remote.id)throw new CommerceError(409,'PAYMENT_CONFLICT','Multiple gateway orders require review');await tx.update(s.paymentSessions).set({gatewayOrderId:remote.id,state:'ready',issue:null}).where(eq(s.paymentSessions.orderId,row.id));});
 }
 async function resolve(row:typeof s.orders.$inferSelect){
  const current=await session(row.id);if(!current)return null;
  if(current.keyId!==gateway.keyId)throw new CommerceError(409,'KEY_CHANGED','Use the original test payment key to reconcile this order');
  if(current.gatewayOrderId)return current.gatewayOrderId;
  if(current.state==='creating'&&Date.now()-current.createdAt.getTime()<30000)throw new CommerceError(409,'PAYMENT_PREPARING','Payment setup is in progress. Check this order again shortly.');
  const matches=await gateway.find(row.id);
  if(matches.length>1)throw new CommerceError(409,'PAYMENT_CONFLICT','Multiple gateway orders require store review');
  if(!matches.length)return null;
  await attach(row,matches[0]);return matches[0].id;
 }
 async function apply(id:string,remoteId:string,payment:GatewayPayment){
  await db.transaction(async tx=>{
   const row=(await tx.select().from(s.orders).where(eq(s.orders.id,id)).for('update'))[0];const current=(await tx.select().from(s.paymentSessions).where(eq(s.paymentSessions.orderId,id)).for('update'))[0];
   if(!row||!current||current.keyId!==gateway.keyId||current.gatewayOrderId!==remoteId||payment.order_id!==remoteId||payment.amount!==row.totalPaise||payment.currency!=='INR')throw new CommerceError(409,'PAYMENT_MISMATCH','Payment details do not match the saved order');
   if(row.paymentStatus==='refunded'&&current.paymentId===payment.id)return;
   if(!((payment.status==='captured'&&payment.captured)||payment.status==='refunded'))return;
   const review=row.inventoryReleased||row.status==='cancelled'||row.paymentStatus==='review'||payment.amount_refunded>0||payment.status==='refunded'||(current.paymentId!==null&&current.paymentId!==payment.id);
   const paymentStatus=review?'review':'paid',status=!review&&row.status==='pending'?'confirmed':row.status;
   if(current.paymentId===payment.id&&row.paymentStatus===paymentStatus&&row.status===status)return;
   await tx.update(s.paymentSessions).set({paymentId:current.paymentId??payment.id,issue:review?'Review capture/refund; do not fulfil automatically':null,lastCheckedAt:new Date()}).where(eq(s.paymentSessions.orderId,id));
   await tx.update(s.orders).set({paymentStatus,status,version:sql`${s.orders.version}+1`,updatedAt:new Date()}).where(eq(s.orders.id,id));
   await tx.insert(s.orderEvents).values({id:randomUUID(),orderId:id,status,paymentStatus,note:review?'Payment needs review: late capture, refund or additional payment':'Razorpay captured test payment verified'});
  });
 }
 async function reconcile(id:string){
  const row=await local(id);await db.update(s.paymentSessions).set({lastCheckedAt:new Date()}).where(eq(s.paymentSessions.orderId,id));
  const remoteId=await resolve(row);
  if(!remoteId){await orders.releaseExpired(id);return orders.receipt(id);}
  const remote=await gateway.order(remoteId);validateOrder(row,remote);
  const payments=await gateway.payments(remoteId);
  const successes=payments.filter(p=>(p.status==='captured'&&p.captured)||p.status==='refunded');
  for(const p of successes)await apply(id,remoteId,p);
  // Authorized or unknown provider states retain stock; API failures never release it.
  if(!successes.length&&payments.every(p=>['failed','created'].includes(p.status))&&remote.status!=='paid')await orders.releaseExpired(id);
  return orders.receipt(id);
 }
 return {gateway,
  async start(id:string,secret?:string){
   // Calls without a receipt secret are made only after authenticated account ownership checks.
   if(secret!==undefined)await orders.customerReceipt(id,secret);const row=await local(id);
   const claim=await db.transaction(async tx=>{
    const locked=(await tx.select().from(s.orders).where(eq(s.orders.id,id)).for('update'))[0];
    if(locked.status!=='pending'||locked.paymentStatus!=='pending'||!locked.paymentExpiresAt||locked.paymentExpiresAt<=new Date())throw new CommerceError(409,'PAYMENT_CLOSED','This payment reservation is closed. Check order status before starting another order.');
    const previous=(await tx.select().from(s.paymentSessions).where(eq(s.paymentSessions.orderId,id)))[0];if(previous)return false;
    await tx.insert(s.paymentSessions).values({orderId:id,keyId:gateway.keyId,state:'creating'});return true;
   });
   let remoteId:string|null;
   if(claim){try{const remote=await gateway.create(id,row.totalPaise);await attach(row,remote);remoteId=remote.id;}catch(error){await db.update(s.paymentSessions).set({state:'uncertain',issue:'Gateway setup response uncertain; reconcile this order'}).where(and(eq(s.paymentSessions.orderId,id),sql`${s.paymentSessions.gatewayOrderId} IS NULL`));throw error;}}
   else remoteId=await resolve(row);
   if(!remoteId)throw new CommerceError(503,'PAYMENT_UNCERTAIN','Payment setup could not be confirmed. Check this order again; a second provider order will not be created.');
   const now=await local(id);if(now.status!=='pending'||now.paymentStatus!=='pending'||now.paymentExpiresAt!<=new Date())throw new CommerceError(409,'PAYMENT_CLOSED','This reservation closed during setup. Check order status.');
   return {keyId:gateway.keyId,gatewayOrderId:remoteId,amountPaise:row.totalPaise,currency:'INR' as const,expiresAt:row.paymentExpiresAt!.toISOString(),mode:'test' as const};
  },
  async verify(input:{id:string,secret?:string,razorpay_order_id:string,razorpay_payment_id:string,razorpay_signature:string}){
   if(input.secret!==undefined)await orders.customerReceipt(input.id,input.secret);const current=await session(input.id);
   if(!current||current.keyId!==gateway.keyId||!current.gatewayOrderId||current.gatewayOrderId!==input.razorpay_order_id||!validSignature(current.gatewayOrderId+'|'+input.razorpay_payment_id,input.razorpay_signature,gateway.keySecret))throw new CommerceError(400,'INVALID_SIGNATURE','Payment verification failed');
   const payment=await gateway.payment(input.razorpay_payment_id);if(payment.id!==input.razorpay_payment_id)throw new CommerceError(409,'PAYMENT_MISMATCH','The provider returned a different payment');await apply(input.id,current.gatewayOrderId,payment);return orders.receipt(input.id);
  },
  reconcile,
  async customerReconcile(id:string,secret:string){await orders.customerReceipt(id,secret);return reconcile(id);},
  async webhook(raw:Buffer,signature:unknown,eventId:unknown){
   if(!gateway.webhookSecrets.some(secret=>validSignature(raw,signature,secret)))throw new CommerceError(400,'INVALID_SIGNATURE','Invalid webhook signature');
   if(typeof eventId!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(eventId))throw new CommerceError(400,'INVALID_EVENT','Webhook event ID is required');
   const id=gateway.keyId+':'+eventId,bodyHash=fingerprint(raw),existing=(await db.select().from(s.paymentWebhookEvents).where(eq(s.paymentWebhookEvents.id,id)))[0];
   if(existing){if(existing.bodyHash!==bodyHash)throw new CommerceError(409,'EVENT_CONFLICT','Webhook event payload changed');return {ok:true};}
   let json:unknown;try{json=JSON.parse(raw.toString('utf8'));}catch{throw new CommerceError(400,'INVALID_EVENT','Invalid webhook JSON');}
   const data=z.object({event:z.string().max(100),payload:z.object({payment:z.object({entity:z.object({order_id:z.string().regex(/^order_[A-Za-z0-9]+$/).max(80).nullable().optional()})}).optional(),refund:z.object({entity:z.object({payment_id:z.string().regex(/^pay_[A-Za-z0-9]+$/).max(80)})}).optional()})}).parse(json);
   const refundEvent=['refund.created','refund.processed','refund.failed'].includes(data.event);
   let gatewayOrderId=data.payload.payment?.entity.order_id;
   if(refundEvent&&data.payload.refund)gatewayOrderId=(await gateway.payment(data.payload.refund.entity.payment_id)).order_id;
   if((['payment.captured','payment.authorized','payment.failed','order.paid'].includes(data.event)||refundEvent)&&gatewayOrderId){
    // Re-fetch from our account: signed events can be out of order and contain old snapshots.
    const remote=await gateway.order(gatewayOrderId);const parsed=z.string().uuid().safeParse(remote.receipt);
    if(parsed.success){const row=(await db.select().from(s.orders).where(eq(s.orders.id,parsed.data)))[0];if(row&&row.paymentMethod==='online'&&row.mode==='test'){await attach(row,remote);await reconcile(row.id);}}
   }
   // Mark only after processing. A database/API failure remains retryable. State application is independently idempotent.
   await db.insert(s.paymentWebhookEvents).values({id,bodyHash,eventType:data.event}).onConflictDoNothing();return {ok:true};
  },
  async tick(){
   const rows=await db.select({id:s.orders.id}).from(s.orders).leftJoin(s.paymentSessions,eq(s.paymentSessions.orderId,s.orders.id)).where(and(eq(s.orders.paymentMethod,'online'),eq(s.orders.mode,'test'),eq(s.orders.paymentStatus,'pending'),sql`(${s.orders.status}='pending' OR (${s.orders.status}='cancelled' AND ${s.paymentSessions.orderId} IS NOT NULL AND ${s.orders.updatedAt}>now()-interval '48 hours'))`,sql`(${s.paymentSessions.orderId} IS NOT NULL OR ${s.orders.paymentExpiresAt}<=now())`)).orderBy(sql`${s.paymentSessions.lastCheckedAt} ASC NULLS FIRST`,asc(s.orders.createdAt)).limit(10);
   for(const row of rows){try{await reconcile(row.id);}catch{await db.update(s.paymentSessions).set({lastCheckedAt:new Date(),issue:'Provider check failed; stock retained until verified'}).where(eq(s.paymentSessions.orderId,row.id));}}
  },
 };
}
export type PaymentService=ReturnType<typeof paymentService>;
