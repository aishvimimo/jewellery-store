import { useEffect,useRef,useState } from 'react';
import { Package } from 'lucide-react';
import { customerOrderSchema,orderReceiptSchema,money,type CustomerOrder,type OrderReceipt } from '@store/contracts';
import { request } from '../lib/api';
import { readOrders,rememberOrder,forgetOrder,parseAccessCode,accessCode,clearPurchasedCart,receiptKey,type SavedOrder } from '../lib/order-history';
import ReturnPanel from './ReturnPanel';
import OnlinePayment from './OnlinePayment';
const labels={pending:'Pending',confirmed:'Confirmed',shipped:'Shipped',delivered:'Delivered',cancelled:'Cancelled',unpaid:'Pay on delivery',collected:'Collected',paid:'Paid',refunded:'Refunded',review:'Needs review'};
const date=(value:string)=>new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
export default function MyOrders(){
 const [saved,setSaved]=useState<SavedOrder[]>([]),[selected,setSelected]=useState<SavedOrder|null>(null),[order,setOrder]=useState<CustomerOrder|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[code,setCode]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[checked,setChecked]=useState('');
 const controller=useRef<AbortController|null>(null),active=useRef(true),viewId=useRef<string|null>(null);
 function persist(receipt:OrderReceipt,auth:SavedOrder|{id:string,secret:string},ownsCart=false){
  try{const entry=rememberOrder(receipt,auth,ownsCart);setSaved(readOrders());return entry;}catch{setNotice('This browser could not save the order. Save the private access code below before leaving.');return {...auth,number:receipt.number,createdAt:receipt.createdAt,ownsCart};}
 }
 async function load(auth:SavedOrder|{id:string,secret:string},refresh=false){
  viewId.current=auth.id;controller.current?.abort();const c=new AbortController();controller.current=c;setBusy(true);setError('');if(!refresh){setOrder(null);setChecked('');}
  try{
   const proof={id:auth.id,secret:auth.secret};
   if(refresh&&order?.id===auth.id&&order.paymentMethod==='online')await request('/api/v1/payments/status',orderReceiptSchema,{method:'POST',body:JSON.stringify(proof),cache:'no-store',signal:c.signal});
   const result=await request('/api/v1/orders/detail',customerOrderSchema,{method:'POST',body:JSON.stringify(proof),cache:'no-store',signal:c.signal});
   if(c.signal.aborted||!active.current)return;
   const entry=persist(result,auth,'ownsCart' in auth&&auth.ownsCart);setSelected(entry);setOrder(result);setChecked(new Date().toISOString());setCode('');
   if(entry.ownsCart)try{clearPurchasedCart(result);}catch{setNotice('Order loaded, but the cart could not be updated. Review your cart before ordering again.');}
  }catch(e){if(!c.signal.aborted&&active.current)setError((e as Error).message);}finally{if(!c.signal.aborted&&active.current)setBusy(false);}
 }
 useEffect(()=>{
  active.current=true;
  try{const entries=readOrders();setSaved(entries);
   if(entries.length){setSelected(entries[0]);void load(entries[0]);}
   else{const legacy=sessionStorage.getItem(receiptKey);if(legacy){const auth=parseAccessCode(accessCode(JSON.parse(legacy)));void load({...auth,number:'',createdAt:new Date().toISOString(),ownsCart:true});}}
  }catch{setError('Saved order access could not be restored. Use a private access code below.');}
  setReady(true);return()=>{active.current=false;controller.current?.abort();};
 },[]);
 function remove(){if(!selected||!window.confirm('Remove this order from this browser? Save its private access code first. The store order will not be cancelled.'))return;
  try{forgetOrder(selected.id);const session=sessionStorage.getItem(receiptKey);if(session&&JSON.parse(session).id===selected.id)sessionStorage.removeItem(receiptKey);viewId.current=null;controller.current?.abort();setBusy(false);setSaved(readOrders());setSelected(null);setOrder(null);setError('');setNotice('Order removed from this browser. Its status at the store has not changed.');}catch{setError('Could not remove saved order access from this browser.');}
 }
 async function updated(receipt:OrderReceipt){if(!selected||!active.current||viewId.current!==receipt.id)return;if(selected.ownsCart)try{clearPurchasedCart(receipt);}catch{setNotice('Payment verified, but the cart could not be updated.');}setOrder(old=>old?{...old,...receipt}:null);await load(selected);}
 if(!ready)return <section className="page-section" role="status">Loading your orders…</section>;
 return <section className="page-section my-orders"><div className="page-heading"><p className="eyebrow">Your jewellery journey</p><h1>My Orders</h1><a href="/account/" className="text-button">Sign in for orders across devices</a><p>Orders saved on this browser. Reopen an order on another device with its private access code.</p></div>
 {error&&<p className="error" role="alert">{error}{order&&' The details below were loaded earlier; refresh to check the latest status.'}</p>}{notice&&<p className="checkout-banner" role="status">{notice}</p>}
 <div className="customer-orders-layout"><aside className="saved-orders" aria-label="Saved orders"><h2>Your orders</h2>{saved.length?saved.map(s=><button key={s.id} className={selected?.id===s.id?'saved-order selected':'saved-order'} aria-pressed={selected?.id===s.id} onClick={()=>{setSelected(s);void load(s);}}><strong>{s.number}</strong><span>{date(s.createdAt)}</span></button>):<div className="orders-empty"><Package size={30}/><p>No orders saved on this browser yet.</p><a href="/shop/" className="text-button">Explore jewellery</a></div>}
 <form className="order-recovery" onSubmit={e=>{e.preventDefault();try{const auth=parseAccessCode(code);void load(auth);}catch(e){setError((e as Error).message);}}}><h3>Open an order</h3><label htmlFor="order-code">Private access code</label><input id="order-code" type="password" autoComplete="off" maxLength={101} required value={code} onChange={e=>setCode(e.target.value)} aria-describedby="code-help"/><p id="code-help" className="muted">Use the code saved from your order receipt. An order number alone cannot unlock an order.</p><button className="secondary full" disabled={busy}>Open order</button></form></aside>
 <div className="customer-order-detail" aria-busy={busy}>{busy&&<p role="status">Checking your order…</p>}{!order&&!busy&&<p>Select a saved order or enter its private access code.</p>}{order&&selected&&<>
 <div className="order-detail-heading"><div><p className="eyebrow">{order.mode==='test'?'Test order':'Order receipt'}</p><h2>{order.number}</h2><p>Placed {date(order.createdAt)}</p></div><span className="order-status">{labels[order.status]}</span></div>
 {order.mode==='test'&&<p className="checkout-banner">This is a test order. No real payment or shipment takes place.</p>}
 <dl className="order-facts"><div><dt>Order status</dt><dd>{labels[order.status]}</dd></div><div><dt>Payment status</dt><dd>{labels[order.paymentStatus]}</dd></div><div><dt>Payment method</dt><dd>{order.paymentMethod==='cod'?'Cash on delivery':'Online test payment'}</dd></div><div><dt>Delivery</dt><dd>{order.delivery==='express'?'Express':'Standard'}</dd></div></dl>
 {order.paymentStatus==='review'&&<p className="checkout-banner">The store needs to review this payment before fulfilment. Keep your order number for support.</p>}
 <div className="order-tracking"><h3>Courier tracking</h3>{order.tracking?<p>Carrier: <strong>{order.tracking.carrier}</strong><br/>Tracking number: <strong>{order.tracking.number}</strong></p>:<p>Tracking details will appear here when the store adds them after dispatch.</p>}</div>
 <h3>Order updates</h3><ol className="order-timeline">{order.events.map(e=><li key={e.id}><strong>{labels[e.status]} · {labels[e.paymentStatus]}</strong><time dateTime={e.createdAt}>{date(e.createdAt)}</time></li>)}</ol>
 <h3>Your jewellery</h3>{order.lines.map(l=><div className="customer-order-line" key={l.variantId}><img src={l.image||'/placeholder.svg'} alt="" width="65" height="75"/><div><strong>{l.name}</strong><p>{l.label} · Quantity {l.quantity}</p></div><strong>{money(l.lineTotalPaise)}</strong></div>)}
 <dl className="totals"><dt>Items</dt><dd>{money(order.totals.subtotalPaise)}</dd><dt>Discount</dt><dd>−{money(order.totals.couponDiscountPaise+order.totals.prepaidDiscountPaise)}</dd><dt>Shipping</dt><dd>{money(order.totals.shippingPaise)}</dd><dt>Gift wrapping</dt><dd>{money(order.totals.giftWrapPaise)}</dd><dt className="total">Order total</dt><dd className="total">{money(order.totals.totalPaise)}</dd></dl>
 {order.paymentMethod==='online'&&order.paymentStatus==='pending'&&order.status==='pending'&&<OnlinePayment key={order.id} order={order} auth={{id:selected.id,secret:selected.secret}} onUpdated={r=>{void updated(r);}}/>}
 <div className="customer-order-actions"><button className="primary" disabled={busy} onClick={()=>{void load(selected,true);}}>Refresh order status</button><button className="text-button" disabled={busy} onClick={remove}>Remove from this browser</button></div>{checked&&<p className="muted">Last checked {date(checked)}</p>}
 <ReturnPanel key={order.id} order={order} auth={{id:selected.id,secret:selected.secret}}/><details className="private-order-code"><summary>Save private access code</summary><p>Anyone with this code can view this receipt and resume an eligible test payment. Save it privately; do not share it publicly.</p><label htmlFor="saved-order-code">Private access code</label><input id="saved-order-code" readOnly value={accessCode(selected)} onFocus={e=>e.currentTarget.select()}/><p className="muted">Copy and save this code. Paste it into Open an order on another device. Removing browser data removes saved access; it does not cancel the order.</p></details>
 </>}</div></div></section>;
}
