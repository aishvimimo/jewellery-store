import { migrateTestDb } from '../../../scripts/migrate-test-db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createApp } from '../../api/src/app.js';
import { catalogueRepository } from '../../api/src/catalogue.js';
import { seedData } from '../../api/src/seed-data.js';
import * as schema from '../../api/src/schema.js';
import { storageKey } from '../src/lib/basket.js';

test('rendered shopping flow saves a product, updates quantities, applies offers and preserves reload state',async()=>{
  const window=new Window({url:'http://localhost:4321'});
  const globals=['window','document','navigator','HTMLElement','HTMLInputElement','MutationObserver','Event','InputEvent','localStorage','getComputedStyle'];
  const descriptors=new Map(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of globals)Object.defineProperty(globalThis,key,{value:key==='window'?window:key==='getComputedStyle'?window.getComputedStyle.bind(window):(window as any)[key],writable:true,configurable:true});
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  const originalFetch=globalThis.fetch;
  const pg=new PGlite();await migrateTestDb(pg);
  const db=drizzle(pg,{schema}) as unknown as NodePgDatabase<typeof schema>;
  const sample=JSON.parse(await readFile(new URL('../../../database/seeds.json',import.meta.url),'utf8'));
  await seedData(db,sample);const app=await createApp(catalogueRepository(db),{rateLimit:false});
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    const r=await app.inject({method:(init?.method||'GET') as 'GET'|'POST',url:url.pathname+url.search,payload:init?.body?String(init.body):undefined,headers:init?.body?{'content-type':'application/json'}:{}});
    if(init?.signal?.aborted)throw new DOMException('Aborted','AbortError');
    return new Response(r.body,{status:r.statusCode,headers:{'content-type':'application/json'}});
  };
  const {createElement:h,act}=await import('react');const {createRoot}=await import('react-dom/client');
  const {default:ProductCard}=await import('../src/components/ProductCard.js');const {default:Cart}=await import('../src/components/Cart.js');
  const container=window.document.createElement('div');window.document.body.append(container);const root=createRoot(container as any);
  const settle=async(check:()=>boolean)=>{for(let i=0;i<60;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(check())return;}assert.fail('UI did not reach expected state: '+container.textContent);};
  const click=async(button:any)=>{assert.ok(button);await act(async()=>button.click());};
  try {
    await act(async()=>root.render(h(ProductCard,{product:sample[0]})));
    await click([...container.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Save Tulip Bloom Box'));
    await click([...container.querySelectorAll('button')].find(b=>b.textContent?.includes('Add to cart')));
    assert.equal(JSON.parse(window.localStorage.getItem(storageKey)!).cart[0].quantity,1);assert.deepEqual(JSON.parse(window.localStorage.getItem(storageKey)!).wishlist,['tulip-bloom-box']);
    await act(async()=>root.render(h(Cart,{})));await settle(()=>container.textContent?.includes('₹878')===true);
    await click([...container.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Increase')));
    await settle(()=>container.textContent?.includes('₹1,598')===true);
    const input=container.querySelector('#coupon')!;
    await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,'FESTIVE225');input.dispatchEvent(new window.Event('input',{bubbles:true}));});
    await act(async()=>input.closest('form')!.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    await settle(()=>container.textContent?.includes('−₹225')===true);
    assert.ok(container.textContent?.includes('₹1,373'));
    // Unmount/remount simulates a page reload while retaining only IDs/quantities.
    await act(async()=>root.render(null));await act(async()=>root.render(h(Cart,{})));await settle(()=>container.textContent?.includes('₹1,598')===true);
    assert.equal(JSON.parse(window.localStorage.getItem(storageKey)!).cart[0].quantity,2);
    await click([...container.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Remove Tulip Bloom Box'));
    assert.ok(container.textContent?.includes('Your cart is waiting'));
  } finally {
    await act(async()=>root.unmount());await app.close();await pg.close();globalThis.fetch=originalFetch;
    for(const key of globals){const descriptor=descriptors.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;await window.happyDOM.close();
  }
});
