import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { registerCustomers,type CustomerOptions } from './customer-routes.js';
import type { ReturnService } from './returns.js';
import type { EmailService } from './email.js';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { registerPayments } from './payment-routes.js';
import type { PaymentService } from './payments.js';
import { registerOrders } from './order-routes.js';
import type { OrderRepository } from './orders.js';
import { registerAdmin, type AdminOptions } from './admin-routes.js';
import { z, ZodError } from 'zod';
import { listQuerySchema, quoteRequestSchema, promotions } from '@store/contracts';
import type { CatalogueRepository } from './catalogue.js';
import { checkoutQuote, CommerceError } from './quote.js';
export async function createApp(repo:CatalogueRepository,options:{origins?:string[],logger?:boolean,trustProxy?:boolean,rateLimit?:boolean,admin?:AdminOptions,orders?:OrderRepository,payments?:PaymentService,customers?:CustomerOptions,returns?:ReturnService,mail?:EmailService}={}){
  const app=Fastify({logger:options.logger?{redact:['req.headers.cookie','req.headers.authorization','req.headers["x-csrf-token"]','res.headers["set-cookie"]']}:false,bodyLimit:32768,trustProxy:options.trustProxy??false});
  await app.register(helmet);
  if(options.admin||options.customers)await app.register(cookie);
  await app.register(cors,{origin:options.origins??['http://localhost:4321'],credentials:true,methods:['GET','POST','PUT','OPTIONS'],allowedHeaders:['Content-Type','X-CSRF-Token']});
  if(options.rateLimit!==false)await app.register(rateLimit,{max:100,timeWindow:'1 minute'});
  app.setErrorHandler((error,request,reply)=>{
    reply.header('Cache-Control','no-store');
    if(error instanceof ZodError)return reply.code(400).send({error:{code:'VALIDATION_ERROR',message:'Invalid request',details:error.issues.map(i=>({path:i.path.join('.'),message:i.message}))}});
    if(error instanceof CommerceError)return reply.code(error.statusCode).send({error:{code:error.code,message:error.message,details:error.details}});
    if(error instanceof Error && 'statusCode' in error && typeof error.statusCode==='number' && error.statusCode<500)return reply.code(error.statusCode).send({error:{code:'BAD_REQUEST',message:error.message}});
    request.log.error({errorType:error instanceof Error?error.name:'UnknownError',databaseCode:(error as {cause?:{code?:string}})?.cause?.code},'Request failed');
    return reply.code(500).send({error:{code:'INTERNAL_ERROR',message:'Unable to complete the request'}});
  });
  app.setNotFoundHandler((_,reply)=>reply.code(404).send({error:{code:'NOT_FOUND',message:'Endpoint not found'}}));
  app.get('/health',async()=>({status:'ok'}));
  app.get('/ready',async(_,reply)=>{try{await repo.ready();return {status:'ready'};}catch{reply.code(503);return {status:'unavailable'};}});
  app.get('/api/v1/products',async(request,reply)=>{
    const result=await repo.list(listQuerySchema.parse(request.query));
    reply.header('Cache-Control','public, max-age=0, s-maxage=60');return result;
  });
  app.get('/api/v1/products/:slug',async(request,reply)=>{
    const {slug}=z.object({slug:z.string().min(1).max(160)}).parse(request.params);
    const product=await repo.product(slug);
    if(!product||!product.variants.length)throw new CommerceError(404,'NOT_FOUND','Product not found');
    reply.header('Cache-Control','public, max-age=0, s-maxage=60');return product;
  });
  app.get('/api/v1/categories',async()=> (await repo.facets()).categories);
  app.get('/api/v1/facets',async()=> repo.facets());
  app.get('/api/v1/promotions',async()=>promotions);
  app.post('/api/v1/checkout/quote',{config:{rateLimit:{max:30,timeWindow:'1 minute'}}},async(request,reply)=>{
    reply.header('Cache-Control','no-store');
    return checkoutQuote(repo,quoteRequestSchema.parse(request.body));
  });
  if(options.payments)await registerPayments(app,options.payments,options.origins??['http://localhost:4321']);
  if(options.orders)await registerOrders(app,options.orders,options.origins??['http://localhost:4321']);
  if(options.customers&&options.returns&&options.orders)await registerCustomers(app,options.customers,options.origins??['http://localhost:4321'],options.orders,options.returns,options.payments);
  if(options.admin)await registerAdmin(app,options.admin,options.origins??['http://localhost:4321'],options.orders,options.payments,options.returns,options.mail);
  return app;
}
