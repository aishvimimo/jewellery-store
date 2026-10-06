import { before,after,beforeEach,test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { orderReceiptSchema,adminOrderSchema } from '@store/contracts';
import { migrateTestDb } from '../../../scripts/migrate-test-db.js';
import { createApp } from '../src/app.js';
import { catalogueRepository } from '../src/catalogue.js';
import { adminRepository } from '../src/admin-repository.js';
import { orderRepository } from '../src/orders.js';
import { mediaStore } from '../src/media.js';
import { hashPassword } from '../src/password.js';
import { seedData } from '../src/seed-data.js';
import * as s from '../src/schema.js';
const pg=new PGlite(),db=drizzle(pg,{schema:s}) as unknown as NodePgDatabase<typeof s>;
const origin='http://localhost:4321';let app:Awaited<ReturnType<typeof createApp>>,auth:{cookie:string,csrf:string};
const settings={mode:'test' as 'test'|'live'|'disabled',pinPrefixes:['560']};
const input=()=>({expectedMode:settings.mode==='live'?'live':'test',checkoutKey:randomUUID(),receiptSecret:randomBytes(32).toString('hex'),items:[{variantId:'variant-1',quantity:1}],coupon:'',giftWrap:false,delivery:'standard',paymentMethod:'cod',customer:{name:'Test Customer',email:'customer@example.test',phone:'9876543210'},address:{line1:'123 Test Street',line2:'',city:'Bengaluru',state:'Karnataka',postalCode:'560001',country:'IN'},expectedTotalPaise:87800});
const call=(method:'GET'|'POST'|'PUT',url:string,body?:unknown,credential=auth)=>app.inject({method,url,payload:body?JSON.stringify(body):undefined,headers:{origin,...(body?{'content-type':'application/json'}:{}),...(credential?{cookie:credential.cookie,'x-csrf-token':credential.csrf}:{})}});
const place=(body:unknown)=>call('POST','/api/v1/orders',body);
const stock=async()=> (await db.select().from(s.inventory).where(eq(s.inventory.variantId,'variant-1')))[0].available;
before(async()=>{
 await migrateTestDb(pg);await seedData(db,JSON.parse(await readFile(new URL('../../../database/seeds.json',import.meta.url),'utf8')));
 const passwordHash=await hashPassword('Test-password-12345');await db.insert(s.adminUsers).values([{id:'owner',email:'owner@example.test',name:'Owner',passwordHash},{id:'viewer',email:'viewer@example.test',name:'Viewer',role:'viewer',passwordHash}]);
 app=await createApp(catalogueRepository(db),{rateLimit:false,orders:orderRepository(db,settings),admin:{repo:adminRepository(db),production:false,sameSite:'lax',sessionHours:8,media:mediaStore({driver:'local',localDir:'.data/unused-orders',publicUrl:'http://localhost:3001/media',production:false})}});
 const login=await call('POST','/api/v1/admin/login',{email:'owner@example.test',password:'Test-password-12345'},undefined);assert.equal(login.statusCode,200);auth={cookie:String(login.headers['set-cookie']).split(';')[0],csrf:login.json().csrfToken};
});
beforeEach(async()=>{await pg.exec("TRUNCATE orders CASCADE; UPDATE inventory SET available=12; UPDATE products SET active=true,version=1; UPDATE product_variants SET active=true; UPDATE product_variants SET price_paise=79900 WHERE id='variant-1';");settings.mode='test';});
after(async()=>{await app.close();await pg.close();});
test('COD order creates server snapshots, decrements stock and invalidates stale admin versions',async()=>{
 const r=await place(input());assert.equal(r.statusCode,201,r.body);const order=orderReceiptSchema.parse(r.json());assert.equal(order.mode,'test');assert.equal(order.paymentStatus,'unpaid');assert.equal(order.totals.totalPaise,87800);assert.equal(order.lines[0].sku,'SAMPLE-001');assert.equal(await stock(),11);
 assert.equal(r.headers['cache-control'],'no-store');assert.equal((r.json() as any).customer,undefined);assert.equal((r.json() as any).receiptSecretHash,undefined);
 assert.equal((await db.select().from(s.products).where(eq(s.products.id,'product-1')))[0].version,2);
 const movements=await db.select().from(s.inventoryMovements);assert.equal(movements.length,1);assert.equal(movements[0].userId,null);assert.equal(movements[0].orderId,order.id);
});
test('retries replay exactly one order; reused keys with different body or secret are denied',async()=>{
 const body=input(),a=await place(body),b=await place(body);assert.equal(a.statusCode,201);assert.equal(b.statusCode,200,b.body);assert.equal(a.json().id,b.json().id);assert.equal(await stock(),11);assert.equal((await db.select().from(s.orders)).length,1);
 assert.equal((await place({...body,customer:{...body.customer,name:'Another Customer'}})).statusCode,409);
 assert.equal((await place({...body,receiptSecret:'a'.repeat(64)})).statusCode,409);
});
test('tampered totals, prepaid methods, duplicate items and malformed addresses create no order',async()=>{
 assert.equal((await place({...input(),expectedTotalPaise:1})).json().error.code,'PRICE_CHANGED');
 assert.equal((await place({...input(),paymentMethod:'prepaid'})).statusCode,400);
 assert.equal((await place({...input(),prepaid:true})).statusCode,400);
 const body=input();assert.equal((await place({...body,items:[...body.items,...body.items]})).statusCode,400);
 assert.equal((await place({...input(),address:{...input().address,postalCode:'000000'}})).statusCode,400);
 assert.equal((await db.select().from(s.orders)).length,0);assert.equal(await stock(),12);
});
test('overselling and unavailable variants roll back the entire order',async()=>{
 await db.update(s.inventory).set({available:1}).where(eq(s.inventory.variantId,'variant-1'));
 const a=await place(input()),b=await place(input());assert.equal(a.statusCode,201);assert.equal(b.statusCode,409);assert.equal(await stock(),0);assert.equal((await db.select().from(s.orders)).length,1);
 const body=input();body.items.push({variantId:'missing',quantity:1});assert.equal((await place(body)).statusCode,409);assert.equal((await db.select().from(s.orderLines)).length,1);
});
test('coupons, gift wrapping and delivery totals are recalculated; snapshots survive catalogue edits',async()=>{
 const body={...input(),items:[{variantId:'variant-1',quantity:2}],coupon:'FESTIVE225',giftWrap:true,delivery:'express',expectedTotalPaise:152100};
 const r=await place(body);assert.equal(r.statusCode,201,r.body);assert.equal(r.json().totals.prepaidDiscountPaise,0);assert.equal(r.json().totals.couponDiscountPaise,22500);
 await db.update(s.products).set({name:'Changed live title'}).where(eq(s.products.id,'product-1'));await db.update(s.variants).set({pricePaise:90000}).where(eq(s.variants.id,'variant-1'));
 const detail=await call('GET','/api/v1/admin/orders/'+r.json().id);assert.equal(detail.json().lines[0].name,'Tulip Bloom Box');assert.equal(detail.json().lines[0].unitPricePaise,79900);assert.equal(detail.json().totals.totalPaise,152100);
 await db.update(s.products).set({name:'Tulip Bloom Box'}).where(eq(s.products.id,'product-1'));
});
test('receipts require a private secret and never expose address, session hashes or checkout keys',async()=>{
 const body=input(),r=await place(body),id=r.json().id;
 assert.equal((await call('GET','/api/v1/orders/'+id)).statusCode,404);
 assert.equal((await call('POST','/api/v1/orders/receipt',{id,secret:'0'.repeat(64)})).statusCode,404);
 const receipt=await call('POST','/api/v1/orders/receipt',{checkoutKey:body.checkoutKey,secret:body.receiptSecret});assert.equal(receipt.statusCode,200,receipt.body);assert.equal(receipt.json().id,id);assert.equal(receipt.json().address,undefined);assert.equal(receipt.json().checkoutKey,undefined);
});
test('order transitions, COD collection and tracking use versions and reject illegal transitions',async()=>{
 const id=(await place(input())).json().id;
 assert.equal((await call('PUT','/api/v1/admin/orders/'+id,{version:1,status:'shipped'})).statusCode,409);
 assert.equal((await call('PUT','/api/v1/admin/orders/'+id,{version:1,status:'confirmed',paymentCollected:true})).statusCode,409);
 let r=await call('PUT','/api/v1/admin/orders/'+id,{version:1,status:'confirmed',note:'Checked'});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().version,2);
 assert.equal((await call('PUT','/api/v1/admin/orders/'+id,{version:1,status:'cancelled'})).json().error.code,'EDIT_CONFLICT');
 r=await call('PUT','/api/v1/admin/orders/'+id,{version:2,status:'shipped',tracking:{carrier:'Manual courier',number:'TRACK-001'}});assert.equal(r.statusCode,200,r.body);
 assert.equal((await call('PUT','/api/v1/admin/orders/'+id,{version:3,status:'cancelled'})).statusCode,409);
 r=await call('PUT','/api/v1/admin/orders/'+id,{version:3,status:'delivered',paymentCollected:true});const order=adminOrderSchema.parse(r.json());assert.equal(order.paymentStatus,'collected');assert.equal(order.tracking?.number,'TRACK-001');assert.equal(order.events.length,4);
 r=await call('PUT','/api/v1/admin/orders/'+id,{version:4,status:'delivered',paymentCollected:false});assert.equal(r.json().paymentStatus,'collected');assert.equal(await stock(),11);
});
test('cancellation restores inventory once, preserves receipts and logs the staff action',async()=>{
 const id=(await place(input())).json().id;
 const r=await call('PUT','/api/v1/admin/orders/'+id,{version:1,status:'cancelled',note:'Test complete'});assert.equal(r.statusCode,200,r.body);assert.equal(await stock(),12);
 assert.equal((await call('PUT','/api/v1/admin/orders/'+id,{version:2,status:'cancelled'})).statusCode,409);assert.equal(await stock(),12);
 const logs=await db.select().from(s.adminAudit).where(eq(s.adminAudit.entityId,id));assert.equal(logs.length,1);assert.equal(logs[0].action,'order.updated');assert.equal((await db.select().from(s.inventoryMovements)).length,2);
});
test('order administration requires sessions, writer role and valid CSRF',async()=>{
 const id=(await place(input())).json().id;
 assert.equal((await app.inject('/api/v1/admin/orders')).statusCode,401);
 assert.equal((await call('PUT','/api/v1/admin/orders/'+id,{version:1,status:'confirmed'},{...auth,csrf:''})).statusCode,403);
 const login=await call('POST','/api/v1/admin/login',{email:'viewer@example.test',password:'Test-password-12345'},{cookie:'',csrf:''});const viewer={cookie:String(login.headers['set-cookie']).split(';')[0],csrf:login.json().csrfToken};
 assert.equal((await call('GET','/api/v1/admin/orders/'+id,undefined,viewer)).statusCode,200);
 assert.equal((await call('PUT','/api/v1/admin/orders/'+id,{version:1,status:'confirmed'},viewer)).statusCode,403);
});
test('configured origin, live coverage and disabled checkout are enforced by the API',async()=>{
 assert.equal((await app.inject({method:'POST',url:'/api/v1/orders',payload:input(),headers:{origin:'https://other.test'}})).statusCode,403);
 settings.mode='live';assert.equal((await place({...input(),address:{...input().address,postalCode:'110001'}})).statusCode,422);
 assert.equal((await place(input())).json().mode,'live');settings.mode='disabled';assert.equal((await place(input())).statusCode,503);
 assert.equal((await call('GET','/api/v1/checkout/config')).json().paymentMethods.length,0);
});
test('order search, status and mode filtering are paginated without interpreting SQL wildcards',async()=>{
 await place(input());const second=await place(input());await call('PUT','/api/v1/admin/orders/'+second.json().id,{version:1,status:'confirmed'});
 assert.equal((await call('GET','/api/v1/admin/orders?status=pending&mode=test')).json().total,1);
 assert.equal((await call('GET','/api/v1/admin/orders?q=%25')).json().total,0);
 assert.equal((await call('GET','/api/v1/admin/orders?limit=1&page=2')).json().items.length,1);
 assert.equal((await call('GET','/api/v1/admin/orders?status=invalid')).statusCode,400);
});
test('an open catalogue editor cannot overwrite inventory consumed by a new order',async()=>{
 const p=(await call('GET','/api/v1/admin/products/product-1')).json();const product={slug:p.slug,name:p.name,description:p.description,active:p.active,featuredRank:p.featuredRank,categories:p.categories,images:p.images,variants:p.variants};
 await place(input());const r=await call('PUT','/api/v1/admin/products/product-1',{version:p.version,product});assert.equal(r.statusCode,409,r.body);assert.equal(r.json().error.code,'EDIT_CONFLICT');assert.equal(await stock(),11);
});
test('migration 003 preserves existing catalogue, admin credentials and stock history',async()=>{
 const previous=new PGlite();try{
  for(const file of ['001_catalogue.sql','002_admin.sql'])await previous.exec(await readFile(new URL('../../../database/migrations/'+file,import.meta.url),'utf8'));
  const oldDb=drizzle(previous,{schema:s}) as unknown as NodePgDatabase<typeof s>;
  await seedData(oldDb,JSON.parse(await readFile(new URL('../../../database/seeds.json',import.meta.url),'utf8')));
  await previous.query("INSERT INTO admin_users(id,email,name,password_hash) VALUES ('existing','existing@example.test','Existing','original-hash')");
  await previous.query("UPDATE inventory SET available=7 WHERE variant_id='variant-1'");await previous.query("UPDATE product_variants SET price_paise=12345 WHERE id='variant-1'");
  await previous.query("INSERT INTO inventory_movements(id,variant_id,user_id,before_quantity,after_quantity,reason) VALUES ('old-move','variant-1','existing',12,7,'Existing history')");
  await previous.exec(await readFile(new URL('../../../database/migrations/003_orders.sql',import.meta.url),'utf8'));
  assert.equal((await previous.query<{available:number}>("SELECT available FROM inventory WHERE variant_id='variant-1'")).rows[0].available,7);
  assert.equal((await previous.query<{price_paise:number}>("SELECT price_paise FROM product_variants WHERE id='variant-1'")).rows[0].price_paise,12345);
  assert.equal((await previous.query<{password_hash:string}>("SELECT password_hash FROM admin_users WHERE id='existing'")).rows[0].password_hash,'original-hash');
  const move=(await previous.query<{user_id:string,order_id:string|null}>("SELECT user_id,order_id FROM inventory_movements WHERE id='old-move'")).rows[0];assert.equal(move.user_id,'existing');assert.equal(move.order_id,null);
 }finally{await previous.close();}
});
test('order submission rate limits are enforced even for idempotent retries',async()=>{
 const limited=await createApp(catalogueRepository(db),{rateLimit:true,orders:orderRepository(db,settings)});const body=input();try{for(let i=0;i<10;i++){const r=await limited.inject({method:'POST',url:'/api/v1/orders',headers:{origin},payload:body});assert.equal(r.statusCode,i===0?201:200,r.body);}assert.equal((await limited.inject({method:'POST',url:'/api/v1/orders',headers:{origin},payload:body})).statusCode,429);assert.equal(await stock(),11);}finally{await limited.close();}
});

test('private customer order detail exposes tracking and status history but no staff notes or personal data',async()=>{
 const body=input(),placed=await place(body),id=placed.json().id,url='/api/v1/orders/detail',proof={id,secret:body.receiptSecret};
 assert.equal((await call('POST',url,{id,secret:'0'.repeat(64)})).statusCode,404);
 assert.equal((await call('POST',url,{id})).statusCode,400);
 assert.equal((await app.inject({method:'POST',url,payload:proof,headers:{origin:'https://other.example'}})).statusCode,403);
 await call('PUT','/api/v1/admin/orders/'+id,{version:1,status:'confirmed',note:'Private internal staff note'});
 await call('PUT','/api/v1/admin/orders/'+id,{version:2,status:'shipped',tracking:{carrier:'Test courier',number:'TRACK-123'}});
 const r=await call('POST',url,proof);assert.equal(r.statusCode,200,r.body);assert.equal(r.headers['cache-control'],'no-store');const data=r.json();assert.equal(data.status,'shipped');assert.deepEqual(data.tracking,{carrier:'Test courier',number:'TRACK-123'});assert.equal(data.events.length,3);
 for(const key of ['customer','address','checkoutKey','receiptSecretHash','payment','version'])assert.equal(data[key],undefined,key);
 for(const e of data.events){assert.equal(e.note,undefined);assert.equal(e.userName,undefined);assert.equal(e.userId,undefined);}
 assert.ok(!r.body.includes(body.customer.email));assert.ok(!r.body.includes('Private internal staff note'));assert.ok(!r.body.includes(body.receiptSecret));
});
