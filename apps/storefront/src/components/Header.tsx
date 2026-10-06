import { Search, Heart, ShoppingBag, Menu, X, Package, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useBasket } from '../lib/useBasket';
export default function Header({name}:{name:string}){
  const {basket}=useBasket();const [open,setOpen]=useState(false);
  return <header className="site-header"><div className="header-main">
    <a className="wordmark" href="/">{name}</a>
    <form className="search" action="/shop/" role="search"><label className="sr-only" htmlFor="search">Search jewellery</label><input id="search" name="q" placeholder="Find your next favourite" maxLength={100}/><button aria-label="Search"><Search size={20}/></button></form>
    <div className="header-tools"><a href="/account/" aria-label="My Account" title="My Account"><UserRound size={21}/></a><a href="/orders/" aria-label="My Orders" title="My Orders"><Package size={21}/></a><a href="/wishlist/" aria-label={`Wishlist, ${basket.wishlist.length} products`}><Heart size={21}/><span>{basket.wishlist.length}</span></a><a href="/cart/" aria-label={`Cart, ${basket.cart.reduce((n,i)=>n+i.quantity,0)} items`}><ShoppingBag size={21}/><span>{basket.cart.reduce((n,i)=>n+i.quantity,0)}</span></a><button className="mobile-menu" aria-label={open?'Close menu':'Open menu'} aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button></div>
    </div><nav className={open?'navigation open':'navigation'} aria-label="Main navigation"><a href="/shop/">All Jewellery</a><a href="/shop/?category=necklaces">Necklaces</a><a href="/shop/?category=bracelets">Bracelets</a><a href="/shop/?category=rings">Rings</a><a href="/shop/?category=jewellery-sets">Jewellery Sets</a><a href="/#inspired">Get Inspired</a><a href="/orders/">My Orders</a></nav>
  </header>;
}
