import { useEffect, useState } from 'react';
import { decodeBasket, emptyBasket, storageKey, type Basket } from './basket';
const event='shop:basket';
export function readBasket():Basket {try{return decodeBasket(localStorage.getItem(storageKey));}catch{return emptyBasket();}}
export function mutateBasket(update:(basket:Basket)=>Basket){
  const next=update(readBasket());
  // A failed write is reported by the component instead of pretending the cart was saved.
  localStorage.setItem(storageKey,JSON.stringify(next));window.dispatchEvent(new Event(event));
}
export function useBasket(){
  const [basket,setBasket]=useState<Basket>(emptyBasket);
  const [ready,setReady]=useState(false);
  useEffect(()=>{const sync=()=>setBasket(readBasket());sync();setReady(true);window.addEventListener(event,sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener(event,sync);window.removeEventListener('storage',sync);};},[]);
  return {basket,ready};
}
