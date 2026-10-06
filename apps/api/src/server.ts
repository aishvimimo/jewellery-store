import { emailService } from './email.js';
import { customerService } from './customers.js';
import { returnService } from './returns.js';
import { connectDatabase } from './db.js';
import { catalogueRepository } from './catalogue.js';
import { adminRepository } from './admin-repository.js';
import { orderRepository } from './orders.js';
import { paymentService } from './payments.js';
import { razorpayGateway } from './razorpay.js';
import { mediaStore } from './media.js';
import { createApp } from './app.js';
const {db,pool,env}=connectDatabase();
const orders=orderRepository(db,{mode:env.ORDERS_MODE,pinPrefixes:env.pinPrefixes,onlineEnabled:env.RAZORPAY_MODE==='test',reservationMinutes:env.PAYMENT_RESERVATION_MINUTES});
const gateway=env.RAZORPAY_MODE==='test'?razorpayGateway(env.RAZORPAY_KEY_ID!,env.RAZORPAY_KEY_SECRET!,[env.RAZORPAY_WEBHOOK_SECRET!,...(env.RAZORPAY_PREVIOUS_WEBHOOK_SECRET?[env.RAZORPAY_PREVIOUS_WEBHOOK_SECRET]:[])]):undefined;
const payments=gateway?paymentService(db,orders,gateway):undefined;
const mail=emailService(db,{driver:env.EMAIL_DRIVER,siteUrl:env.EMAIL_SITE_URL,encryptionKey:env.EMAIL_ENCRYPTION_KEY||'1111111111111111111111111111111111111111111111111111111111111111',from:env.EMAIL_FROM,apiKey:env.RESEND_API_KEY,production:env.NODE_ENV==='production'});
const customers=customerService(db,mail,orders,env.CUSTOMER_SESSION_HOURS),returns=returnService(db,orders,gateway,env.RETURN_WINDOW_DAYS);
const app=await createApp(catalogueRepository(db),{origins:env.origins,logger:true,trustProxy:env.TRUST_PROXY==='true',orders,payments,mail,returns,customers:{service:customers,production:env.NODE_ENV==='production',sameSite:env.CUSTOMER_COOKIE_SAMESITE,sessionHours:env.CUSTOMER_SESSION_HOURS,emailMode:env.EMAIL_DRIVER},admin:{repo:adminRepository(db),production:env.NODE_ENV==='production',sameSite:env.ADMIN_COOKIE_SAMESITE,sessionHours:env.ADMIN_SESSION_HOURS,pagesDeployHookUrl:env.PAGES_DEPLOY_HOOK_URL,media:mediaStore({driver:env.MEDIA_DRIVER,localDir:env.MEDIA_LOCAL_DIR,publicUrl:env.MEDIA_PUBLIC_URL||`http://localhost:${env.PORT}/media`,production:env.NODE_ENV==='production',r2AccountId:env.R2_ACCOUNT_ID,r2AccessKeyId:env.R2_ACCESS_KEY_ID,r2SecretAccessKey:env.R2_SECRET_ACCESS_KEY,r2Bucket:env.R2_BUCKET})}});
let work:Promise<void>|null=null;
function runJobs(){if(work)return work;work=(async()=>{for(const job of [payments?.tick,returns.tick,mail.tick])if(job)try{await job();}catch{app.log.warn('Background commerce work will retry');}})().finally(()=>{work=null;});return work;}
const timer=setInterval(()=>{void runJobs();},60000);timer.unref();
app.addHook('onClose',async()=>{clearInterval(timer);if(work)await work;await pool.end();});
const shutdown=async()=>{await app.close();process.exit(0);};
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
try{await app.listen({port:env.PORT,host:env.HOST});void runJobs();}catch(error){app.log.error(error);await app.close();process.exit(1);}
