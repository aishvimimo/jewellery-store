import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { orderRequestSchema,paymentAccessSchema } from '@store/contracts';
import type { OrderRepository } from './orders.js';
import { CommerceError } from './quote.js';
export async function registerOrders(app:FastifyInstance,repo:OrderRepository,origins:string[]){
 app.get('/api/v1/checkout/config',async(_,reply)=>{reply.header('Cache-Control','no-store');return {mode:repo.settings.mode,paymentMethods:repo.settings.mode==='disabled'?[]:repo.settings.onlineEnabled&&repo.settings.mode==='test'?['cod','online']:['cod'],pinPrefixes:repo.settings.pinPrefixes};});
 const origin=async(req:{headers:{origin?:string}})=>{if(!req.headers.origin||!origins.includes(req.headers.origin))throw new CommerceError(403,'ORIGIN_DENIED','Use the configured storefront to submit your order');};
 app.post('/api/v1/orders',{preHandler:[origin],config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async(req,reply)=>{
  reply.header('Cache-Control','no-store');const result=await repo.create(orderRequestSchema.parse(req.body));reply.code(result.replayed?200:201);return result.order;
 });
 app.post('/api/v1/orders/receipt',{preHandler:[origin],config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async(req,reply)=>{
  reply.header('Cache-Control','no-store');const {id,secret,checkoutKey}=z.object({id:z.string().uuid().optional(),checkoutKey:z.string().uuid().optional(),secret:z.string().regex(/^[a-f0-9]{64}$/)}).strict().refine(v=>!!v.id!==!!v.checkoutKey,{message:'Provide one order identifier'}).parse(req.body);return repo.customerReceipt(id,secret,checkoutKey);
 });
 app.post('/api/v1/orders/detail',{preHandler:[origin],config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async(req,reply)=>{
  reply.header('Cache-Control','no-store');const {id,secret}=paymentAccessSchema.parse(req.body);return repo.customerDetail(id,secret);
 });
}
