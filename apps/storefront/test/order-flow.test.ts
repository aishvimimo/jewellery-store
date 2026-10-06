import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { migrateTestDb } from '../../../scripts/migrate-test-db.js';
import { createApp } from '../../api/src/app.js';
import { catalogueRepository } from '../../api/src/catalogue.js';
import { orderRepository } from '../../api/src/orders.js';
import { adminRepository } from '../../api/src/admin-repository.js';
import { mediaStore } from '../../api/src/media.js';
import { hashPassword } from '../../api/src/password.js';
import { seedData } from '../../api/src/seed-data.js';
import * as s from '../../api/src/schema.js';
import { storageKey } from '../src/lib/basket.js';

test('checkout recovers a lost response after reload without duplicate orders, and admin cancellation restores stock',{timeout:30000},async()=>{
 const window=new Window({url:'http://localhost:4321/checkout/'}),globals=['window','document','navigator','HTMLElement','HTMLInputElement','HTMLSelectElement','MutationObserver','Event','InputEvent','localStorage','sessionStorage','getComputedStyle'];
 const descriptors=new Map(globals.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of globals)Object.defineProperty(globalThis,key,{value:key==='window'?window:key==='getComputedStyle'?window.getComputedStyle.bind(window):(window as any)[key],writable:true,configurable:true});
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;(window as any).confirm=()=>true;const originalFetch=globalThis.fetch;
 const pg=new PGlite();await migrateTestDb(pg);const db=drizzle(pg,{schema:s}) as unknown as NodePgDatabase<typeof s>;
 await seedData(db,JSON.parse(await readFile(new URL('../../../database/seeds.json',import.meta.url),'utf8')));
 await db.insert(s.adminUsers).values({id:'ui-owner',email:'owner@example.test',name:'Owner',passwordHash:await hashPassword('Test-password-12345')});
 const app=await createApp(catalogueRepository(db),{rateLimit:false,orders:orderRepository(db,{mode:'test',pinPrefixes:[]}),admin:{repo:adminRepository(db),production:false,sameSite:'lax',sessionHours:8,media:mediaStore({driver:'local',localDir:'.data/unused-order-ui',publicUrl:'http://localhost:3001/media',production:false})}});
 const auth=await app.inject({method:'POST',url:'/api/v1/admin/login',headers:{origin:'http://localhost:4321'},payload:{email:'owner@example.test',password:'Test-password-12345'}});assert.equal(auth.statusCode,200);const cookie=String(auth.headers['set-cookie']).split(';')[0];let loseResponse=true,posts=0;
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));const r=await app.inject({method:(init?.method||'GET') as 'GET'|'POST'|'PUT',url:url.pathname+url.search,payload:init?.body?String(init.body):undefined,headers:{origin:'http://localhost:4321','content-type':'application/json',...(init?.headers as Record<string,string>),...(init?.credentials==='include'?{cookie}:{})}});
  if(url.pathname==='/api/v1/orders'){posts++;if(loseResponse){loseResponse=false;assert.equal(r.statusCode,201,r.body);throw new TypeError('Simulated network interruption');}}
  if(init?.signal?.aborted)throw new DOMException('Aborted','AbortError');return new Response(r.body,{status:r.statusCode,headers:{'content-type':'application/json'}});
 };
 window.localStorage.setItem(storageKey,JSON.stringify({cart:[{variantId:'variant-1',slug:'tulip-bloom-box',quantity:1}],wishlist:['tulip-bloom-box']}));
 const {createElement:h,act}=await import('react'),{createRoot}=await import('react-dom/client'),{default:Checkout}=await import('../src/components/Checkout.js'),{default:AdminOrders}=await import('../src/components/AdminOrders.js'),{default:MyOrders}=await import('../src/components/MyOrders.js');
 const container=window.document.createElement('div');window.document.body.append(container);const root=createRoot(container as any);
 const settle=async(check:()=>boolean)=>{for(let i=0;i<150;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(check())return;}assert.fail('Order UI did not reach expected state: '+container.textContent);};
 const fill=async(label:string,value:string)=>{const input=[...container.querySelectorAll('label')].find(l=>l.textContent?.startsWith(label))?.querySelector('input');assert.ok(input,'Missing '+label);await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));});};
 const button=(text:string)=>[...container.querySelectorAll('button')].find(b=>b.textContent?.includes(text))!;
 try{
  await act(async()=>root.render(h(Checkout,{})));await settle(()=>!!container.querySelector('#checkout-form')&&container.textContent?.includes('₹878')===true);
  for(const [label,value] of [['Full name','Order Customer'],['Email','customer@example.test'],['Mobile number','9876543210'],['Address line 1','123 Testing Street'],['City','Bengaluru'],['State','Karnataka'],['PIN code','560001']])await fill(label,value);
  await act(async()=>container.querySelector('#checkout-form')!.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  await settle(()=>!!button('Retry same submission'));assert.equal((await db.select().from(s.orders)).length,1);
  await act(async()=>root.render(null));await act(async()=>root.render(h(Checkout,{})));await settle(()=>!!button('Retry same submission'));
  await act(async()=>button('Retry same submission').click());await settle(()=>!!container.querySelector('.order-confirmation'));
  assert.equal(posts,2);assert.equal((await db.select().from(s.orders)).length,1);assert.equal((await db.select().from(s.inventory).where(eq(s.inventory.variantId,'variant-1')))[0].available,11);
  const basket=JSON.parse(window.localStorage.getItem(storageKey)!);assert.deepEqual(basket.cart,[]);assert.deepEqual(basket.wishlist,['tulip-bloom-box']);assert.equal(window.sessionStorage.getItem('store:checkout-pending:v1'),null);assert.ok(!window.sessionStorage.getItem('store:checkout-receipt:v1')?.includes('Testing Street'));
  let adminError='';await act(async()=>root.render(h(AdminOrders,{csrf:auth.json().csrfToken,user:auth.json().user,onError:(e:unknown)=>{adminError=(e as Error).message;}})));await settle(()=>!!button('View order'));
  await act(async()=>button('View order').click());await settle(()=>!!container.querySelector('.admin-order-update'));
  const select=container.querySelector('.admin-order-update select') as any;
  await act(async()=>{select.value='cancelled';select.dispatchEvent(new window.Event('change',{bubbles:true}));});
  await act(async()=>container.querySelector('.admin-order-update')!.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  await settle(()=>container.textContent?.includes('Order updated.')===true);assert.equal(adminError,'');assert.equal((await db.select().from(s.orders))[0].status,'cancelled');assert.equal((await db.select().from(s.inventory).where(eq(s.inventory.variantId,'variant-1')))[0].available,12);
  const history=JSON.parse(window.localStorage.getItem('store:orders:v1')!);assert.equal(history.length,1);assert.equal(history[0].ownsCart,true);assert.ok(!JSON.stringify(history).includes('Testing Street'));assert.ok(!JSON.stringify(history).includes('customer@example.test'));
  window.sessionStorage.clear();await act(async()=>root.render(h(MyOrders,{})));await settle(()=>container.textContent?.includes('Cancelled')===true);
  assert.equal(container.querySelectorAll('.order-timeline li').length,2);assert.ok(container.textContent?.includes('Order total'));const code=(container.querySelector('#saved-order-code') as any).value;assert.equal(code,history[0].id+'.'+history[0].secret);
  await act(async()=>root.render(null));await act(async()=>root.render(h(MyOrders,{})));await settle(()=>container.textContent?.includes('Cancelled')===true);
  await act(async()=>button('Remove from this browser').click());assert.deepEqual(JSON.parse(window.localStorage.getItem('store:orders:v1')!),[]);assert.equal((await db.select().from(s.orders))[0].status,'cancelled');assert.ok(container.textContent?.includes('No orders saved'));
  const add=JSON.parse(window.localStorage.getItem(storageKey)!);add.cart=[{variantId:'variant-1',slug:'tulip-bloom-box',quantity:1}];window.localStorage.setItem(storageKey,JSON.stringify(add));
  const enter=async(value:string)=>{const field=container.querySelector('#order-code')!;await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new window.Event('input',{bubbles:true}));});await act(async()=>container.querySelector('.order-recovery')!.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));};
  await enter(history[0].id+'.'+'0'.repeat(64));await settle(()=>container.textContent?.includes('Order not found')===true);assert.deepEqual(JSON.parse(window.localStorage.getItem('store:orders:v1')!),[]);assert.equal(container.querySelector('#saved-order-code'),null);
  await enter(code);await settle(()=>container.textContent?.includes('Cancelled')===true);assert.equal(JSON.parse(window.localStorage.getItem('store:orders:v1')!)[0].ownsCart,false);assert.equal(JSON.parse(window.localStorage.getItem(storageKey)!).cart[0].quantity,1);
  await act(async()=>button('Refresh order status').click());await settle(()=>!button('Refresh order status').disabled);assert.equal(JSON.parse(window.localStorage.getItem(storageKey)!).cart[0].quantity,1);

 }finally{
  await act(async()=>root.unmount());await app.close();await pg.close();globalThis.fetch=originalFetch;
  for(const key of globals){const d=descriptors.get(key);if(d)Object.defineProperty(globalThis,key,d);else delete (globalThis as any)[key];}delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;await window.happyDOM.close();
 }
});
