import { z } from 'zod';

export const variantSchema = z.object({
  id: z.string(), sku: z.string(), label: z.string(),
  pricePaise: z.number().int().nonnegative(), compareAtPaise: z.number().int().nonnegative().nullable(),
  colour: z.string(), material: z.string(), gender: z.string(), stock: z.number().int().nonnegative(),
});
export const productSchema = z.object({
  id: z.string(), slug: z.string(), name: z.string(), description: z.string(),
  categories: z.array(z.string()), images: z.array(z.string()), variants: z.array(variantSchema).min(1),
});
export type Product = z.infer<typeof productSchema>;
export type Variant = z.infer<typeof variantSchema>;
export const listQuerySchema = z.object({
  q: z.string().trim().max(100).default(''), category: z.string().max(80).optional(),
  colour: z.string().max(80).optional(), material: z.string().max(100).optional(), gender: z.string().max(80).optional(),
  minPrice: z.coerce.number().int().min(0).max(100000000).optional(),
  maxPrice: z.coerce.number().int().min(0).max(100000000).optional(),
  sort: z.enum(['featured','name','price-asc','price-desc']).default('featured'),
  page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(48).default(12),
}).strict().refine(v => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice,
  {message: 'Minimum price must not exceed maximum price'});
export type ListQuery = z.infer<typeof listQuerySchema>;
export const categorySchema = z.object({slug:z.string(), name:z.string()});
export const facetsSchema = z.object({ categories:z.array(categorySchema), colours:z.array(z.string()), materials:z.array(z.string()), genders:z.array(z.string()) });
export const productListSchema = z.object({items:z.array(productSchema),total:z.number().int(),page:z.number().int(),limit:z.number().int()});
export const cartLineSchema = z.object({variantId:z.string().min(1).max(80),quantity:z.number().int().min(1).max(20)}).strict();
export type CartLine = z.infer<typeof cartLineSchema>;
export const quoteRequestSchema = z.object({
  items:z.array(cartLineSchema).min(1).max(50),
  coupon:z.string().trim().max(30).transform(v=>v.toUpperCase()).default(''),
  prepaid:z.boolean().default(false), giftWrap:z.boolean().default(false),
  delivery:z.enum(['standard','express']).default('standard'),
  postalCode:z.string().regex(/^[1-9]\d{5}$/, 'Enter a valid six-digit Indian PIN code').optional(),
}).strict().refine(v=>new Set(v.items.map(i=>i.variantId)).size===v.items.length,{message:'Duplicate variants are not allowed'});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
export const quoteSchema = z.object({
  currency:z.literal('INR'), expiresAt:z.string(),
  lines:z.array(z.object({variantId:z.string(),productSlug:z.string(),name:z.string(),label:z.string(),image:z.string(),quantity:z.number().int(),unitPricePaise:z.number().int(),lineTotalPaise:z.number().int(),stock:z.number().int()})),
  subtotalPaise:z.number().int(),couponDiscountPaise:z.number().int(),prepaidDiscountPaise:z.number().int(),
  shippingPaise:z.number().int(),giftWrapPaise:z.number().int(),totalPaise:z.number().int(),
  coupon:z.string(), notices:z.array(z.string()),
});
export type Quote = z.infer<typeof quoteSchema>;
export const promotions = {
  festiveThresholdPaise:150000, festiveDiscountPaise:22500, prepaidDiscountBps:500,
  welcomeDiscountBps:1000, freeShippingThresholdPaise:149900, standardShippingPaise:7900,
  expressExtraPaise:9900, giftWrapPaise:4900,
} as const;
export function money(paise:number) {
  return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:paise % 100 === 0 ? 0 : 2}).format(paise/100);
}

// Admin contracts are shared; permission enforcement remains exclusively on the API.
export const slugSchema=z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/,'Use lowercase letters, numbers and hyphens');
export const imageUrlSchema=z.string().trim().max(2000).refine(value=>{
  if(/^\/assets\/[a-zA-Z0-9_./-]+$/.test(value)&&!value.includes('..'))return true;
  try{const u=new URL(value);return !u.username&&!u.password&&(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)));}catch{return false;}
},'Use an HTTPS image URL, a localhost upload URL or an /assets/ path');
export const adminVariantInput=z.object({
  id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional(),
  sku:z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/).transform(v=>v.toUpperCase()),
  label:z.string().trim().min(1).max(100),pricePaise:z.number().int().min(1).max(100000000),
  compareAtPaise:z.number().int().min(1).max(100000000).nullable(),
  colour:z.string().trim().min(1).max(80),material:z.string().trim().min(1).max(100),gender:z.string().trim().min(1).max(80),
  stock:z.number().int().min(0).max(1000000),
}).strict().refine(v=>v.compareAtPaise===null||v.compareAtPaise>=v.pricePaise,{message:'Original price must be at least the selling price',path:['compareAtPaise']});
export const adminProductInputSchema=z.object({
  slug:slugSchema,name:z.string().trim().min(1).max(200),description:z.string().trim().min(1).max(6000),
  active:z.boolean(),featuredRank:z.number().int().min(0).max(100000),
  categories:z.array(slugSchema).min(1).max(10),images:z.array(imageUrlSchema).min(1).max(12),
  variants:z.array(adminVariantInput).min(1).max(20),
}).strict().superRefine((p,ctx)=>{
  if(new Set(p.categories).size!==p.categories.length)ctx.addIssue({code:'custom',message:'Duplicate categories',path:['categories']});
  if(new Set(p.variants.map(v=>v.sku)).size!==p.variants.length)ctx.addIssue({code:'custom',message:'Each variant needs a unique SKU',path:['variants']});
  const ids=p.variants.flatMap(v=>v.id?[v.id]:[]);
  if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'Duplicate variant IDs',path:['variants']});
});
export type AdminProductInput=z.infer<typeof adminProductInputSchema>;
export const adminProductSchema=productSchema.extend({active:z.boolean(),featuredRank:z.number().int(),version:z.number().int(),updatedAt:z.string()});
export type AdminProduct=z.infer<typeof adminProductSchema>;
export const adminUserSchema=z.object({id:z.string(),email:z.string(),name:z.string(),role:z.enum(['admin','viewer'])});
export type AdminUser=z.infer<typeof adminUserSchema>;
export const adminSessionSchema=z.object({user:adminUserSchema.nullable(),csrfToken:z.string().nullable()});
export const adminListSchema=z.object({items:z.array(adminProductSchema),total:z.number().int(),page:z.number().int(),limit:z.number().int()});
export const adminSummarySchema=z.object({totalProducts:z.number().int(),activeProducts:z.number().int(),lowStockVariants:z.number().int()});
export const adminCategoryInputSchema=z.object({slug:slugSchema,name:z.string().trim().min(1).max(80)}).strict();
export const adminLoginSchema=z.object({email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),password:z.string().min(1).max(128)}).strict();
export const adminListQuerySchema=z.object({q:z.string().trim().max(100).default(''),status:z.enum(['all','active','draft']).default('all'),page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
export const adminAuditSchema=z.array(z.object({id:z.string(),action:z.string(),entityId:z.string(),userName:z.string(),createdAt:z.string(),details:z.unknown()}));

// Orders use server-calculated snapshots. No card or banking data is accepted.
export const orderStatusSchema=z.enum(['pending','confirmed','shipped','delivered','cancelled']);
export const orderModeSchema=z.enum(['test','live','disabled']);
export const customerSchema=z.object({name:z.string().trim().min(2).max(120),email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),phone:z.string().trim().regex(/^[6-9][0-9]{9}$/,'Enter a ten-digit Indian mobile number')}).strict();
export const addressSchema=z.object({line1:z.string().trim().min(5).max(200),line2:z.string().trim().max(200).default(''),city:z.string().trim().min(2).max(100),state:z.string().trim().min(2).max(100),postalCode:z.string().regex(/^[1-9][0-9]{5}$/),country:z.literal('IN').default('IN')}).strict();
export const orderRequestSchema=z.object({
 expectedMode:z.enum(['test','live']),checkoutKey:z.string().uuid(),receiptSecret:z.string().regex(/^[a-f0-9]{64}$/),
 items:z.array(cartLineSchema).min(1).max(50),coupon:z.string().trim().max(30).transform(v=>v.toUpperCase()).default(''),giftWrap:z.boolean().default(false),
 delivery:z.enum(['standard','express']).default('standard'),paymentMethod:z.enum(['cod','online']),
 customer:customerSchema,address:addressSchema,expectedTotalPaise:z.number().int().min(1).max(200000000000),
}).strict().refine(v=>new Set(v.items.map(i=>i.variantId)).size===v.items.length,{message:'Duplicate variants are not allowed'});
export type OrderRequest=z.infer<typeof orderRequestSchema>;
export const orderTotalsSchema=quoteSchema.pick({currency:true,subtotalPaise:true,couponDiscountPaise:true,prepaidDiscountPaise:true,shippingPaise:true,giftWrapPaise:true,totalPaise:true,coupon:true});
export const orderLineSchema=z.object({variantId:z.string(),productId:z.string(),productSlug:z.string(),sku:z.string(),name:z.string(),label:z.string(),image:z.string(),quantity:z.number().int().positive(),unitPricePaise:z.number().int(),lineTotalPaise:z.number().int()});
export const orderReceiptSchema=z.object({id:z.string(),number:z.string(),mode:z.enum(['test','live']),status:orderStatusSchema,paymentMethod:z.enum(['cod','online']),paymentStatus:z.enum(['unpaid','collected','pending','paid','review','refunded']),createdAt:z.string(),delivery:z.enum(['standard','express']),giftWrap:z.boolean(),paymentExpiresAt:z.string().nullable(),totals:orderTotalsSchema,lines:z.array(orderLineSchema)});
export type OrderReceipt=z.infer<typeof orderReceiptSchema>;
export const customerOrderSchema=orderReceiptSchema.extend({tracking:z.object({carrier:z.string(),number:z.string()}).nullable(),events:z.array(z.object({id:z.string(),status:orderStatusSchema,paymentStatus:z.enum(['unpaid','collected','pending','paid','review','refunded']),createdAt:z.string()}))});
export type CustomerOrder=z.infer<typeof customerOrderSchema>;
export const orderEventSchema=z.object({id:z.string(),status:orderStatusSchema,paymentStatus:z.enum(['unpaid','collected','pending','paid','review','refunded']),note:z.string(),createdAt:z.string(),userName:z.string().nullable()});
export const adminOrderSchema=orderReceiptSchema.extend({version:z.number().int(),customer:customerSchema,address:addressSchema,events:z.array(orderEventSchema),tracking:z.object({carrier:z.string(),number:z.string()}).nullable(),payment:z.object({gatewayOrderId:z.string().nullable(),paymentId:z.string().nullable(),state:z.string(),lastCheckedAt:z.string().nullable(),issue:z.string().nullable()}).nullable()});
export type AdminOrder=z.infer<typeof adminOrderSchema>;
export const adminOrderListSchema=z.object({items:z.array(orderReceiptSchema.extend({version:z.number().int(),customerName:z.string()})),total:z.number().int(),page:z.number().int(),limit:z.number().int()});
export const orderListQuerySchema=z.object({q:z.string().trim().max(100).default(''),status:z.enum(['all','pending','confirmed','shipped','delivered','cancelled']).default('all'),mode:z.enum(['all','test','live']).default('all'),page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
export const orderUpdateSchema=z.object({version:z.number().int().min(1),status:orderStatusSchema,paymentCollected:z.boolean().default(false),note:z.string().trim().max(500).default(''),tracking:z.object({carrier:z.string().trim().min(1).max(100),number:z.string().trim().min(1).max(100)}).strict().optional()}).strict();
export const checkoutConfigSchema=z.object({mode:orderModeSchema,paymentMethods:z.array(z.enum(['cod','online'])),pinPrefixes:z.array(z.string())});

export const paymentAccessSchema=z.object({id:z.string().uuid(),secret:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const paymentVerifySchema=paymentAccessSchema.extend({razorpay_order_id:z.string().regex(/^order_[A-Za-z0-9]+$/).max(80),razorpay_payment_id:z.string().regex(/^pay_[A-Za-z0-9]+$/).max(80),razorpay_signature:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const paymentSessionSchema=z.object({keyId:z.string(),gatewayOrderId:z.string(),amountPaise:z.number().int(),currency:z.literal('INR'),expiresAt:z.string(),mode:z.literal('test')});

export const customerUserSchema=z.object({id:z.string(),email:z.string().email(),name:z.string(),verified:z.boolean()});
export type CustomerUser=z.infer<typeof customerUserSchema>;
export const customerSessionSchema=z.object({user:customerUserSchema.nullable(),csrfToken:z.string().nullable()});
export const accountRegisterSchema=z.object({email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),name:z.string().trim().min(2).max(120),password:z.string().min(12).max(128)}).strict();
export const accountLoginSchema=accountRegisterSchema.omit({name:true});
export const tokenActionSchema=z.object({token:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const passwordResetSchema=tokenActionSchema.extend({password:z.string().min(12).max(128)});
export const returnStateSchema=z.enum(['requested','approved','rejected','received','refund_pending','refunded','closed']);
export const returnRequestSchema=z.object({orderId:z.string().uuid(),requestKey:z.string().uuid(),kind:z.enum(['cancel','return']),reason:z.string().trim().min(5).max(1000)}).strict();
export const returnRecordSchema=z.object({id:z.string(),orderId:z.string(),number:z.string(),mode:z.enum(['test','live']),kind:z.enum(['cancel','return']),reason:z.string(),state:returnStateSchema,response:z.string(),version:z.number().int(),amountPaise:z.number().int(),restocked:z.boolean(),refundState:z.string(),createdAt:z.string(),updatedAt:z.string(),events:z.array(z.object({id:z.string(),state:z.string(),note:z.string(),createdAt:z.string()}))});
export type ReturnRecord=z.infer<typeof returnRecordSchema>;
export const adminReturnRecordSchema=returnRecordSchema.extend({refundId:z.string().nullable(),refundIssue:z.string().nullable(),manualReference:z.string().nullable()});
export const returnReviewSchema=z.object({version:z.number().int().min(1),action:z.enum(['approve','reject','receive','restock','refund','check','manual-refund','adopt-refund','close']),response:z.string().trim().max(1000).default(''),reference:z.string().trim().max(120).default('')}).strict();
export const customerOrderListSchema=z.object({items:z.array(orderReceiptSchema),total:z.number().int(),page:z.number().int(),limit:z.number().int()});
export const mailListSchema=z.array(z.object({id:z.string(),recipient:z.string(),subject:z.string(),state:z.string(),attempts:z.number(),issue:z.string().nullable(),createdAt:z.string(),previewAvailable:z.boolean()}));
export const mailPreviewSchema=z.object({recipient:z.string(),subject:z.string(),text:z.string()});
