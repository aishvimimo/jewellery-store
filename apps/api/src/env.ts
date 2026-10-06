import dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();
const schema=z.object({
  NODE_ENV:z.enum(['development','test','production']).default('development'),
  PORT:z.coerce.number().int().min(1).max(65535).default(3001), HOST:z.string().default('0.0.0.0'),
  DATABASE_URL:z.string().url(), DATABASE_SSL:z.enum(['disable','require']).default('disable'),
  DB_POOL_MAX:z.coerce.number().int().min(1).max(20).default(5),
  CUSTOMER_SESSION_HOURS:z.coerce.number().int().min(1).max(168).default(24),CUSTOMER_COOKIE_SAMESITE:z.enum(['lax','none']).default('lax'),
  EMAIL_DRIVER:z.enum(['local','resend','disabled']).default('local'),EMAIL_SITE_URL:z.string().url().default('http://localhost:4321'),EMAIL_FROM:z.string().email().default('store@example.test'),RESEND_API_KEY:z.string().optional(),EMAIL_ENCRYPTION_KEY:z.string().regex(/^[a-f0-9]{64}$/).optional(),RETURN_WINDOW_DAYS:z.coerce.number().int().min(1).max(90).default(14),
  ADMIN_SESSION_HOURS:z.coerce.number().int().min(1).max(24).default(8),
  ADMIN_COOKIE_SAMESITE:z.enum(['lax','none']).default('lax'),
  MEDIA_DRIVER:z.enum(['local','r2']).default('local'),MEDIA_LOCAL_DIR:z.string().default('.data/media'),
  MEDIA_PUBLIC_URL:z.string().url().optional(),R2_ACCOUNT_ID:z.string().regex(/^[a-f0-9]{32}$/).optional(),
  R2_ACCESS_KEY_ID:z.string().optional(),R2_SECRET_ACCESS_KEY:z.string().optional(),R2_BUCKET:z.string().optional(),
  PAGES_DEPLOY_HOOK_URL:z.string().url().refine(v=>v.startsWith('https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/'),'Use a Cloudflare Pages deploy hook URL').optional(),
  RAZORPAY_MODE:z.enum(['disabled','test']).default('disabled'),RAZORPAY_KEY_ID:z.string().optional(),RAZORPAY_KEY_SECRET:z.string().optional(),RAZORPAY_WEBHOOK_SECRET:z.string().optional(),RAZORPAY_PREVIOUS_WEBHOOK_SECRET:z.string().optional(),PAYMENT_RESERVATION_MINUTES:z.coerce.number().int().min(5).max(120).default(30),
  ORDERS_MODE:z.enum(['test','live','disabled']).default('test'),SHIPPING_PIN_PREFIXES:z.string().default(''),
  CORS_ORIGINS:z.string().default('http://localhost:4321'), TRUST_PROXY:z.enum(['true','false']).default('false'),
});
export function readEnv(){
  const result=schema.safeParse(process.env);
  if(!result.success) throw new Error('Invalid environment: '+result.error.issues.map(i=>i.path.join('.')+': '+i.message).join('; '));
  const env=result.data;
  const origins=env.CORS_ORIGINS.split(',').map(s=>s.trim()).filter(Boolean);
  for(const origin of origins) {
    const url=new URL(origin);
    if(url.origin!==origin || (env.NODE_ENV==='production' && url.protocol!=='https:')) throw new Error('CORS_ORIGINS must contain exact origins; production requires HTTPS');
  }
  if(env.CUSTOMER_COOKIE_SAMESITE==='none'&&env.NODE_ENV!=='production')throw new Error('SameSite=None requires production HTTPS');
  const emailUrl=new URL(env.EMAIL_SITE_URL);if(emailUrl.origin!==env.EMAIL_SITE_URL||!origins.includes(emailUrl.origin))throw new Error('EMAIL_SITE_URL must be an exact allowed storefront origin');
  if(env.NODE_ENV==='production'&&(env.EMAIL_DRIVER==='local'||!env.EMAIL_ENCRYPTION_KEY||emailUrl.protocol!=='https:'))throw new Error('Production requires a private EMAIL_ENCRYPTION_KEY, HTTPS EMAIL_SITE_URL and EMAIL_DRIVER=resend or disabled');
  if(env.EMAIL_DRIVER==='resend'&&(!env.RESEND_API_KEY||env.EMAIL_FROM==='store@example.test'))throw new Error('Set RESEND_API_KEY and your verified EMAIL_FROM sender');
  if(env.ADMIN_COOKIE_SAMESITE==='none'&&env.NODE_ENV!=='production')throw new Error('SameSite=None requires production HTTPS');
  if(env.MEDIA_DRIVER==='r2'&&!env.MEDIA_PUBLIC_URL)throw new Error('MEDIA_PUBLIC_URL is required for R2');
  if(env.NODE_ENV==='production'&&env.MEDIA_PUBLIC_URL&&!env.MEDIA_PUBLIC_URL.startsWith('https://'))throw new Error('Production media URLs require HTTPS');
  const pinPrefixes=env.SHIPPING_PIN_PREFIXES.split(',').map(v=>v.trim()).filter(Boolean);
  if(pinPrefixes.some(p=>!/^([1-9][0-9]{0,5})$/.test(p)))throw new Error('SHIPPING_PIN_PREFIXES must be comma-separated PIN prefixes or six-digit PIN codes');
  if(env.ORDERS_MODE==='live'&&!pinPrefixes.length)throw new Error('Live orders require SHIPPING_PIN_PREFIXES for your verified delivery coverage');
  if(env.RAZORPAY_MODE==='test'){
   if(env.ORDERS_MODE!=='test')throw new Error('Online payments currently support test order mode only');
   if(!/^rzp_test_[A-Za-z0-9]+$/.test(env.RAZORPAY_KEY_ID||'')||!env.RAZORPAY_KEY_SECRET||!env.RAZORPAY_WEBHOOK_SECRET||env.RAZORPAY_WEBHOOK_SECRET.length<16)throw new Error('Set test Razorpay keys and a webhook secret of at least 16 characters on the API');
  }
  return {...env,origins,pinPrefixes};
}
