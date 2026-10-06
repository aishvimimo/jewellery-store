import { migrateTestDb } from '../../../scripts/migrate-test-db.js';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { productSchema, productListSchema, quoteSchema } from '@store/contracts';
import { createApp } from '../src/app.js';
import { catalogueRepository } from '../src/catalogue.js';
import { seedData } from '../src/seed-data.js';
import * as schema from '../src/schema.js';
const pg=new PGlite();const db=drizzle(pg,{schema});const repo=catalogueRepository(db as unknown as NodePgDatabase<typeof schema>);
let app:Awaited<ReturnType<typeof createApp>>;
before(async()=>{
  await migrateTestDb(pg);
  const sample=z.array(productSchema).parse(JSON.parse(await readFile(new URL('../../../database/seeds.json',import.meta.url),'utf8')));
  await seedData(db as unknown as NodePgDatabase<typeof schema>,sample);
  await seedData(db as unknown as NodePgDatabase<typeof schema>,sample);
  app=await createApp(repo,{rateLimit:false});
});
after(async()=>{await app.close();await pg.close();});
const post=(body:unknown)=>app.inject({method:'POST',url:'/api/v1/checkout/quote',payload:JSON.stringify(body),headers:{'content-type':'application/json'}});
test('seed is idempotent and catalogue is paginated with deterministic sort',async()=>{
  const r=await app.inject('/api/v1/products?limit=3&sort=price-asc');assert.equal(r.statusCode,200);
  const data=productListSchema.parse(r.json());assert.equal(data.total,10);assert.equal(data.items.length,3);
  const prices=data.items.map(p=>p.variants[0].pricePaise);assert.deepEqual(prices,[33900,34900,39900]);
  const next=(await app.inject('/api/v1/products?limit=3&page=2&sort=price-asc')).json();assert.equal(next.items.length,3);assert.notEqual(next.items[0].id,data.items[0].id);
});
test('combined filters, literal wildcard search, empty results and invalid queries',async()=>{
  const list=(await app.inject('/api/v1/products?category=rings&colour=Silver&minPrice=39000&maxPrice=40000')).json();assert.equal(list.total,1);assert.equal(list.items[0].name,'Sweetheart Rosé Curve Ring');
  assert.equal((await app.inject('/api/v1/products?q=%25')).json().total,0);
  assert.equal((await app.inject('/api/v1/products?q=never-match')).json().total,0);
  assert.equal((await app.inject('/api/v1/products?page=0')).statusCode,400);
  assert.equal((await app.inject('/api/v1/products?minPrice=900&maxPrice=100')).statusCode,400);
  assert.equal((await app.inject('/api/v1/products?limit=999')).statusCode,400);
  assert.equal((await app.inject('/api/v1/products?unknown=1')).statusCode,400);
});
test('detail, missing product, facets and readiness',async()=>{
  const r=await app.inject('/api/v1/products/tulip-bloom-box');assert.equal(r.statusCode,200);assert.equal(productSchema.parse(r.json()).variants[0].stock,12);
  assert.equal((await app.inject('/api/v1/products/missing')).statusCode,404);
  const facets=(await app.inject('/api/v1/facets')).json();assert.ok(facets.colours.includes('Silver'));assert.equal(facets.categories.length,4);
  assert.equal((await app.inject('/ready')).statusCode,200);
});
test('quote calculates database prices and shipping using integer paise',async()=>{
  const r=await post({items:[{variantId:'variant-1',quantity:1}]});assert.equal(r.statusCode,200);
  const q=quoteSchema.parse(r.json());assert.equal(q.subtotalPaise,79900);assert.equal(q.shippingPaise,7900);assert.equal(q.totalPaise,87800);assert.equal(q.lines[0].stock,12);assert.equal(r.headers['cache-control'],'no-store');assert.ok(new Date(q.expiresAt).getTime()>Date.now());
});
test('festive threshold, prepaid stacking, gift wrap and express charges',async()=>{
  const r=await post({items:[{variantId:'variant-1',quantity:2}],coupon:' festive225 ',prepaid:true,giftWrap:true,delivery:'express'});
  assert.equal(r.statusCode,200);const q=r.json();assert.equal(q.couponDiscountPaise,22500);assert.equal(q.prepaidDiscountPaise,6865);assert.equal(q.shippingPaise,9900);assert.equal(q.giftWrapPaise,4900);assert.equal(q.totalPaise,145235);
  const low=await post({items:[{variantId:'variant-1',quantity:1}],coupon:'FESTIVE225'});assert.equal(low.statusCode,422);assert.equal(low.json().error.code,'COUPON_THRESHOLD');
  assert.equal((await post({items:[{variantId:'variant-1',quantity:1}],coupon:'BAD'})).statusCode,422);
});
test('welcome discount does not stack with prepaid and totals are revalidated',async()=>{
  const r=await post({items:[{variantId:'variant-1',quantity:1}],coupon:'WELCOME10',prepaid:true});assert.equal(r.statusCode,200);assert.equal(r.json().couponDiscountPaise,7990);assert.equal(r.json().prepaidDiscountPaise,0);assert.equal(r.json().totalPaise,79810);
  await db.update(schema.variants).set({pricePaise:80000}).where(eq(schema.variants.id,'variant-1'));
  assert.equal((await post({items:[{variantId:'variant-1',quantity:1}]})).json().subtotalPaise,80000);
  await db.update(schema.variants).set({pricePaise:79900}).where(eq(schema.variants.id,'variant-1'));
});
test('stock, inactive items, duplicates and client price tampering are rejected',async()=>{
  const excess=await post({items:[{variantId:'variant-1',quantity:13}]});assert.equal(excess.statusCode,409);assert.equal(excess.json().error.code,'INSUFFICIENT_STOCK');
  assert.equal((await post({items:[{variantId:'missing',quantity:1}]})).statusCode,409);
  assert.equal((await post({items:[{variantId:'variant-1',quantity:1},{variantId:'variant-1',quantity:1}]})).statusCode,400);
  assert.equal((await post({items:[{variantId:'variant-1',quantity:1,pricePaise:1}]})).statusCode,400);
  assert.equal((await post({items:[{variantId:'variant-1',quantity:0}]})).statusCode,400);
  assert.equal((await post({items:[]})).statusCode,400);
  assert.equal((await post({items:[{variantId:'variant-1',quantity:1}],postalCode:'000000'})).statusCode,400);
  await db.update(schema.products).set({active:false}).where(eq(schema.products.id,'product-1'));
  assert.equal((await post({items:[{variantId:'variant-1',quantity:1}]})).statusCode,409);
  assert.equal((await app.inject('/api/v1/products/tulip-bloom-box')).statusCode,404);
  await db.update(schema.products).set({active:true}).where(eq(schema.products.id,'product-1'));
});
test('quote is read-only and repeated requests do not consume inventory',async()=>{
  await post({items:[{variantId:'variant-1',quantity:12}]});await post({items:[{variantId:'variant-1',quantity:12}]});
  assert.equal((await app.inject('/api/v1/products/tulip-bloom-box')).json().variants[0].stock,12);
});
test('CORS allows the configured storefront and does not allow arbitrary origins',async()=>{
  const ok=await app.inject({url:'/api/v1/products',headers:{origin:'http://localhost:4321'}});assert.equal(ok.headers['access-control-allow-origin'],'http://localhost:4321');
  const bad=await app.inject({url:'/api/v1/products',headers:{origin:'https://untrusted.example'}});assert.equal(bad.headers['access-control-allow-origin'],undefined);
});
test('database constraints reject negative stock and quote rate limits are enforced',async()=>{
  await assert.rejects(()=>db.update(schema.inventory).set({available:-1}).where(eq(schema.inventory.variantId,'variant-1')));
  const limited=await createApp(repo,{rateLimit:true});try{for(let i=0;i<30;i++)assert.equal((await limited.inject({method:'POST',url:'/api/v1/checkout/quote',payload:{items:[{variantId:'variant-1',quantity:1}]}})).statusCode,200);assert.equal((await limited.inject({method:'POST',url:'/api/v1/checkout/quote',payload:{items:[{variantId:'variant-1',quantity:1}]}})).statusCode,429);}finally{await limited.close();}
});
