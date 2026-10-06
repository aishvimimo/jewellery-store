import { createHmac,timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { CommerceError } from './quote.js';
const providerId=z.string().regex(/^(order|pay)_[A-Za-z0-9]+$/).max(80);
export const gatewayOrderSchema=z.object({id:providerId,amount:z.number().int().positive(),currency:z.string(),receipt:z.string().nullable(),notes:z.union([z.record(z.string()),z.array(z.unknown())]).nullable().default({}),status:z.string()});
export const gatewayPaymentSchema=z.object({id:providerId,order_id:providerId.nullable(),amount:z.number().int().positive(),currency:z.string(),status:z.string(),captured:z.boolean().default(false),amount_refunded:z.number().int().nonnegative().default(0)});
export type GatewayOrder=z.infer<typeof gatewayOrderSchema>;export type GatewayPayment=z.infer<typeof gatewayPaymentSchema>;
export const gatewayRefundSchema=z.object({id:z.string().regex(/^rfnd_[A-Za-z0-9]+$/),payment_id:providerId,amount:z.number().int().positive(),currency:z.string(),status:z.string(),receipt:z.string().nullable().optional(),notes:z.union([z.record(z.string()),z.array(z.unknown())]).nullable().optional()});
export type GatewayRefund=z.infer<typeof gatewayRefundSchema>;
export type PaymentGateway={refundCreate?:(paymentId:string,amount:number,requestId:string)=>Promise<GatewayRefund>,refunds?:(paymentId:string)=>Promise<GatewayRefund[]>,refund?:(id:string)=>Promise<GatewayRefund>,keyId:string,keySecret:string,webhookSecrets:string[],create:(receipt:string,amount:number)=>Promise<GatewayOrder>,find:(receipt:string)=>Promise<GatewayOrder[]>,order:(id:string)=>Promise<GatewayOrder>,payment:(id:string)=>Promise<GatewayPayment>,payments:(id:string)=>Promise<GatewayPayment[]>};
export function validSignature(body:string|Buffer,signature:unknown,secret:string){
 if(typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))return false;
 const expected=createHmac('sha256',secret).update(body).digest();return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
export function razorpayGateway(keyId:string,keySecret:string,webhookSecrets:string[]):PaymentGateway{
 const authorization='Basic '+Buffer.from(keyId+':'+keySecret).toString('base64');
 async function call(path:string,body?:unknown,headers:Record<string,string>={}){
  try{const response=await fetch('https://api.razorpay.com/v1'+path,{method:body?'POST':'GET',headers:{Authorization:authorization,...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(8000),redirect:'error'});if(!response.ok)throw new Error('Gateway HTTP failure');return await response.json();}
  catch{throw new CommerceError(503,'GATEWAY_UNAVAILABLE','Could not contact the payment provider. Check this same order again; do not place a duplicate order.');}
 }
 return {keyId,keySecret,webhookSecrets,
  refundCreate:async(paymentId,amount,requestId)=>gatewayRefundSchema.parse(await call('/payments/'+encodeURIComponent(paymentId)+'/refund',{amount,speed:'normal',receipt:requestId,notes:{local_return_id:requestId}},{'X-Refund-Idempotency':requestId})),
  refund:async id=>gatewayRefundSchema.parse(await call('/refunds/'+encodeURIComponent(id))),
  refunds:async paymentId=>{const all:GatewayRefund[]=[];for(let skip=0;skip<1000;skip+=100){const {items}=z.object({items:z.array(gatewayRefundSchema)}).parse(await call('/payments/'+encodeURIComponent(paymentId)+'/refunds?count=100&skip='+skip));all.push(...items);if(items.length<100)return all;}throw new CommerceError(409,'REFUND_REVIEW','Too many provider refunds; reconcile manually');},
  create:async(receipt,amount)=>gatewayOrderSchema.parse(await call('/orders',{amount,currency:'INR',receipt,notes:{local_order_id:receipt},partial_payment:false})),
  find:async(receipt)=>z.object({items:z.array(gatewayOrderSchema)}).parse(await call('/orders?receipt='+encodeURIComponent(receipt)+'&count=100')).items.filter(o=>o.receipt===receipt),
  order:async id=>gatewayOrderSchema.parse(await call('/orders/'+encodeURIComponent(id))),
  payment:async id=>gatewayPaymentSchema.parse(await call('/payments/'+encodeURIComponent(id))),
  payments:async id=>z.object({items:z.array(gatewayPaymentSchema)}).parse(await call('/orders/'+encodeURIComponent(id)+'/payments')).items,
 };
}
