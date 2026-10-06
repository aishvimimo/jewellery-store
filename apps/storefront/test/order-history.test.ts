import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { historyKey,rememberOrder,readOrders,parseAccessCode,accessCode } from '../src/lib/order-history.js';
import type { OrderReceipt } from '@store/contracts';

test('private order access is validated and browser history retains only bounded access metadata',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)}});
 try{
  const id=randomUUID(),auth={id,secret:'a'.repeat(64)},order={id,number:'ORD-TEST',createdAt:new Date().toISOString(),customer:{email:'private@example.test'},address:{line1:'Private address'}} as unknown as OrderReceipt;
  rememberOrder(order,auth,true);rememberOrder(order,auth,false);assert.equal(readOrders().length,1);assert.equal(readOrders()[0].ownsCart,true);assert.equal(values.get(historyKey)?.includes('private@example.test'),false);assert.equal(values.get(historyKey)?.includes('Private address'),false);
  assert.deepEqual(parseAccessCode(accessCode(auth)),auth);assert.throws(()=>parseAccessCode('ORD-TEST'));assert.throws(()=>parseAccessCode(accessCode(auth)+'.extra'));assert.throws(()=>parseAccessCode(id+'.'+'b'.repeat(63)));
  for(let i=0;i<105;i++){const id=randomUUID();rememberOrder({...order,id,createdAt:new Date(Date.now()+i).toISOString()},{id,secret:'b'.repeat(64)});}
  assert.equal(readOrders().length,100);assert.equal(readOrders().some(o=>o.id===auth.id),false);
 }finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete (globalThis as any).localStorage;}
});

test('malformed saved entries cannot inject extra private fields or unlock an order',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),id=randomUUID();let raw=JSON.stringify([{id,secret:'x',number:'invalid',createdAt:'bad'},{id,secret:'c'.repeat(64),number:'ORD',createdAt:new Date().toISOString(),address:'not retained'}]);Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>raw}});
 try{const entries=readOrders();assert.equal(entries.length,1);assert.equal((entries[0] as any).address,undefined);assert.equal(entries[0].ownsCart,false);raw='{';assert.throws(readOrders);}finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete (globalThis as any).localStorage;}
});
