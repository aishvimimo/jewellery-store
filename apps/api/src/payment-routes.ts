import type { FastifyInstance } from 'fastify';
import { paymentAccessSchema,paymentVerifySchema } from '@store/contracts';
import type { PaymentService } from './payments.js';
import { CommerceError } from './quote.js';
export async function registerPayments(app:FastifyInstance,payments:PaymentService,origins:string[]){
 const origin=async(req:{headers:{origin?:string}})=>{if(!req.headers.origin||!origins.includes(req.headers.origin))throw new CommerceError(403,'ORIGIN_DENIED','Use the configured storefront for payments');};
 const opts={preHandler:[origin],config:{rateLimit:{max:15,timeWindow:'1 minute'}}};
 app.post('/api/v1/payments/start',opts,async(req,reply)=>{reply.header('Cache-Control','no-store');const {id,secret}=paymentAccessSchema.parse(req.body);return payments.start(id,secret);});
 app.post('/api/v1/payments/verify',opts,async(req,reply)=>{reply.header('Cache-Control','no-store');return payments.verify(paymentVerifySchema.parse(req.body));});
 app.post('/api/v1/payments/status',opts,async(req,reply)=>{reply.header('Cache-Control','no-store');const {id,secret}=paymentAccessSchema.parse(req.body);return payments.customerReconcile(id,secret);});
 // Scope the raw parser to this webhook only. Other routes keep normal JSON/multipart parsers.
 await app.register(async webhook=>{
  webhook.removeContentTypeParser('application/json');
  webhook.addContentTypeParser('application/json',{parseAs:'buffer',bodyLimit:262144},(_req,body,done)=>done(null,body));
  webhook.post('/api/v1/payments/razorpay/webhook',{bodyLimit:262144,config:{rateLimit:false}},async(req,reply)=>{reply.header('Cache-Control','no-store');return payments.webhook(req.body as Buffer,req.headers['x-razorpay-signature'],req.headers['x-razorpay-event-id']);});
 });
}
