import { useEffect,useState } from 'react';
import type { Product } from '@store/contracts';
import { api } from '../lib/api';
import ProductDetail from './ProductDetail';
export default function LiveProduct(){
 const [product,setProduct]=useState<Product|null>(null),[error,setError]=useState('');
 useEffect(()=>{const slug=new URLSearchParams(window.location.search).get('slug');if(!slug){setError('Choose a product to preview');return;}const controller=new AbortController();api.product(slug,controller.signal).then(setProduct).catch(e=>{if(!controller.signal.aborted)setError(e.message||'Unable to load this product');});return()=>controller.abort();},[]);
 return product?<ProductDetail initial={product}/>:<section className="page-section">{error?<div className="error" role="alert">{error}</div>:<p role="status">Loading saved product…</p>}</section>;
}
