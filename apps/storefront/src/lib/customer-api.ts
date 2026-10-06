import { z } from 'zod';
import { customerSessionSchema,customerOrderListSchema,customerOrderSchema } from '@store/contracts';
import { request } from './api';
export const messageSchema=z.object({message:z.string()});
export const customerRead=<T>(path:string,schema:z.ZodType<T,z.ZodTypeDef,any>)=>request('/api/v1/account'+path,schema,{credentials:'include',cache:'no-store'});
export const customerWrite=<T>(path:string,schema:z.ZodType<T,z.ZodTypeDef,any>,body:unknown,csrf?:string)=>request('/api/v1/account'+path,schema,{method:'POST',credentials:'include',headers:csrf?{'X-CSRF-Token':csrf}:{},body:JSON.stringify(body),cache:'no-store'});
export const customerApi={session:()=>customerRead('/session',customerSessionSchema),config:()=>customerRead('/config',z.object({emailMode:z.enum(['local','resend','disabled'])})),login:(email:string,password:string)=>customerWrite('/login',customerSessionSchema,{email,password}),orders:(page:number)=>customerRead('/orders?page='+page,customerOrderListSchema),order:(id:string)=>customerRead('/orders/'+id,customerOrderSchema)};
