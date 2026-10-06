import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { and,desc,eq,isNull,sql } from 'drizzle-orm';
import type { z } from 'zod';
import { accountRegisterSchema,type CustomerUser } from '@store/contracts';
import * as s from './schema.js';
import { CommerceError } from './quote.js';
import { hashPassword,verifyPassword } from './password.js';
import type { CommerceDb,CommerceTx,EmailService } from './email.js';
import type { OrderRepository } from './orders.js';
export const tokenHash=(v:string)=>createHash('sha256').update(v).digest('hex');
export const customerCsrf=(v:string)=>tokenHash('customer-csrf:'+v);
const publicUser=(r:typeof s.customers.$inferSelect):CustomerUser=>({id:r.id,email:r.email,name:r.name,verified:!!r.verifiedAt});
let dummy:Promise<string>|undefined;
export function customerService(db:CommerceDb,mail:EmailService,orders:OrderRepository,sessionHours=24){
 async function issue(tx:CommerceTx,user:typeof s.customers.$inferSelect,purpose:'verify'|'reset'){
  const recent=(await tx.select().from(s.customerTokens).where(and(eq(s.customerTokens.customerId,user.id),eq(s.customerTokens.purpose,purpose))).orderBy(desc(s.customerTokens.createdAt)).limit(1))[0];if(recent&&Date.now()-recent.createdAt.getTime()<60000)return;
  const token=randomBytes(32).toString('hex'),expiresAt=new Date(Date.now()+(purpose==='reset'?30*60000:24*3600000));
  await tx.update(s.customerTokens).set({usedAt:new Date()}).where(and(eq(s.customerTokens.customerId,user.id),eq(s.customerTokens.purpose,purpose),isNull(s.customerTokens.usedAt)));
  await tx.insert(s.customerTokens).values({tokenHash:tokenHash(token),customerId:user.id,purpose,expiresAt});
  await mail.enqueue(tx,'account-token:'+tokenHash(token),user.email,purpose==='verify'?'Verify your email':'Reset your password',`Hello ${user.name},\n\n${purpose==='verify'?'Verify your email before linking your orders.':'Reset your password. This invalidates all existing account sessions.'}\n\n${mail.options.siteUrl}/account/#${purpose}=${token}\n\nThis link expires ${purpose==='reset'?'in 30 minutes':'in 24 hours'}. If you did not request this, ignore this email.`,expiresAt);
 }
 async function requireUser(tx:CommerceTx|CommerceDb,id:string){const user=(await tx.select().from(s.customers).where(eq(s.customers.id,id)))[0];if(!user)throw new CommerceError(401,'UNAUTHORIZED','Sign in to continue');return user;}
 async function claim(id:string){return db.transaction(async tx=>{const user=(await tx.select().from(s.customers).where(eq(s.customers.id,id)).for('update'))[0];if(!user?.verifiedAt)throw new CommerceError(403,'EMAIL_UNVERIFIED','Verify your email to link and view orders');await tx.update(s.orders).set({customerId:id}).where(and(isNull(s.orders.customerId),sql`${s.orders.customer}->>'email'=${user.email}`));return user;});}
 async function own(id:string,orderId:string){const user=await requireUser(db,id);if(!user.verifiedAt)throw new CommerceError(403,'EMAIL_UNVERIFIED','Verify your email to access orders');const row=(await db.select().from(s.orders).where(and(eq(s.orders.id,orderId),eq(s.orders.customerId,id))))[0];if(!row)throw new CommerceError(404,'NOT_FOUND','Order not found');return row;}
 return {claim,own,
  async register(input:z.infer<typeof accountRegisterSchema>){if(mail.options.driver==='disabled')throw new CommerceError(503,'EMAIL_DISABLED','Account registration needs email delivery enabled');const passwordHash=await hashPassword(input.password);await db.transaction(async tx=>{const rows=await tx.insert(s.customers).values({id:randomUUID(),email:input.email,name:input.name,passwordHash}).onConflictDoNothing({target:s.customers.email}).returning();if(rows[0])await issue(tx,rows[0],'verify');});return {message:'If this email is new, a verification email has been queued. You can now sign in; existing accounts should sign in or reset their password.'};},
  async login(email:string,password:string,oldToken?:string){const user=(await db.select().from(s.customers).where(eq(s.customers.email,email)))[0];dummy??=hashPassword('dummy-customer-password-never-used');const valid=await verifyPassword(password,user?.passwordHash??await dummy);
   return db.transaction(async tx=>{const locked=user?(await tx.select().from(s.customers).where(eq(s.customers.id,user.id)).for('update'))[0]:null;if(!locked||!valid||locked.passwordHash!==user!.passwordHash||(locked.lockedUntil&&locked.lockedUntil>new Date())){if(locked&&(!locked.lockedUntil||locked.lockedUntil<=new Date())){const failed=locked.failedLogins+1;await tx.update(s.customers).set({failedLogins:failed>=5?0:failed,lockedUntil:failed>=5?new Date(Date.now()+15*60000):null}).where(eq(s.customers.id,locked.id));}return null;}
    const token=randomBytes(32).toString('base64url');await tx.update(s.customers).set({failedLogins:0,lockedUntil:null}).where(eq(s.customers.id,locked.id));if(oldToken)await tx.delete(s.customerSessions).where(eq(s.customerSessions.tokenHash,tokenHash(oldToken)));await tx.insert(s.customerSessions).values({tokenHash:tokenHash(token),customerId:locked.id,expiresAt:new Date(Date.now()+sessionHours*3600000)});return {token,user:publicUser(locked),csrfToken:customerCsrf(token)};
   });
  },
  async session(token:string){const rows=await db.select({session:s.customerSessions,user:s.customers}).from(s.customerSessions).innerJoin(s.customers,eq(s.customers.id,s.customerSessions.customerId)).where(and(eq(s.customerSessions.tokenHash,tokenHash(token)),sql`${s.customerSessions.expiresAt}>now()`));return rows[0]?{user:publicUser(rows[0].user),csrfToken:customerCsrf(token)}:null;},
  async logout(token:string){await db.delete(s.customerSessions).where(eq(s.customerSessions.tokenHash,tokenHash(token)));},
  async resend(id:string){if(mail.options.driver==='disabled')throw new CommerceError(503,'EMAIL_DISABLED','Email delivery is disabled');await db.transaction(async tx=>{const user=(await tx.select().from(s.customers).where(eq(s.customers.id,id)).for('update'))[0];if(user&&!user.verifiedAt)await issue(tx,user,'verify');});return {message:'If verification is needed, an email has been queued. Wait a minute before requesting another.'};},
  async forgot(email:string){if(mail.options.driver==='disabled')throw new CommerceError(503,'EMAIL_DISABLED','Email delivery is disabled');await db.transaction(async tx=>{const user=(await tx.select().from(s.customers).where(eq(s.customers.email,email)).for('update'))[0];if(user)await issue(tx,user,'reset');});return {message:'If an account exists, a password-reset email has been queued.'};},
  async consume(token:string,purpose:'verify'|'reset',password?:string){const passwordHash=purpose==='reset'?await hashPassword(password!):null;const hash=tokenHash(token);const candidate=(await db.select().from(s.customerTokens).where(eq(s.customerTokens.tokenHash,hash)))[0];if(!candidate)throw new CommerceError(400,'TOKEN_INVALID','This link is invalid or expired');
   await db.transaction(async tx=>{await tx.select().from(s.customers).where(eq(s.customers.id,candidate.customerId)).for('update');const row=(await tx.select().from(s.customerTokens).where(eq(s.customerTokens.tokenHash,hash)).for('update'))[0];if(!row||row.purpose!==purpose||row.usedAt||row.expiresAt<=new Date())throw new CommerceError(400,'TOKEN_INVALID','This link is invalid or expired');await tx.update(s.customerTokens).set({usedAt:new Date()}).where(eq(s.customerTokens.tokenHash,hash));if(purpose==='verify')await tx.update(s.customers).set({verifiedAt:new Date()}).where(eq(s.customers.id,row.customerId));else{await tx.update(s.customers).set({passwordHash:passwordHash!,failedLogins:0,lockedUntil:null}).where(eq(s.customers.id,row.customerId));await tx.delete(s.customerSessions).where(eq(s.customerSessions.customerId,row.customerId));await tx.update(s.customerTokens).set({usedAt:new Date()}).where(and(eq(s.customerTokens.customerId,row.customerId),isNull(s.customerTokens.usedAt)));}});
   if(purpose==='verify')await claim(candidate.customerId);return {message:purpose==='verify'?'Email verified. Sign in or refresh your account to view linked orders.':'Password reset. Sign in with your new password.'};
  },
  async list(id:string,page:number){await claim(id);const filter=eq(s.orders.customerId,id),rows=await db.select({id:s.orders.id}).from(s.orders).where(filter).orderBy(desc(s.orders.createdAt),desc(s.orders.id)).limit(20).offset((page-1)*20);const total=(await db.select({total:sql<number>`count(*)::int`}).from(s.orders).where(filter))[0].total;return {items:await Promise.all(rows.map(r=>orders.receipt(r.id))),total,page,limit:20};},
  async detail(id:string,orderId:string){await own(id,orderId);return orders.customerAccountDetail(orderId);},
 };
}
export type CustomerService=ReturnType<typeof customerService>;
