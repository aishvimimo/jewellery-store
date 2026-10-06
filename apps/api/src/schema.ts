import { pgTable, text, integer, boolean, timestamp, primaryKey, jsonb, bigint } from 'drizzle-orm/pg-core';
export const products = pgTable('products', {
  id:text('id').primaryKey(), slug:text('slug').notNull().unique(), name:text('name').notNull(),
  description:text('description').notNull(), active:boolean('active').notNull().default(true),
  version:integer('version').notNull().default(1), featuredRank:integer('featured_rank').notNull().default(0), updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
});
export const categories = pgTable('categories',{slug:text('slug').primaryKey(),name:text('name').notNull()});
export const productCategories = pgTable('product_categories',{
  productId:text('product_id').notNull().references(()=>products.id,{onDelete:'cascade'}),
  categorySlug:text('category_slug').notNull().references(()=>categories.slug,{onDelete:'cascade'}),
}, t=>[primaryKey({columns:[t.productId,t.categorySlug]})]);
export const variants = pgTable('product_variants',{
  id:text('id').primaryKey(),productId:text('product_id').notNull().references(()=>products.id,{onDelete:'cascade'}),
  active:boolean('active').notNull().default(true), sku:text('sku').notNull().unique(),label:text('label').notNull(),pricePaise:integer('price_paise').notNull(),
  compareAtPaise:integer('compare_at_paise'),colour:text('colour').notNull(),material:text('material').notNull(),gender:text('gender').notNull(),
});
export const inventory=pgTable('inventory',{
  variantId:text('variant_id').primaryKey().references(()=>variants.id,{onDelete:'cascade'}),
  available:integer('available').notNull().default(0),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
});
export const images=pgTable('product_images',{
  productId:text('product_id').notNull().references(()=>products.id,{onDelete:'cascade'}),
  position:integer('position').notNull(),url:text('url').notNull(),
},t=>[primaryKey({columns:[t.productId,t.position]})]);
export const adminUsers=pgTable('admin_users',{
 id:text('id').primaryKey(),email:text('email').notNull().unique(),name:text('name').notNull(),passwordHash:text('password_hash').notNull(),
 role:text('role').notNull().default('admin'),active:boolean('active').notNull().default(true),failedAttempts:integer('failed_attempts').notNull().default(0),
 lockedUntil:timestamp('locked_until',{withTimezone:true}),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
});
export const adminSessions=pgTable('admin_sessions',{
 tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull().references(()=>adminUsers.id,{onDelete:'cascade'}),
 expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
});
export const adminAudit=pgTable('admin_audit_logs',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>adminUsers.id),action:text('action').notNull(),entityId:text('entity_id').notNull(),details:jsonb('details').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
});
export const inventoryMovements=pgTable('inventory_movements',{
 id:text('id').primaryKey(),variantId:text('variant_id').notNull().references(()=>variants.id),userId:text('user_id').references(()=>adminUsers.id),orderId:text('order_id').references(()=>orders.id),
 beforeQuantity:integer('before_quantity').notNull(),afterQuantity:integer('after_quantity').notNull(),reason:text('reason').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
});

export const orders=pgTable('orders',{
 customerId:text('customer_id').references(()=>customers.id),
 id:text('id').primaryKey(),number:text('number').notNull().unique(),checkoutKey:text('checkout_key').notNull().unique(),receiptSecretHash:text('receipt_secret_hash').notNull(),requestHash:text('request_hash').notNull(),
 mode:text('mode').notNull(),status:text('status').notNull().default('pending'),paymentMethod:text('payment_method').notNull().default('cod'),paymentStatus:text('payment_status').notNull().default('unpaid'),version:integer('version').notNull().default(1),
 customer:jsonb('customer').notNull(),address:jsonb('address').notNull(),totals:jsonb('totals').notNull(),totalPaise:bigint('total_paise',{mode:'number'}).notNull(),delivery:text('delivery').notNull(),giftWrap:boolean('gift_wrap').notNull(),tracking:jsonb('tracking'),paymentExpiresAt:timestamp('payment_expires_at',{withTimezone:true}),inventoryReleased:boolean('inventory_released').notNull().default(false),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
});
export const orderLines=pgTable('order_lines',{
 orderId:text('order_id').notNull().references(()=>orders.id),variantId:text('variant_id').notNull().references(()=>variants.id),productId:text('product_id').notNull().references(()=>products.id),productSlug:text('product_slug').notNull(),sku:text('sku').notNull(),name:text('name').notNull(),label:text('label').notNull(),image:text('image').notNull(),quantity:integer('quantity').notNull(),unitPricePaise:bigint('unit_price_paise',{mode:'number'}).notNull(),lineTotalPaise:bigint('line_total_paise',{mode:'number'}).notNull(),
},t=>[primaryKey({columns:[t.orderId,t.variantId]})]);
export const orderEvents=pgTable('order_events',{
 id:text('id').primaryKey(),orderId:text('order_id').notNull().references(()=>orders.id),userId:text('user_id').references(()=>adminUsers.id),status:text('status').notNull(),paymentStatus:text('payment_status').notNull(),note:text('note').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
});

export const paymentSessions=pgTable('payment_sessions',{
 orderId:text('order_id').primaryKey().references(()=>orders.id),keyId:text('key_id').notNull(),gatewayOrderId:text('gateway_order_id').unique(),paymentId:text('payment_id').unique(),state:text('state').notNull(),issue:text('issue'),lastCheckedAt:timestamp('last_checked_at',{withTimezone:true}),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
});
export const paymentWebhookEvents=pgTable('payment_webhook_events',{
 id:text('id').primaryKey(),bodyHash:text('body_hash').notNull(),eventType:text('event_type').notNull(),processedAt:timestamp('processed_at',{withTimezone:true}).notNull().defaultNow(),
});

export const customers=pgTable('customers',{id:text('id').primaryKey(),email:text('email').notNull().unique(),name:text('name').notNull(),passwordHash:text('password_hash').notNull(),verifiedAt:timestamp('verified_at',{withTimezone:true}),failedLogins:integer('failed_logins').notNull().default(0),lockedUntil:timestamp('locked_until',{withTimezone:true}),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()});
export const customerSessions=pgTable('customer_sessions',{tokenHash:text('token_hash').primaryKey(),customerId:text('customer_id').notNull().references(()=>customers.id),expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()});
export const customerTokens=pgTable('customer_tokens',{tokenHash:text('token_hash').primaryKey(),customerId:text('customer_id').notNull().references(()=>customers.id),purpose:text('purpose').notNull(),expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),usedAt:timestamp('used_at',{withTimezone:true}),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()});
export const emailOutbox=pgTable('email_outbox',{id:text('id').primaryKey(),eventKey:text('event_key').notNull().unique(),recipient:text('recipient').notNull(),subject:text('subject').notNull(),encryptedPayload:text('encrypted_payload'),state:text('state').notNull().default('queued'),attempts:integer('attempts').notNull().default(0),firstAttemptAt:timestamp('first_attempt_at',{withTimezone:true}),availableAt:timestamp('available_at',{withTimezone:true}).notNull().defaultNow(),validUntil:timestamp('valid_until',{withTimezone:true}),providerId:text('provider_id'),issue:text('issue'),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()});
export const returnRequests=pgTable('return_requests',{id:text('id').primaryKey(),orderId:text('order_id').notNull().references(()=>orders.id),customerId:text('customer_id').references(()=>customers.id),requestKey:text('request_key').notNull().unique(),kind:text('kind').notNull(),reason:text('reason').notNull(),state:text('state').notNull().default('requested'),response:text('response').notNull().default(''),version:integer('version').notNull().default(1),amountPaise:bigint('amount_paise',{mode:'number'}).notNull(),restocked:boolean('restocked').notNull().default(false),refundState:text('refund_state').notNull().default('none'),gatewayKeyId:text('gateway_key_id'),paymentId:text('payment_id'),refundId:text('refund_id').unique(),refundIssue:text('refund_issue'),manualReference:text('manual_reference'),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow()});
export const returnEvents=pgTable('return_events',{id:text('id').primaryKey(),requestId:text('request_id').notNull().references(()=>returnRequests.id),userId:text('user_id').references(()=>adminUsers.id),state:text('state').notNull(),note:text('note').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()});
