import { useState } from 'react';
import { Heart, Plus } from 'lucide-react';
import { money, type Product } from '@store/contracts';
import { addLine, toggleWish } from '../lib/basket';
import { useBasket, mutateBasket } from '../lib/useBasket';
export default function ProductCard({product:p}:{product:Product}){
  const {basket}=useBasket();const [status,setStatus]=useState('');const v=p.variants[0];
  const saved=basket.wishlist.includes(p.slug);const discount=v.compareAtPaise&&v.compareAtPaise>v.pricePaise?Math.round((1-v.pricePaise/v.compareAtPaise)*100):0;
  const run=(fn:()=>void,message:string)=>{try{fn();setStatus(message);}catch{setStatus('Unable to save. Please allow browser storage.');}};
  return <article className="product-card"><div className="product-photo"><a href={'/products/'+p.slug+'/'}><img src={p.images[0]||'/placeholder.svg'} alt={p.name} loading="lazy" width="500" height="600"/>{p.images[1]&&<img className="alternate" src={p.images[1]} alt="" loading="lazy" width="500" height="600"/>}</a><button className={'wish-button '+(saved?'saved':'')} aria-label={saved?`Remove ${p.name} from wishlist`:`Save ${p.name}`} aria-pressed={saved} onClick={()=>run(()=>mutateBasket(b=>toggleWish(b,p.slug)),saved?'Removed from wishlist':'Saved to wishlist')}><Heart size={19} fill={saved?'currentColor':'none'}/></button>{discount>0&&<span className="discount">{discount}% OFF</span>}</div>
    <div className="product-info"><h3><a href={'/products/'+p.slug+'/'}>{p.name}</a></h3><div className="price">{money(v.pricePaise)}{v.compareAtPaise&&v.compareAtPaise>v.pricePaise&&<del>{money(v.compareAtPaise)}</del>}</div><button className="add-button" disabled={!v.stock} onClick={()=>run(()=>mutateBasket(b=>addLine(b,{variantId:v.id,slug:p.slug,quantity:1})),'Added to cart')}><Plus size={16}/>{v.stock?'Add to cart':'Sold out'}</button><p className="card-status" role="status">{status}</p></div></article>;
}
