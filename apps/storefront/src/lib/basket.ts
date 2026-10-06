import { z } from 'zod';
const storedLine=z.object({variantId:z.string().min(1).max(80),slug:z.string().min(1).max(160),quantity:z.number().int().min(1).max(20)});
const schema=z.object({cart:z.array(storedLine).max(50),wishlist:z.array(z.string().min(1).max(160)).max(200),completedOrders:z.array(z.string().uuid()).max(100).optional()});
export type Basket=z.infer<typeof schema>;
export type StoredLine=z.infer<typeof storedLine>;
export const emptyBasket=():Basket=>({cart:[],wishlist:[]});
export const storageKey='jewellery-shop:v1';
export function decodeBasket(value:string|null):Basket{
  try{const parsed=schema.safeParse(JSON.parse(value||'null'));if(!parsed.success)return emptyBasket();
    return {cart:parsed.data.cart.filter((line,index,array)=>array.findIndex(l=>l.variantId===line.variantId)===index),wishlist:[...new Set(parsed.data.wishlist)],...(parsed.data.completedOrders?{completedOrders:parsed.data.completedOrders}:{})};
  }catch{return emptyBasket();}
}
export function addLine(basket:Basket,line:StoredLine):Basket{
  const valid=storedLine.parse(line);const existing=basket.cart.find(i=>i.variantId===valid.variantId);
  if(!existing&&basket.cart.length>=50)throw new Error('Your cart can contain up to 50 different items.');
  return {...basket,cart:existing?basket.cart.map(i=>i.variantId===valid.variantId?{...i,quantity:Math.min(20,i.quantity+valid.quantity)}:i):[...basket.cart,valid]};
}
export function setQuantity(basket:Basket,id:string,quantity:number):Basket{
  if(!Number.isInteger(quantity))return basket;
  return {...basket,cart:quantity<=0?basket.cart.filter(i=>i.variantId!==id):basket.cart.map(i=>i.variantId===id?{...i,quantity:Math.min(20,quantity)}:i)};
}
export function toggleWish(basket:Basket,slug:string):Basket{
  if(basket.wishlist.includes(slug))return {...basket,wishlist:basket.wishlist.filter(s=>s!==slug)};
  if(basket.wishlist.length>=200)throw new Error('Your wishlist can contain up to 200 products.');
  return {...basket,wishlist:[...basket.wishlist,slug]};
}
