import { z } from 'zod';
import { productListSchema, productSchema, facetsSchema, quoteSchema, type QuoteRequest } from '@store/contracts';
export const base=(import.meta.env?.PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/,'');
export class ApiError extends Error { constructor(message:string,public code:string,public details?:unknown){super(message);} }
export async function request<T>(path:string,schema:z.ZodType<T,z.ZodTypeDef,any>,init:RequestInit={}){
  const response=await fetch(base+path,{...init,signal:init.signal??AbortSignal.timeout(10000),headers:{...(typeof init.body==='string'?{'Content-Type':'application/json'}:{}),...init.headers}});
  if(!response.ok){let data:any;try{data=await response.json();}catch{}throw new ApiError(data?.error?.message||'The shop is temporarily unavailable. Please try again.',data?.error?.code||'REQUEST_FAILED',data?.error?.details);}
  return schema.parse(await response.json());
}
export const api={
  products:(query:URLSearchParams,signal?:AbortSignal)=>request('/api/v1/products?'+query,productListSchema,{signal}),
  product:(slug:string,signal?:AbortSignal)=>request('/api/v1/products/'+encodeURIComponent(slug),productSchema,{signal}),
  facets:()=>request('/api/v1/facets',facetsSchema),
  quote:(body:QuoteRequest,signal?:AbortSignal)=>request('/api/v1/checkout/quote',quoteSchema,{method:'POST',body:JSON.stringify(body),signal}),
};
