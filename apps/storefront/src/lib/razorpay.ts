export type RazorpayResult={razorpay_order_id:string,razorpay_payment_id:string,razorpay_signature:string};
export type RazorpayOptions={key:string,order_id:string,amount:number,currency:string,name:string,description:string,theme:{color:string},handler:(result:RazorpayResult)=>void,modal:{ondismiss:()=>void}};
declare global{interface Window{Razorpay?:new(options:RazorpayOptions)=>{open:()=>void,on:(event:string,handler:()=>void)=>void};}}
let loading:Promise<void>|undefined;
export function loadRazorpay(){
 if(window.Razorpay)return Promise.resolve();
 if(!loading)loading=new Promise<void>((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;
  const timer=setTimeout(()=>{script.remove();reject(new Error('Payment checkout could not load. Retry this order.'));},15000);
  script.onload=()=>{clearTimeout(timer);if(window.Razorpay)resolve();else reject(new Error('Payment checkout is unavailable'));};script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('Payment checkout could not load. Check your connection.'));};document.head.append(script);
 }).catch(e=>{loading=undefined;throw e;});return loading;
}
