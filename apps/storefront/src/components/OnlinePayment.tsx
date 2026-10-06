import { useRef,useState } from 'react';
import { orderReceiptSchema,paymentSessionSchema,type OrderReceipt } from '@store/contracts';
import { request } from '../lib/api';
import type { OrderAccess } from './ReturnPanel';
import { loadRazorpay } from '../lib/razorpay';
export default function OnlinePayment({order,auth,onUpdated}:{order:OrderReceipt,auth:OrderAccess,onUpdated:(order:OrderReceipt)=>void}){
 const account='csrf' in auth;const root=account?'/api/v1/account/orders/'+order.id+'/payment':'/api/v1/payments';const init={credentials:account?'include' as const:'same-origin' as const,headers:account?{'X-CSRF-Token':auth.csrf}:undefined};
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');const active=useRef(false);
 async function pay(){if(active.current)return;active.current=true;setBusy(true);setMessage('');try{
  const session=await request(root+'/start',paymentSessionSchema,{...init,method:'POST',body:JSON.stringify(account?{}:auth),signal:AbortSignal.timeout(20000)});
  await loadRazorpay();const checkout=new window.Razorpay!({key:session.keyId,order_id:session.gatewayOrderId,amount:session.amountPaise,currency:session.currency,name:import.meta.env?.PUBLIC_STORE_NAME||'Jewellery Store',description:order.number,theme:{color:'#806326'},modal:{ondismiss:()=>{active.current=false;setBusy(false);setMessage('Checkout closed. Check payment status before starting another order.');}},handler:async result=>{
   try{const updated=await request(root+'/verify',orderReceiptSchema,{...init,method:'POST',body:JSON.stringify({...(!account?auth:{}),razorpay_order_id:result.razorpay_order_id,razorpay_payment_id:result.razorpay_payment_id,razorpay_signature:result.razorpay_signature})});onUpdated(updated);if(updated.paymentStatus==='pending')setMessage('Payment is awaiting capture. Check status again shortly.');}catch(e){setMessage((e as Error).message+' Use Check payment status; do not place a duplicate order.');}finally{active.current=false;setBusy(false);}
  }});checkout.on('payment.failed',()=>setMessage('The payment attempt failed. You can retry within this checkout; the order has not been marked paid.'));checkout.open();
 }catch(e){setMessage((e as Error).message);active.current=false;setBusy(false);}}
 return <div className="checkout-banner"><h2>Complete your test payment</h2><p>Razorpay test checkout. No real money is charged. Stock is reserved until {order.paymentExpiresAt?new Date(order.paymentExpiresAt).toLocaleTimeString():''}; payment must be verified before fulfilment.</p>{message&&<p role="status">{message}</p>}<button className="primary" disabled={busy} onClick={pay}>{busy?'Opening or verifying payment…':'Pay with Razorpay · Test'}</button></div>;
}
