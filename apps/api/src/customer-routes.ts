import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance,FastifyRequest,FastifyReply } from 'fastify';
import { z } from 'zod';
import { accountRegisterSchema,accountLoginSchema,tokenActionSchema,passwordResetSchema,returnRequestSchema,returnRecordSchema,paymentAccessSchema,paymentVerifySchema } from '@store/contracts';
import type { CustomerService } from './customers.js';
import type { OrderRepository } from './orders.js';
import type { ReturnService } from './returns.js';
import type { PaymentService } from './payments.js';
import { CommerceError } from './quote.js';
export type CustomerOptions={service:CustomerService,production:boolean,sameSite:'lax'|'none',sessionHours:number,emailMode:'local'|'resend'|'disabled'};
export async function registerCustomers(app:FastifyInstance,options:CustomerOptions,origins:string[],orders:OrderRepository,returns:ReturnService,payments?:PaymentService){
 const prefix='/api/v1/account',cookieName=options.production?'__Host-store_customer':'store_customer',cookieOptions={httpOnly:true,secure:options.production,sameSite:options.sameSite,path:'/' as const};
 async function origin(req:FastifyRequest){if(!req.headers.origin||!origins.includes(req.headers.origin))throw new CommerceError(403,'ORIGIN_DENIED','Use the configured storefront');}
 async function session(req:FastifyRequest){const token=req.cookies[cookieName];if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new CommerceError(401,'UNAUTHORIZED','Sign in to continue');const result=await options.service.session(token);if(!result)throw new CommerceError(401,'UNAUTHORIZED','Your session expired. Sign in again');return {...result,token};}
 async function csrf(req:FastifyRequest){const auth=await session(req),value=req.headers['x-csrf-token'];if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)||!timingSafeEqual(Buffer.from(value),Buffer.from(auth.csrfToken)))throw new CommerceError(403,'CSRF_DENIED','Refresh your account security token');}
 app.addHook('onRequest',async(req,reply)=>{if(req.url.startsWith(prefix)||req.url.startsWith('/api/v1/returns')||req.url.startsWith('/api/v1/orders/returns'))reply.header('Cache-Control','no-store');});
 const publicWrite={preHandler:[origin],config:{rateLimit:{max:8,timeWindow:'15 minutes'}}},write={preHandler:[origin,csrf],config:{rateLimit:{max:20,timeWindow:'1 minute'}}};
 app.get(prefix+'/config',async()=>({emailMode:options.emailMode}));
 app.get(prefix+'/session',async(req,reply)=>{try{const auth=await session(req);return {user:auth.user,csrfToken:auth.csrfToken};}catch(e){if(e instanceof CommerceError&&e.statusCode===401){reply.clearCookie(cookieName,cookieOptions);return {user:null,csrfToken:null};}throw e;}});
 app.post(prefix+'/register',publicWrite,async req=>options.service.register(accountRegisterSchema.parse(req.body)));
 app.post(prefix+'/login',publicWrite,async(req,reply)=>{const body=accountLoginSchema.parse(req.body),auth=await options.service.login(body.email,body.password,req.cookies[cookieName]);if(!auth)throw new CommerceError(401,'LOGIN_FAILED','Unable to sign in. Check your details or try again later');reply.setCookie(cookieName,auth.token,{...cookieOptions,maxAge:options.sessionHours*3600});return {user:auth.user,csrfToken:auth.csrfToken};});
 app.post(prefix+'/logout',write,async(req,reply)=>{await options.service.logout((await session(req)).token);reply.clearCookie(cookieName,cookieOptions);return {ok:true};});
 app.post(prefix+'/verify',publicWrite,async req=>options.service.consume(tokenActionSchema.parse(req.body).token,'verify'));
 app.post(prefix+'/forgot-password',publicWrite,async req=>options.service.forgot(accountLoginSchema.pick({email:true}).parse(req.body).email));
 app.post(prefix+'/reset-password',publicWrite,async(req,reply)=>{const body=passwordResetSchema.parse(req.body),result=await options.service.consume(body.token,'reset',body.password);reply.clearCookie(cookieName,cookieOptions);return result;});
 app.post(prefix+'/resend-verification',write,async req=>options.service.resend((await session(req)).user.id));
 app.get(prefix+'/orders',async req=>{const query=z.object({page:z.coerce.number().int().min(1).max(10000).default(1)}).strict().parse(req.query);return options.service.list((await session(req)).user.id,query.page);});
 const orderId=(req:FastifyRequest)=>z.object({id:z.string().uuid()}).parse(req.params).id;
 app.get(prefix+'/orders/:id',async req=>options.service.detail((await session(req)).user.id,orderId(req)));
 app.get(prefix+'/orders/:id/returns',async req=>{await options.service.own((await session(req)).user.id,orderId(req));return (await returns.orderRequests(orderId(req))).map(r=>returnRecordSchema.parse(r));});
 app.post(prefix+'/returns',write,async req=>{const auth=await session(req),body=returnRequestSchema.parse(req.body);await options.service.own(auth.user.id,body.orderId);return returnRecordSchema.parse(await returns.create(body,auth.user.id));});
 if(payments){
  app.post(prefix+'/orders/:id/payment/start',write,async req=>{const id=orderId(req);await options.service.own((await session(req)).user.id,id);return payments.start(id);});
  app.post(prefix+'/orders/:id/payment/status',write,async req=>{const id=orderId(req);await options.service.own((await session(req)).user.id,id);return payments.reconcile(id);});
  app.post(prefix+'/orders/:id/payment/verify',write,async req=>{const id=orderId(req);await options.service.own((await session(req)).user.id,id);const body=paymentVerifySchema.omit({id:true,secret:true}).parse(req.body);return payments.verify({id,...body});});
 }
 app.post('/api/v1/orders/returns',{preHandler:[origin],config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async req=>{const {id,secret}=paymentAccessSchema.parse(req.body);await orders.customerReceipt(id,secret);return (await returns.orderRequests(id)).map(r=>returnRecordSchema.parse(r));});
 app.post('/api/v1/returns',{preHandler:[origin],config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async req=>{const {secret,...body}=returnRequestSchema.extend({secret:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.body);await orders.customerReceipt(body.orderId,secret);return returnRecordSchema.parse(await returns.create(body,null));});
}
