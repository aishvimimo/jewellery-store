import { createHash,randomUUID,timingSafeEqual } from 'node:crypto';
import { and,asc,desc,eq,inArray,sql,type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { orderReceiptSchema,customerOrderSchema,adminOrderSchema,orderTotalsSchema,type OrderRequest,orderListQuerySchema,orderUpdateSchema } from '@store/contracts';
import type { z } from 'zod';
import * as s from './schema.js';
import { catalogueRepository } from './catalogue.js';
import { checkoutQuote,CommerceError } from './quote.js';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const matches=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export type OrderSettings={mode:'test'|'live'|'disabled',pinPrefixes:string[],onlineEnabled?:boolean,reservationMinutes?:number};
export function orderRepository(db:NodePgDatabase<typeof s>,settings:OrderSettings){
 type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
 async function receipt(id:string){
  const row=(await db.select().from(s.orders).where(eq(s.orders.id,id)))[0];
  if(!row)throw new CommerceError(404,'NOT_FOUND','Order not found');
  const lines=await db.select().from(s.orderLines).where(eq(s.orderLines.orderId,id)).orderBy(asc(s.orderLines.variantId));
  return orderReceiptSchema.parse({...row,createdAt:row.createdAt.toISOString(),paymentExpiresAt:row.paymentExpiresAt?.toISOString()??null,lines});
 }
 async function detail(id:string){
  const row=(await db.select().from(s.orders).where(eq(s.orders.id,id)))[0];
  if(!row)throw new CommerceError(404,'NOT_FOUND','Order not found');
  const events=await db.select({id:s.orderEvents.id,status:s.orderEvents.status,paymentStatus:s.orderEvents.paymentStatus,note:s.orderEvents.note,createdAt:s.orderEvents.createdAt,userName:s.adminUsers.name}).from(s.orderEvents).leftJoin(s.adminUsers,eq(s.adminUsers.id,s.orderEvents.userId)).where(eq(s.orderEvents.orderId,id)).orderBy(asc(s.orderEvents.createdAt),asc(s.orderEvents.id));
  const session=(await db.select().from(s.paymentSessions).where(eq(s.paymentSessions.orderId,id)))[0];
  const payment=session?{gatewayOrderId:session.gatewayOrderId,paymentId:session.paymentId,state:session.state,lastCheckedAt:session.lastCheckedAt?.toISOString()??null,issue:session.issue}:null;
  return adminOrderSchema.parse({...await receipt(id),payment,version:row.version,customer:row.customer,address:row.address,tracking:row.tracking,events:events.map(e=>({...e,createdAt:e.createdAt.toISOString()}))});
 }
 async function customerAccountDetail(id:string){
  const row=(await db.select().from(s.orders).where(eq(s.orders.id,id)))[0];if(!row)throw new CommerceError(404,'NOT_FOUND','Order not found');
  const events=await db.select({id:s.orderEvents.id,status:s.orderEvents.status,paymentStatus:s.orderEvents.paymentStatus,createdAt:s.orderEvents.createdAt}).from(s.orderEvents).where(eq(s.orderEvents.orderId,id)).orderBy(asc(s.orderEvents.createdAt),asc(s.orderEvents.id));
  return customerOrderSchema.parse({...await receipt(id),tracking:row.tracking,events:events.map(e=>({...e,createdAt:e.createdAt.toISOString()}))});
 }
 // All commerce writes lock products in ID order before variants/inventory.
 // Catalogue edits already lock their product. Incrementing version stops stale stock overwrites.
 async function lockProducts(tx:Tx,ids:string[]){
  if(ids.length)await tx.select({id:s.products.id}).from(s.products).where(inArray(s.products.id,[...new Set(ids)].sort())).orderBy(asc(s.products.id)).for('update');
 }
 async function move(tx:Tx,variantId:string,orderId:string,before:number,after:number,reason:string,userId:string|null=null){
  if(after<0||after>1000000)throw new CommerceError(409,'STOCK_LIMIT','Adjust inventory before completing this order action');
  await tx.update(s.inventory).set({available:after,updatedAt:new Date()}).where(eq(s.inventory.variantId,variantId));
  await tx.insert(s.inventoryMovements).values({id:randomUUID(),variantId,orderId,userId,beforeQuantity:before,afterQuantity:after,reason});
 }
 return {
  settings,detail,receipt,customerAccountDetail,
  async create(input:OrderRequest){
   const {receiptSecret,checkoutKey,...body}=input;
   const requestHash=hash(JSON.stringify({...body,items:[...body.items].sort((a,b)=>a.variantId.localeCompare(b.variantId))})),secretHash=hash(receiptSecret),id=randomUUID();
   const result=await db.transaction(async tx=>{
    // Unique checkout key serializes retries. A failed transaction leaves no placeholder order.
    const inserted=await tx.insert(s.orders).values({id,number:'ORD-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+id.replaceAll('-','').slice(0,12).toUpperCase(),checkoutKey,receiptSecretHash:secretHash,requestHash,mode:settings.mode==='live'?'live':'test',customer:body.customer,address:body.address,totals:{},totalPaise:0,delivery:body.delivery,giftWrap:body.giftWrap,paymentMethod:body.paymentMethod,paymentStatus:body.paymentMethod==='online'?'pending':'unpaid',paymentExpiresAt:body.paymentMethod==='online'?new Date(Date.now()+(settings.reservationMinutes??30)*60000):null}).onConflictDoNothing({target:s.orders.checkoutKey}).returning({id:s.orders.id});
    if(!inserted.length){
     const previous=(await tx.select().from(s.orders).where(eq(s.orders.checkoutKey,checkoutKey)))[0];
     if(!previous||!matches(previous.receiptSecretHash,secretHash)||previous.requestHash!==requestHash)throw new CommerceError(409,'CHECKOUT_CONFLICT','This checkout attempt differs from an earlier submission. Review your order before starting again.');
     return {id:previous.id,replayed:true};
    }
    if(settings.mode==='disabled')throw new CommerceError(503,'CHECKOUT_DISABLED','Checkout is currently unavailable');
    if(body.expectedMode!==settings.mode)throw new CommerceError(409,'MODE_CHANGED','Checkout mode changed. Reload checkout and review before placing your order.');
    if(settings.mode==='live'&&!settings.pinPrefixes.some(p=>body.address.postalCode.startsWith(p)))throw new CommerceError(422,'DELIVERY_UNAVAILABLE','Delivery is not available for this PIN code');
    if(body.paymentMethod==='online'&&(!settings.onlineEnabled||settings.mode!=='test'))throw new CommerceError(503,'PAYMENTS_DISABLED','Online test payments are not configured');
    const ids=body.items.map(i=>i.variantId).sort();
    const known=await tx.select({productId:s.variants.productId}).from(s.variants).where(inArray(s.variants.id,ids));
    await lockProducts(tx,known.map(v=>v.productId));
    const variants=await tx.select().from(s.variants).where(inArray(s.variants.id,ids)).orderBy(asc(s.variants.id)).for('update');
    const stock=await tx.select().from(s.inventory).where(inArray(s.inventory.variantId,ids)).orderBy(asc(s.inventory.variantId)).for('update');
    const quote=await checkoutQuote(catalogueRepository(tx as unknown as NodePgDatabase<typeof s>),{items:body.items,coupon:body.coupon,prepaid:body.paymentMethod==='online',giftWrap:body.giftWrap,delivery:body.delivery,postalCode:body.address.postalCode});
    if(quote.totalPaise!==body.expectedTotalPaise)throw new CommerceError(409,'PRICE_CHANGED','Prices changed. Refresh the total and review it before placing your order.',{totalPaise:quote.totalPaise});
    const totals=orderTotalsSchema.parse(quote);
    await tx.update(s.orders).set({totals,totalPaise:totals.totalPaise}).where(eq(s.orders.id,id));
    await tx.insert(s.orderLines).values(quote.lines.map(line=>{const v=variants.find(v=>v.id===line.variantId)!;return {orderId:id,variantId:line.variantId,productId:v.productId,productSlug:line.productSlug,sku:v.sku,name:line.name,label:line.label,image:line.image,quantity:line.quantity,unitPricePaise:line.unitPricePaise,lineTotalPaise:line.lineTotalPaise};}));
    for(const line of quote.lines){const row=stock.find(v=>v.variantId===line.variantId);if(!row)throw new CommerceError(409,'INSUFFICIENT_STOCK','Inventory is unavailable');await move(tx,line.variantId,id,row.available,row.available-line.quantity,'Order placed');}
    await tx.update(s.products).set({version:sql`${s.products.version}+1`,updatedAt:new Date()}).where(inArray(s.products.id,[...new Set(variants.map(v=>v.productId))]));
    await tx.insert(s.orderEvents).values({id:randomUUID(),orderId:id,status:'pending',paymentStatus:body.paymentMethod==='online'?'pending':'unpaid',note:body.paymentMethod==='online'?'Awaiting online test payment':settings.mode==='test'?'Test order placed; no payment collected':'Cash-on-delivery order placed'});
    return {id,replayed:false};
   });
   return {order:await receipt(result.id),replayed:result.replayed};
  },
  async customerReceipt(id:string|undefined,secret:string,checkoutKey?:string){
   const row=(await db.select({id:s.orders.id,secret:s.orders.receiptSecretHash}).from(s.orders).where(id?eq(s.orders.id,id):eq(s.orders.checkoutKey,checkoutKey!)))[0];
   if(!row||!matches(row.secret,hash(secret)))throw new CommerceError(404,'NOT_FOUND','Order not found');
   return receipt(row.id);
  },
  async customerDetail(id:string,secret:string){
   const row=(await db.select({id:s.orders.id,secret:s.orders.receiptSecretHash,tracking:s.orders.tracking}).from(s.orders).where(eq(s.orders.id,id)))[0];
   if(!row||!matches(row.secret,hash(secret)))throw new CommerceError(404,'NOT_FOUND','Order not found');
   const events=await db.select({id:s.orderEvents.id,status:s.orderEvents.status,paymentStatus:s.orderEvents.paymentStatus,createdAt:s.orderEvents.createdAt}).from(s.orderEvents).where(eq(s.orderEvents.orderId,id)).orderBy(asc(s.orderEvents.createdAt),asc(s.orderEvents.id));
   return customerOrderSchema.parse({...await receipt(id),tracking:row.tracking,events:events.map(e=>({...e,createdAt:e.createdAt.toISOString()}))});
  },

  async releaseExpired(id:string){
   await db.transaction(async tx=>{
    const row=(await tx.select().from(s.orders).where(eq(s.orders.id,id)).for('update'))[0];
    if(!row||row.paymentMethod!=='online'||row.status!=='pending'||row.paymentStatus!=='pending'||row.inventoryReleased||!row.paymentExpiresAt||row.paymentExpiresAt>new Date())return;
    const lines=await tx.select().from(s.orderLines).where(eq(s.orderLines.orderId,id)).orderBy(asc(s.orderLines.variantId));
    await lockProducts(tx,lines.map(l=>l.productId));
    const stock=await tx.select().from(s.inventory).where(inArray(s.inventory.variantId,lines.map(l=>l.variantId))).orderBy(asc(s.inventory.variantId)).for('update');
    for(const line of lines){const current=stock.find(v=>v.variantId===line.variantId);if(!current)throw new CommerceError(409,'STOCK_MISSING','Inventory is missing');await move(tx,line.variantId,id,current.available,current.available+line.quantity,'Unpaid online reservation expired');}
    await tx.update(s.products).set({version:sql`${s.products.version}+1`,updatedAt:new Date()}).where(inArray(s.products.id,[...new Set(lines.map(l=>l.productId))]));
    await tx.update(s.orders).set({status:'cancelled',inventoryReleased:true,version:sql`${s.orders.version}+1`,updatedAt:new Date()}).where(eq(s.orders.id,id));
    await tx.insert(s.orderEvents).values({id:randomUUID(),orderId:id,status:'cancelled',paymentStatus:'pending',note:'Unpaid reservation expired; stock restored'});
   });
   return receipt(id);
  },
  async list(query:z.infer<typeof orderListQuerySchema>){
   const filters:SQL[]=[];
   if(query.status!=='all')filters.push(eq(s.orders.status,query.status));
   if(query.mode!=='all')filters.push(eq(s.orders.mode,query.mode));
   if(query.q){const term='%'+query.q.replace(/[\\%_]/g,'\\$&')+'%';filters.push(sql`(${s.orders.number} ILIKE ${term} OR ${s.orders.customer}->>'email' ILIKE ${term} OR ${s.orders.customer}->>'name' ILIKE ${term})`);}
   const [rows,total]=await Promise.all([db.select().from(s.orders).where(and(...filters)).orderBy(desc(s.orders.createdAt),desc(s.orders.id)).limit(query.limit).offset((query.page-1)*query.limit),db.select({count:sql<number>`count(*)::int`}).from(s.orders).where(and(...filters))]);
   return {items:await Promise.all(rows.map(async row=>({...await receipt(row.id),version:row.version,customerName:(row.customer as {name:string}).name}))),total:total[0].count,page:query.page,limit:query.limit};
  },
  async update(id:string,input:z.infer<typeof orderUpdateSchema>,userId:string){
   await db.transaction(async tx=>{
    const row=(await tx.select().from(s.orders).where(eq(s.orders.id,id)).for('update'))[0];
    if(!row)throw new CommerceError(404,'NOT_FOUND','Order not found');
    if(row.version!==input.version)throw new CommerceError(409,'EDIT_CONFLICT','This order changed. Reload its latest version before updating.');
    if(row.paymentStatus==='refunded')throw new CommerceError(409,'ORDER_REFUNDED','Refunded orders cannot be fulfilled or collected again');
    if(row.paymentMethod==='online'){
     if(input.paymentCollected)throw new CommerceError(400,'ONLINE_NOT_CASH','Online payments cannot be marked as cash collected');
     if(input.status==='cancelled')throw new CommerceError(409,'PAYMENT_RECONCILE_REQUIRED','Use Check payment to release expired unpaid reservations. Paid orders require a refund workflow.');
     if(row.paymentStatus!=='paid')throw new CommerceError(409,'PAYMENT_UNCONFIRMED','Do not fulfil an online order until captured payment is verified');
    }
    const allowed:Record<string,string[]>={pending:['confirmed','cancelled'],confirmed:['shipped','cancelled'],shipped:['delivered'],delivered:[],cancelled:[]};
    if(input.status!==row.status&&!allowed[row.status]?.includes(input.status))throw new CommerceError(409,'INVALID_TRANSITION','This order cannot move to the selected status');
    if(row.status==='cancelled')throw new CommerceError(409,'ORDER_CLOSED','Cancelled orders cannot be changed');
    if(input.paymentCollected&&input.status!=='delivered')throw new CommerceError(409,'PAYMENT_NOT_DELIVERED','Record cash collection only for a delivered order');
    if(input.status==='shipped'&&(await tx.select({id:s.returnRequests.id}).from(s.returnRequests).where(and(eq(s.returnRequests.orderId,id),eq(s.returnRequests.kind,'cancel'),sql`${s.returnRequests.state} NOT IN ('rejected','closed')`))).length)throw new CommerceError(409,'RETURN_HOLD','Review the cancellation request before dispatch');
    if(input.tracking&&!['shipped','delivered'].includes(input.status))throw new CommerceError(400,'INVALID_TRACKING','Tracking can be added when shipping the order');
    if(input.status==='cancelled'&&!row.inventoryReleased){
     const lines=await tx.select().from(s.orderLines).where(eq(s.orderLines.orderId,id)).orderBy(asc(s.orderLines.variantId));
     await lockProducts(tx,lines.map(l=>l.productId));
     const stock=await tx.select().from(s.inventory).where(inArray(s.inventory.variantId,lines.map(l=>l.variantId))).orderBy(asc(s.inventory.variantId)).for('update');
     for(const line of lines){const current=stock.find(v=>v.variantId===line.variantId);if(!current)throw new CommerceError(409,'STOCK_MISSING','Inventory is missing for this order');await move(tx,line.variantId,id,current.available,current.available+line.quantity,'Order cancelled',userId);}
     await tx.update(s.products).set({version:sql`${s.products.version}+1`,updatedAt:new Date()}).where(inArray(s.products.id,[...new Set(lines.map(l=>l.productId))]));
    }
    const paymentStatus=row.paymentMethod==='online'?row.paymentStatus:row.paymentStatus==='collected'||input.paymentCollected?'collected':'unpaid';
    if(row.paymentMethod==='cod'&&row.paymentStatus==='unpaid'&&paymentStatus==='collected'){
     if((await tx.select({id:s.returnRequests.id}).from(s.returnRequests).where(and(eq(s.returnRequests.orderId,id),eq(s.returnRequests.state,'closed')))).length)throw new CommerceError(409,'RETURN_CLOSED','A completed return cannot be marked newly collected');
     await tx.update(s.returnRequests).set({amountPaise:row.totalPaise,version:sql`${s.returnRequests.version}+1`,updatedAt:new Date()}).where(and(eq(s.returnRequests.orderId,id),eq(s.returnRequests.amountPaise,0),sql`${s.returnRequests.state} IN ('requested','approved','received')`));
    }

    await tx.update(s.orders).set({status:input.status,paymentStatus,tracking:input.tracking??row.tracking,inventoryReleased:input.status==='cancelled'||row.inventoryReleased,version:sql`${s.orders.version}+1`,updatedAt:new Date()}).where(eq(s.orders.id,id));
    await tx.insert(s.orderEvents).values({id:randomUUID(),orderId:id,userId,status:input.status,paymentStatus,note:input.note});
    await tx.insert(s.adminAudit).values({id:randomUUID(),userId,action:'order.updated',entityId:id,details:{number:row.number,statusBefore:row.status,statusAfter:input.status,paymentStatus}});
   });
   return detail(id);
  },
 };
}
export type OrderRepository=ReturnType<typeof orderRepository>;
