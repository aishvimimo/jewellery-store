import { z } from 'zod';
import { paymentAccessSchema,type OrderReceipt } from '@store/contracts';
import { mutateBasket } from './useBasket';
export const historyKey='store:orders:v1',receiptKey='store:checkout-receipt:v1';
const savedOrderSchema=paymentAccessSchema.extend({number:z.string().max(80),createdAt:z.string().datetime(),ownsCart:z.boolean().default(false)}).strip();
export type SavedOrder=z.infer<typeof savedOrderSchema>;
export function readOrders():SavedOrder[]{
 const raw=localStorage.getItem(historyKey);if(!raw)return [];
 const values=z.array(z.unknown()).max(100).parse(JSON.parse(raw)),seen=new Set<string>();
 return values.flatMap(v=>{const parsed=savedOrderSchema.safeParse(v);if(!parsed.success||seen.has(parsed.data.id))return [];seen.add(parsed.data.id);return [parsed.data];});
}
export function rememberOrder(order:OrderReceipt,auth:{id:string,secret:string},ownsCart=false){
 const previous=readOrders(),old=previous.find(o=>o.id===order.id);
 const saved=savedOrderSchema.parse({...auth,number:order.number,createdAt:order.createdAt,ownsCart:ownsCart||old?.ownsCart||false});
 localStorage.setItem(historyKey,JSON.stringify([saved,...previous.filter(o=>o.id!==order.id)].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100)));return saved;
}
export function forgetOrder(id:string){localStorage.setItem(historyKey,JSON.stringify(readOrders().filter(o=>o.id!==id)));}
export function accessCode(auth:{id:string,secret:string}){return auth.id+'.'+auth.secret;}
export function parseAccessCode(value:string){const [id,secret,...extra]=value.trim().split('.');if(extra.length)throw new Error('Enter a valid private order access code.');const parsed=paymentAccessSchema.safeParse({id,secret});if(!parsed.success)throw new Error('Enter a valid private order access code.');return parsed.data;}
export function clearPurchasedCart(order:OrderReceipt){
 if(order.paymentMethod!=='cod'&&order.paymentStatus!=='paid')return;
 mutateBasket(b=>{if(b.completedOrders?.includes(order.id))return b;return {...b,completedOrders:[...(b.completedOrders||[]).slice(-99),order.id],cart:b.cart.flatMap(l=>{const quantity=l.quantity-(order.lines.find(i=>i.variantId===l.variantId)?.quantity??0);return quantity>0?[{...l,quantity}]:[];})};});
}
