import { before,after,test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,mkdir,mkdtemp,rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { migrateTestDb } from '../../../scripts/migrate-test-db.js';
import { createApp } from '../src/app.js';
import { catalogueRepository } from '../src/catalogue.js';
import { adminRepository } from '../src/admin-repository.js';
import { mediaStore } from '../src/media.js';
import { hashPassword,verifyPassword } from '../src/password.js';
import { seedData } from '../src/seed-data.js';
import * as schema from '../src/schema.js';
const test=(name:string,fn:()=>Promise<void>)=>nodeTest(name,{timeout:15000},fn);
const pg=new PGlite(),db=drizzle(pg,{schema}) as unknown as NodePgDatabase<typeof schema>;
const origin='http://localhost:4321',password='Test-password-12345';let app:Awaited<ReturnType<typeof createApp>>,mediaDir:string;
type Auth={cookie:string,csrf:string};
const input=(p:any)=>structuredClone({name:p.name,slug:p.slug,description:p.description,active:p.active,featuredRank:p.featuredRank,categories:p.categories,images:p.images,variants:p.variants});
const createInput=()=>({name:'New Gold Ring',slug:'new-gold-ring',description:'A verified product description',active:false,featuredRank:15,categories:['rings'],images:['https://images.example.test/ring.webp'],variants:[{sku:'NEW-RING',label:'Size 7',pricePaise:55000,compareAtPaise:70000,colour:'Gold',material:'Alloy',gender:'For Her',stock:6}]});
const request=(method:'GET'|'POST'|'PUT',url:string,body?:unknown,auth?:Auth)=>app.inject({method,url,payload:body===undefined?undefined:JSON.stringify(body),headers:{origin,...(body!==undefined?{'content-type':'application/json'}:{}),...(auth?{cookie:auth.cookie,'x-csrf-token':auth.csrf}:{})}});
async function login(email='admin@example.test'):Promise<Auth>{const r=await request('POST','/api/v1/admin/login',{email,password});assert.equal(r.statusCode,200,r.body);return {cookie:String(r.headers['set-cookie']).split(';')[0],csrf:r.json().csrfToken};}
before(async()=>{
 await migrateTestDb(pg);await seedData(db,JSON.parse(await readFile(new URL('../../../database/seeds.json',import.meta.url),'utf8')));
 const hash=await hashPassword(password);await db.insert(schema.adminUsers).values([{id:'admin-1',email:'admin@example.test',name:'Owner',passwordHash:hash,role:'admin'},{id:'viewer-1',email:'viewer@example.test',name:'Viewer',passwordHash:hash,role:'viewer'}]);
 await mkdir(resolve(process.cwd(),'.data'),{recursive:true});mediaDir=await mkdtemp(resolve(process.cwd(),'.data/test-admin-'));
 app=await createApp(catalogueRepository(db),{rateLimit:false,origins:[origin],admin:{repo:adminRepository(db),media:mediaStore({driver:'local',localDir:mediaDir,publicUrl:'http://localhost:3001/media',production:false}),production:false,sameSite:'lax',sessionHours:8}});
});
after(async()=>{await app.close();await pg.close();await rm(mediaDir,{recursive:true,force:true});});
test('passwords are salted, verifiable and never stored in plaintext',async()=>{const a=await hashPassword(password),b=await hashPassword(password);assert.notEqual(a,b);assert.ok(!a.includes(password));assert.equal(await verifyPassword(password,a),true);assert.equal(await verifyPassword('wrong',a),false);assert.equal(await verifyPassword(password,'malformed'),false);});
test('admin reads/writes reject anonymous users and login checks exact origin',async()=>{
 assert.equal((await request('GET','/api/v1/admin/products')).statusCode,401);
 assert.equal((await request('POST','/api/v1/admin/products',createInput())).statusCode,401);
 assert.equal((await app.inject({method:'POST',url:'/api/v1/admin/login',headers:{origin:'https://evil.example'},payload:{email:'admin@example.test',password}})).statusCode,403);
 const r=await request('POST','/api/v1/admin/login',{email:'admin@example.test',password:'wrong'});assert.equal(r.statusCode,401);
});
test('login issues HTTP-only cookies, opaque hashed sessions and CSRF tokens',async()=>{
 const r=await request('POST','/api/v1/admin/login',{email:'admin@example.test',password});assert.equal(r.statusCode,200);const cookie=String(r.headers['set-cookie']);assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('SameSite=Lax'));assert.equal(r.headers['cache-control'],'no-store');
 assert.equal(r.json().csrfToken.length,64);assert.equal(r.json().user.passwordHash,undefined);
 const sessions=await db.select().from(schema.adminSessions);assert.ok(sessions.every(s=>s.tokenHash.length===64&&!cookie.includes(s.tokenHash)));
 const session=await request('GET','/api/v1/admin/session',undefined,{cookie:cookie.split(';')[0],csrf:r.json().csrfToken});assert.equal(session.json().user.role,'admin');
});
test('write requests require CSRF and viewers cannot change products',async()=>{
 const auth=await login();assert.equal((await request('POST','/api/v1/admin/products',createInput(),{...auth,csrf:''})).statusCode,403);
 assert.equal((await request('POST','/api/v1/admin/products',createInput(),{...auth,csrf:'é'.repeat(64)})).statusCode,403);
 const viewer=await login('viewer@example.test');assert.equal((await request('GET','/api/v1/admin/products',undefined,viewer)).statusCode,200);assert.equal((await request('POST','/api/v1/admin/products',createInput(),viewer)).statusCode,403);
 assert.equal((await app.inject({method:'POST',url:'/api/v1/admin/categories',headers:{cookie:auth.cookie,'x-csrf-token':auth.csrf},payload:{name:'Other',slug:'other'}})).statusCode,403);
});
test('create draft, activate, edit live prices/stock and reject stale versions',async()=>{
 const auth=await login();const created=await request('POST','/api/v1/admin/products',createInput(),auth);assert.equal(created.statusCode,201,created.body);let p=created.json();assert.equal(p.version,1);assert.equal((await request('GET','/api/v1/products/new-gold-ring')).statusCode,404);
 const body=input(p);body.active=true;body.variants[0].stock=3;body.variants[0].pricePaise=60000;
 const updated=await request('PUT','/api/v1/admin/products/'+p.id,{version:1,product:body},auth);assert.equal(updated.statusCode,200,updated.body);p=updated.json();assert.equal(p.version,2);
 const publicProduct=(await request('GET','/api/v1/products/new-gold-ring')).json();assert.equal(publicProduct.variants[0].stock,3);assert.equal(publicProduct.variants[0].pricePaise,60000);
 const stale=await request('PUT','/api/v1/admin/products/'+p.id,{version:1,product:body},auth);assert.equal(stale.statusCode,409);assert.equal(stale.json().error.code,'EDIT_CONFLICT');
 const quote=await request('POST','/api/v1/checkout/quote',{items:[{variantId:p.variants[0].id,quantity:4}]});assert.equal(quote.statusCode,409);
 assert.ok((await request('GET','/api/v1/admin/summary',undefined,auth)).json().lowStockVariants>=1);
});
test('duplicate SKU rolls back the product and unknown categories/negative stock are rejected',async()=>{
 const auth=await login();const before=(await request('GET','/api/v1/admin/summary',undefined,auth)).json().totalProducts;
 let body=createInput();body.slug='duplicate-sku-ring';body.variants[0].sku='sample-001';assert.equal((await request('POST','/api/v1/admin/products',body,auth)).statusCode,409);
 assert.equal((await request('GET','/api/v1/admin/summary',undefined,auth)).json().totalProducts,before);
 body=createInput();body.slug='invalid-ring';body.categories=['missing'];assert.equal((await request('POST','/api/v1/admin/products',body,auth)).statusCode,400);
 body=createInput();body.variants[0].stock=-1;assert.equal((await request('POST','/api/v1/admin/products',body,auth)).statusCode,400);
});
test('variant ownership, immutable URLs and soft archival protect existing data',async()=>{
 const auth=await login();let p=(await request('GET','/api/v1/admin/products/product-1',undefined,auth)).json();let body=input(p);body.variants[0].id='variant-2';assert.equal((await request('PUT','/api/v1/admin/products/'+p.id,{version:p.version,product:body},auth)).statusCode,400);
 body=input(p);body.slug='changed-url';assert.equal((await request('PUT','/api/v1/admin/products/'+p.id,{version:p.version,product:body},auth)).statusCode,409);
 body=input(p);const oldId=body.variants[0].id;body.variants=[{...body.variants[0],id:undefined,sku:'NEW-VARIANT-001'}];const saved=await request('PUT','/api/v1/admin/products/'+p.id,{version:p.version,product:body},auth);assert.equal(saved.statusCode,200,saved.body);
 const old=(await db.select().from(schema.variants).where(eq(schema.variants.id,oldId)))[0];assert.equal(old.active,false);assert.equal((await request('POST','/api/v1/checkout/quote',{items:[{variantId:oldId,quantity:1}]})).statusCode,409);
});
test('categories and price/stock audit trails are persisted',async()=>{
 const auth=await login();assert.equal((await request('POST','/api/v1/admin/categories',{name:'Earrings','slug':'earrings'},auth)).statusCode,409);
 assert.equal((await request('POST','/api/v1/admin/categories',{name:'Anklets','slug':'anklets'},auth)).statusCode,201);
 const audit=(await request('GET','/api/v1/admin/audit',undefined,auth)).json();assert.ok(audit.some((a:any)=>a.action==='product.updated'));assert.ok(audit.some((a:any)=>a.action==='category.created'));
 const movements=await db.select().from(schema.inventoryMovements);assert.ok(movements.length>=2);
});
function form(image:Buffer,type='image/png'){const boundary='test-image-boundary';return {payload:Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="photo.png"\r\nContent-Type: ${type}\r\n\r\n`),image,Buffer.from(`\r\n--${boundary}--\r\n`)]),contentType:'multipart/form-data; boundary='+boundary};}
test('authenticated uploads re-encode images and reject disguised SVG/oversize input',async()=>{
 const auth=await login();const png=await sharp({create:{width:2,height:2,channels:3,background:'#805619'}}).png().toBuffer();const upload=form(png);
 const r=await app.inject({method:'POST',url:'/api/v1/admin/images',payload:upload.payload,headers:{origin,cookie:auth.cookie,'x-csrf-token':auth.csrf,'content-type':upload.contentType}});assert.equal(r.statusCode,201,r.body);assert.ok(r.json().url.endsWith('.webp'));
 const image=await app.inject(new URL(r.json().url).pathname);assert.equal(image.statusCode,200);assert.equal(image.headers['cross-origin-resource-policy'],'cross-origin');assert.equal((await sharp(image.rawPayload).metadata()).format,'webp');
 const bad=form(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'),'image/jpeg');assert.equal((await app.inject({method:'POST',url:'/api/v1/admin/images',payload:bad.payload,headers:{origin,cookie:auth.cookie,'x-csrf-token':auth.csrf,'content-type':bad.contentType}})).statusCode,400);
 const big=form(Buffer.alloc(8*1024*1024+1));assert.equal((await app.inject({method:'POST',url:'/api/v1/admin/images',payload:big.payload,headers:{origin,cookie:auth.cookie,'x-csrf-token':auth.csrf,'content-type':big.contentType}})).statusCode,413);
});
test('logout/expiry revoke sessions; repeated failures lock an account',async()=>{
 const auth=await login();assert.equal((await request('POST','/api/v1/admin/logout',{},auth)).statusCode,200);assert.equal((await request('GET','/api/v1/admin/products',undefined,auth)).statusCode,401);
 const expired=await login();await db.update(schema.adminSessions).set({expiresAt:new Date(0)});assert.equal((await request('GET','/api/v1/admin/products',undefined,expired)).statusCode,401);
 for(let i=0;i<8;i++)assert.equal((await request('POST','/api/v1/admin/login',{email:'admin@example.test',password:'incorrect'})).statusCode,401);
 assert.equal((await request('POST','/api/v1/admin/login',{email:'admin@example.test',password})).statusCode,401);const user=(await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.id,'admin-1')))[0];assert.ok(user.lockedUntil&&user.lockedUntil>new Date());
});
test('migration upgrades an existing catalogue without resetting prices or stock',async()=>{
 const existing=new PGlite();try{
  await existing.exec(await readFile(new URL('../../../database/migrations/001_catalogue.sql',import.meta.url),'utf8'));
  await existing.exec("INSERT INTO products(id,slug,name,description) VALUES('legacy','legacy-ring','Legacy ring','Existing product'); INSERT INTO product_variants(id,product_id,sku,label,price_paise,colour,material,gender) VALUES('legacy-v','legacy','LEGACY','Default',12345,'Gold','Alloy','For Her'); INSERT INTO inventory(variant_id,available) VALUES('legacy-v',7);");
  await existing.exec(await readFile(new URL('../../../database/migrations/002_admin.sql',import.meta.url),'utf8'));
  const result=await existing.query<{price_paise:number,available:number,version:number,active:boolean}>("SELECT v.price_paise,i.available,p.version,v.active FROM products p JOIN product_variants v ON v.product_id=p.id JOIN inventory i ON i.variant_id=v.id WHERE p.id='legacy'");
  assert.deepEqual(result.rows[0],{price_paise:12345,available:7,version:1,active:true});
 }finally{await existing.close();}
});
