import { z } from 'zod';
import { adminOrderSchema,adminOrderListSchema,orderUpdateSchema,adminSessionSchema,adminListSchema,adminProductSchema,adminSummarySchema,adminAuditSchema,categorySchema,type AdminProductInput } from '@store/contracts';
import { request } from './api';
const prefix='/api/v1/admin';
const read=<T>(path:string,schema:z.ZodType<T,z.ZodTypeDef,any>)=>request(prefix+path,schema,{credentials:'include',cache:'no-store'});
const write=<T>(path:string,schema:z.ZodType<T,z.ZodTypeDef,any>,csrf:string,body:unknown,method='POST')=>request(prefix+path,schema,{credentials:'include',method,headers:{'X-CSRF-Token':csrf},body:JSON.stringify(body)});
export const adminApi={
 session:()=>read('/session',adminSessionSchema),
 login:(email:string,password:string)=>request(prefix+'/login',adminSessionSchema,{credentials:'include',method:'POST',body:JSON.stringify({email,password})}),
 logout:(csrf:string)=>write('/logout',z.object({ok:z.boolean()}),csrf,{}),
 summary:()=>read('/summary',adminSummarySchema),
 list:(params:URLSearchParams)=>read('/products?'+params,adminListSchema),
 product:(id:string)=>read('/products/'+encodeURIComponent(id),adminProductSchema),
 save:(csrf:string,product:AdminProductInput,id?:string,version?:number)=>write(id?'/products/'+encodeURIComponent(id):'/products',adminProductSchema,csrf,id?{version,product}:product,id?'PUT':'POST'),
 categories:()=>read('/categories',z.array(categorySchema)),
 category:(csrf:string,slug:string,name:string)=>write('/categories',categorySchema,csrf,{slug,name}),
 audit:()=>read('/audit',adminAuditSchema),
 reconcilePayment:(csrf:string,id:string)=>write('/orders/'+encodeURIComponent(id)+'/reconcile',adminOrderSchema,csrf,{}),
 orders:(params:URLSearchParams)=>read('/orders?'+params,adminOrderListSchema),
 order:(id:string)=>read('/orders/'+encodeURIComponent(id),adminOrderSchema),
 updateOrder:(csrf:string,id:string,body:z.infer<typeof orderUpdateSchema>)=>write('/orders/'+encodeURIComponent(id),adminOrderSchema,csrf,body,'PUT'),
 publish:(csrf:string)=>write('/publish',z.object({message:z.string()}),csrf,{}),
 upload:(csrf:string,file:File)=>{const body=new FormData();body.append('image',file);return request(prefix+'/images',z.object({url:z.string(),format:z.string()}),{method:'POST',credentials:'include',headers:{'X-CSRF-Token':csrf},body,signal:AbortSignal.timeout(30000)});},
};
export function explainAdminError(error:unknown){
 const e=error as {message?:string,details?:unknown};
 const details=Array.isArray(e.details)?e.details.map((d:any)=>`${d.path}: ${d.message}`).join('; '):'';
 return details||e.message||'Unable to complete this action. Please try again.';
}
