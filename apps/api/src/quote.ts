import { promotions as p, type Quote, type QuoteRequest } from '@store/contracts';
import type { CatalogueRepository } from './catalogue.js';
export class CommerceError extends Error {
  constructor(public statusCode:number,public code:string,message:string,public details?:unknown){super(message);}
}
export async function checkoutQuote(repo:CatalogueRepository,request:QuoteRequest):Promise<Quote>{
  const rows=await repo.variants(request.items.map(i=>i.variantId));
  const images=await repo.firstImages([...new Set(rows.map(r=>r.product.id))]);
  const lines=request.items.map(item=>{
    const row=rows.find(r=>r.variant.id===item.variantId);
    if(!row)throw new CommerceError(409,'PRODUCT_UNAVAILABLE','An item is no longer available',{variantId:item.variantId});
    const stock=row.stock??0;
    if(stock<item.quantity)throw new CommerceError(409,'INSUFFICIENT_STOCK',`${row.product.name} has only ${stock} available`,{variantId:item.variantId,available:stock});
    return {variantId:item.variantId,productSlug:row.product.slug,name:row.product.name,label:row.variant.label,
      image:images.find(i=>i.productId===row.product.id)?.url??'',quantity:item.quantity,
      unitPricePaise:row.variant.pricePaise,lineTotalPaise:row.variant.pricePaise*item.quantity,stock};
  });
  const subtotalPaise=lines.reduce((n,l)=>n+l.lineTotalPaise,0);
  let couponDiscountPaise=0;
  if(request.coupon==='WELCOME10')couponDiscountPaise=Math.floor(subtotalPaise*p.welcomeDiscountBps/10000);
  else if(request.coupon==='FESTIVE225'){
    if(subtotalPaise<p.festiveThresholdPaise)throw new CommerceError(422,'COUPON_THRESHOLD','FESTIVE225 requires merchandise of at least ₹1,500');
    couponDiscountPaise=p.festiveDiscountPaise;
  }else if(request.coupon)throw new CommerceError(422,'INVALID_COUPON','This coupon is not valid');
  const notices=['Estimate only: stock is not reserved and no order or payment has been created.','Delivery coverage, tax treatment and final shipping must be configured before live checkout.'];
  // Integer paise throughout; welcome and prepaid offers do not stack.
  const prepaidDiscountPaise=request.prepaid&&request.coupon!=='WELCOME10'?Math.floor((subtotalPaise-couponDiscountPaise)*p.prepaidDiscountBps/10000):0;
  if(request.prepaid&&request.coupon==='WELCOME10')notices.push('WELCOME10 cannot be combined with the prepaid offer.');
  const shippingPaise=(subtotalPaise>=p.freeShippingThresholdPaise?0:p.standardShippingPaise)+(request.delivery==='express'?p.expressExtraPaise:0);
  const giftWrapPaise=request.giftWrap?p.giftWrapPaise:0;
  return {currency:'INR',expiresAt:new Date(Date.now()+60000).toISOString(),lines,subtotalPaise,couponDiscountPaise,prepaidDiscountPaise,
    shippingPaise,giftWrapPaise,totalPaise:subtotalPaise-couponDiscountPaise-prepaidDiscountPaise+shippingPaise+giftWrapPaise,coupon:request.coupon,notices};
}
