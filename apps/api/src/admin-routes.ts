import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ReturnService } from './returns.js';
import type { EmailService } from './email.js';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { adminLoginSchema,adminListQuerySchema,adminProductInputSchema,adminCategoryInputSchema,type AdminUser,orderListQuerySchema,orderUpdateSchema,returnReviewSchema } from '@store/contracts';
import type { AdminRepository } from './admin-repository.js';
import type { MediaStore } from './media.js';
import { verifyPassword,hashPassword } from './password.js';
import type { PaymentService } from './payments.js';
import type { OrderRepository } from './orders.js';
import { CommerceError } from './quote.js';
export type AdminOptions={repo:AdminRepository,media:MediaStore,production:boolean,sameSite:'lax'|'none',sessionHours:number,pagesDeployHookUrl?:string};
declare module 'fastify'{interface FastifyRequest{adminUser:AdminUser|null;adminToken:string|null;}}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const csrf=(token:string)=>digest('csrf:'+token);
const equal=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
let dummyPassword:Promise<string>|undefined;
export async function registerAdmin(app:FastifyInstance,options:AdminOptions,origins:string[],orders?:OrderRepository,payments?:PaymentService,returns?:ReturnService,mail?:EmailService){
 await app.register(multipart,{limits:{files:1,fileSize:8*1024*1024,fields:0,parts:1}});
 app.decorateRequest('adminUser',null);app.decorateRequest('adminToken',null);
 const cookieName=options.production?'__Host-store_admin':'store_admin';
 const cookieOptions={httpOnly:true,secure:options.production,sameSite:options.sameSite,path:'/' as const};
 const clear=(reply:FastifyReply)=>reply.clearCookie(cookieName,cookieOptions);
 app.addHook('onRequest',async(req,reply)=>{if(req.url.startsWith('/api/v1/admin'))reply.header('Cache-Control','no-store');});
 async function origin(req:FastifyRequest){if(typeof req.headers.origin!=='string'||!origins.includes(req.headers.origin))throw new CommerceError(403,'ORIGIN_DENIED','Use the configured admin website to make changes');}
 async function authenticate(req:FastifyRequest){
  const token=req.cookies[cookieName];
  if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new CommerceError(401,'UNAUTHORIZED','Please sign in to continue');
  const session=await options.repo.session(digest(token));
  if(!session)throw new CommerceError(401,'UNAUTHORIZED','Your session expired. Please sign in again.');
  req.adminUser={id:session.user.id,email:session.user.email,name:session.user.name,role:session.user.role as AdminUser['role']};req.adminToken=token;
 }
 async function writer(req:FastifyRequest){if(req.adminUser?.role!=='admin')throw new CommerceError(403,'FORBIDDEN','Your account does not have permission to make changes');}
 async function verifyCsrf(req:FastifyRequest){const header=req.headers['x-csrf-token'];if(typeof header!=='string'||!/^[a-f0-9]{64}$/.test(header)||!req.adminToken||!equal(header,csrf(req.adminToken)))throw new CommerceError(403,'CSRF_DENIED','Your security token is invalid. Reload the admin page and try again.');}
 const read={preHandler:[authenticate]};const write={preHandler:[origin,authenticate,writer,verifyCsrf]};
 app.get('/api/v1/admin/session',async(req,reply)=>{try{await authenticate(req);return {user:req.adminUser,csrfToken:csrf(req.adminToken!)};}catch(error){if(error instanceof CommerceError&&error.statusCode===401){clear(reply);return {user:null,csrfToken:null};}throw error;}});
 app.post('/api/v1/admin/login',{preHandler:[origin],config:{rateLimit:{max:8,timeWindow:'15 minutes'}}},async(req,reply)=>{
  const input=adminLoginSchema.parse(req.body),user=await options.repo.user(input.email);
  dummyPassword??=hashPassword('dummy-password-never-an-account');
  const valid=await verifyPassword(input.password,user?.passwordHash??await dummyPassword);
  if(!user||!valid||!user.active||(user.lockedUntil&&user.lockedUntil>new Date())){
   if(user&&!(user.lockedUntil&&user.lockedUntil>new Date()))await options.repo.failedLogin(user.id);
   throw new CommerceError(401,'LOGIN_FAILED','Unable to sign in. Check your details or try again later.');
  }
  const token=randomBytes(32).toString('base64url');const expiresAt=new Date(Date.now()+options.sessionHours*3600000);
  await options.repo.startSession(user.id,digest(token),expiresAt);
  // Rotate any previous browser session to avoid accumulating login sessions.
  if(req.cookies[cookieName])await options.repo.endSession(digest(req.cookies[cookieName]));
  reply.setCookie(cookieName,token,{...cookieOptions,maxAge:options.sessionHours*3600,expires:expiresAt});
  return {user:{id:user.id,email:user.email,name:user.name,role:user.role},csrfToken:csrf(token)};
 });
 app.post('/api/v1/admin/logout',{preHandler:[origin,authenticate,verifyCsrf]},async(req,reply)=>{await options.repo.endSession(digest(req.adminToken!));clear(reply);return {ok:true};});
 if(payments){app.post('/api/v1/admin/orders/:id/reconcile',write,async req=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params);await payments.reconcile(id);await options.repo.record(req.adminUser!.id,'payment.reconciled',id,{});return orders!.detail(id);});}
 if(orders){
  app.get('/api/v1/admin/orders',read,async req=>orders.list(orderListQuerySchema.parse(req.query)));
  app.get('/api/v1/admin/orders/:id',read,async req=>orders.detail(z.object({id:z.string().uuid()}).parse(req.params).id));
  app.put('/api/v1/admin/orders/:id',write,async req=>orders.update(z.object({id:z.string().uuid()}).parse(req.params).id,orderUpdateSchema.parse(req.body),req.adminUser!.id));
 }
 if(returns){app.get('/api/v1/admin/returns',read,async()=>returns.list());app.post('/api/v1/admin/returns/:id/review',write,async req=>{const id=z.object({id:z.string().uuid()}).parse(req.params).id;const body=returnReviewSchema.parse(req.body);const result=await returns.review(id,body,req.adminUser!.id);await options.repo.record(req.adminUser!.id,'return.'+body.action,id,{});return result;});}
 if(mail){app.get('/api/v1/admin/emails',read,async()=>mail.list());app.get('/api/v1/admin/emails/:id/preview',{preHandler:[authenticate,writer]},async req=>mail.preview(z.object({id:z.string().uuid()}).parse(req.params).id));app.post('/api/v1/admin/emails/process',write,async()=>{await mail.tick();return {message:'Email queue processed. Local mode previews messages; provider mode submits queued emails.'};});}
 app.get('/api/v1/admin/summary',read,async()=>options.repo.summary());
 app.get('/api/v1/admin/products',read,async req=>options.repo.list(adminListQuerySchema.parse(req.query)));
 app.get('/api/v1/admin/products/:id',read,async req=>options.repo.product(z.object({id:z.string().max(80)}).parse(req.params).id));
 app.post('/api/v1/admin/products',{...write,bodyLimit:131072},async(req,reply)=>{const result=await options.repo.save(adminProductInputSchema.parse(req.body),req.adminUser!.id);reply.code(201);return result;});
 app.put('/api/v1/admin/products/:id',{...write,bodyLimit:131072},async req=>{
  const {id}=z.object({id:z.string().max(80)}).parse(req.params);
  const {version,product}=z.object({version:z.number().int().min(1),product:adminProductInputSchema}).strict().parse(req.body);
  return options.repo.save(product,req.adminUser!.id,id,version);
 });
 app.get('/api/v1/admin/categories',read,async()=>options.repo.categories());
 app.post('/api/v1/admin/categories',write,async(req,reply)=>{const result=await options.repo.createCategory(adminCategoryInputSchema.parse(req.body),req.adminUser!.id);reply.code(201);return result;});
 app.get('/api/v1/admin/audit',read,async()=>options.repo.audit());
 app.post('/api/v1/admin/images',{...write,bodyLimit:9*1024*1024,config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async(req,reply)=>{
  let buffer:Buffer|undefined,mimetype='';
  for await(const part of req.parts()){if(part.type!=='file'||buffer)throw new CommerceError(400,'INVALID_IMAGE','Choose exactly one image');buffer=await part.toBuffer();mimetype=part.mimetype;}
  if(!buffer)throw new CommerceError(400,'INVALID_IMAGE','Choose one image to upload');
  const image=await options.media.upload(buffer,mimetype);
  await options.repo.record(req.adminUser!.id,'image.uploaded',image.url,{format:image.format});reply.code(201);return image;
 });
 app.get('/media/:name',async(req,reply)=>{const {name}=z.object({name:z.string().max(80)}).parse(req.params);const buffer=await options.media.localFile(name);reply.type('image/webp').header('Cross-Origin-Resource-Policy','cross-origin').header('Cache-Control','public,max-age=31536000,immutable');return buffer;});
 app.post('/api/v1/admin/publish',write,async req=>{
  if(!options.pagesDeployHookUrl)throw new CommerceError(503,'PUBLISH_NOT_CONFIGURED','Configure a Cloudflare Pages deploy hook or rebuild from your hosting dashboard');
  try{const response=await fetch(options.pagesDeployHookUrl,{method:'POST',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Deploy hook failed');}
  catch{throw new CommerceError(503,'PUBLISH_FAILED','Could not request a rebuild. Try again from your hosting dashboard.');}
  await options.repo.record(req.adminUser!.id,'pages.rebuild.requested','storefront',{});return {message:'Rebuild requested. New product URLs appear after the Pages deployment completes.'};
 });
}
