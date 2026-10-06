import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import type { Product } from '@store/contracts';
import { useBasket, mutateBasket } from '../lib/useBasket';
import { toggleWish } from '../lib/basket';
import { api } from '../lib/api';
import ProductCard from './ProductCard';
export default function Wishlist(){
  const {basket,ready}=useBasket();const [items,setItems]=useState<Product[]>([]),[missing,setMissing]=useState<string[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0);const key=JSON.stringify(basket.wishlist);
  useEffect(()=>{if(!ready)return;const c=new AbortController();setLoading(true);setError('');Promise.all(basket.wishlist.map(slug=>api.product(slug,c.signal).then(p=>({slug,p})).catch(err=>{if(err.code==='NOT_FOUND')return {slug,p:null};throw err;}))).then(rows=>{setItems(rows.flatMap(r=>r.p?[r.p]:[]));setMissing(rows.filter(r=>!r.p).map(r=>r.slug));}).catch(e=>{if(!c.signal.aborted)setError(e.message||'Unable to load wishlist');}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[key,ready,retry]);
  return <section className="page-section"><div className="page-heading"><p className="eyebrow">Keep a little sparkle for later</p><h1>Your wishlist</h1><p>Saved on this device. {basket.wishlist.length} favourites.</p></div>{(!ready||loading)&&<p role="status">Loading your favourites…</p>}{error&&<div className="error" role="alert">{error}<button className="text-button" onClick={()=>setRetry(n=>n+1)}>Try again</button></div>}{!error&&<div className="product-grid wishlist-grid">{items.map(p=><ProductCard key={p.id} product={p}/>)}</div>}{missing.map(slug=><p key={slug}>This product is no longer available: {slug} <button className="text-button" onClick={()=>{try{mutateBasket(b=>toggleWish(b,slug));}catch{setError('Unable to save changes');}}}>Remove</button></p>)}{ready&&!basket.wishlist.length&&<div className="empty"><Heart size={38}/><h2>Find your favourites</h2><p>Tap the heart on any jewellery piece to save it here.</p><a className="primary" href="/shop/">Explore jewellery</a></div>}</section>;
}
