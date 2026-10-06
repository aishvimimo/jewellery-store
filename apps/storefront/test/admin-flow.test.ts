import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrateTestDb } from '../../../scripts/migrate-test-db.js';
import { createApp } from '../../api/src/app.js';
import { catalogueRepository } from '../../api/src/catalogue.js';
import { adminRepository } from '../../api/src/admin-repository.js';
import { mediaStore } from '../../api/src/media.js';
import { hashPassword } from '../../api/src/password.js';
import { seedData } from '../../api/src/seed-data.js';
import * as schema from '../../api/src/schema.js';

test('admin UI signs in, edits price and stock, saves through PostgreSQL, and signs out',{timeout:20000},async()=>{
 const window=new Window({url:'http://localhost:4321/admin/'}),globals=['window','document','navigator','HTMLElement','HTMLInputElement','MutationObserver','Event','InputEvent','localStorage','getComputedStyle'];
 const descriptors=new Map(globals.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of globals)Object.defineProperty(globalThis,key,{value:key==='window'?window:key==='getComputedStyle'?window.getComputedStyle.bind(window):(window as any)[key],writable:true,configurable:true});
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const originalFetch=globalThis.fetch;
 const pg=new PGlite();await migrateTestDb(pg);const db=drizzle(pg,{schema}) as unknown as NodePgDatabase<typeof schema>;
 await seedData(db,JSON.parse(await readFile(new URL('../../../database/seeds.json',import.meta.url),'utf8')));
 await db.insert(schema.adminUsers).values({id:'ui-admin',email:'owner@example.test',name:'Owner',passwordHash:await hashPassword('Test-password-12345')});
 const app=await createApp(catalogueRepository(db),{rateLimit:false,admin:{repo:adminRepository(db),production:false,sameSite:'lax',sessionHours:8,media:mediaStore({driver:'local',localDir:'.data/unused-ui',publicUrl:'http://localhost:3001/media',production:false})}});
 let cookieJar='';
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input)),headers={'content-type':'application/json',origin:'http://localhost:4321',...(init?.headers as Record<string,string>),...(init?.credentials==='include'&&cookieJar?{cookie:cookieJar}:{})};
  const r=await app.inject({method:(init?.method||'GET') as 'GET'|'POST'|'PUT',url:url.pathname+url.search,payload:init?.body?String(init.body):undefined,headers});
  if(r.headers['set-cookie'])cookieJar=String(r.headers['set-cookie']).split(';')[0];
  return new Response(r.body,{status:r.statusCode,headers:{'content-type':'application/json'}});
 };
 const {createElement:h,act}=await import('react'),{createRoot}=await import('react-dom/client'),{default:AdminApp}=await import('../src/components/AdminApp.js');
 const container=window.document.createElement('div');window.document.body.append(container);const root=createRoot(container as any);
 const settle=async(check:()=>boolean)=>{for(let i=0;i<120;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(check())return;}assert.fail('Admin did not reach expected state: '+container.textContent);};
 const fill=async(input:any,value:string)=>{assert.ok(input);await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));});};
 try{
  await act(async()=>root.render(h(AdminApp,{})));await settle(()=>!!container.querySelector('input[type=email]'));
  await fill(container.querySelector('input[type=email]'),'owner@example.test');await fill(container.querySelector('input[type=password]'),'Test-password-12345');
  await act(async()=>container.querySelector('form')!.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  await settle(()=>!!container.querySelector('.admin-table tbody tr'));
  const row=[...container.querySelectorAll('.admin-table tbody tr')].find(r=>r.textContent?.includes('Tulip Bloom Box'))!;
  await act(async()=>row.querySelector('button')!.click());await settle(()=>!!container.querySelector('.admin-editor'));
  const field=(label:string)=>[...container.querySelectorAll('label')].find(l=>l.textContent?.startsWith(label))?.querySelector('input');
  await fill(field('Selling price'),'1000');await fill(field('Available stock'),'4');
  await act(async()=>container.querySelector('.admin-editor')!.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  await settle(()=>container.textContent?.includes('Product saved.')===true);
  const product=(await app.inject('/api/v1/products/tulip-bloom-box')).json();assert.equal(product.variants[0].pricePaise,100000);assert.equal(product.variants[0].stock,4);
  const oldCookie=cookieJar;
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent?.includes('Sign out'))!.click());
  await settle(()=>!!container.querySelector('input[type=password]'));
  assert.equal((await app.inject({url:'/api/v1/admin/products',headers:{cookie:oldCookie}})).statusCode,401);
 }finally{
  await act(async()=>root.unmount());await app.close();await pg.close();globalThis.fetch=originalFetch;
  for(const key of globals){const d=descriptors.get(key);if(d)Object.defineProperty(globalThis,key,d);else delete (globalThis as any)[key];}delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;await window.happyDOM.close();
 }
});
