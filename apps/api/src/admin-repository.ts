import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, lt, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { z } from 'zod';
import { adminListQuerySchema, type AdminProductInput, type AdminProduct } from '@store/contracts';
import { CommerceError } from './quote.js';
import * as s from './schema.js';
export function adminRepository(db:NodePgDatabase<typeof s>){
  async function product(id:string):Promise<AdminProduct>{
    const p=(await db.select().from(s.products).where(eq(s.products.id,id)))[0];
    if(!p)throw new CommerceError(404,'NOT_FOUND','Product not found');
    const [variants,images,categories]=await Promise.all([
      db.select({variant:s.variants,stock:s.inventory.available}).from(s.variants).leftJoin(s.inventory,eq(s.inventory.variantId,s.variants.id)).where(and(eq(s.variants.productId,id),eq(s.variants.active,true))).orderBy(asc(s.variants.id)),
      db.select().from(s.images).where(eq(s.images.productId,id)).orderBy(asc(s.images.position)),
      db.select().from(s.productCategories).where(eq(s.productCategories.productId,id)),
    ]);
    return {...p,updatedAt:p.updatedAt.toISOString(),images:images.map(i=>i.url),categories:categories.map(c=>c.categorySlug),variants:variants.map(({variant,stock})=>({id:variant.id,sku:variant.sku,label:variant.label,pricePaise:variant.pricePaise,compareAtPaise:variant.compareAtPaise,colour:variant.colour,material:variant.material,gender:variant.gender,stock:stock??0}))};
  }
  async function save(input:AdminProductInput,userId:string,id?:string,version?:number){
    const productId=id??randomUUID();
    try{
      await db.transaction(async tx=>{
        const known=await tx.select().from(s.categories).where(inArray(s.categories.slug,input.categories));
        if(known.length!==input.categories.length)throw new CommerceError(400,'UNKNOWN_CATEGORY','Choose an existing category or create it first');
        if(!id&&input.variants.some(v=>v.id))throw new CommerceError(400,'INVALID_VARIANT','New products cannot use existing variant IDs');
        const before=id?(await tx.select().from(s.products).where(eq(s.products.id,id)).for('update'))[0]:undefined;
        if(id&&!before)throw new CommerceError(404,'NOT_FOUND','Product not found');
        if(before&&before.version!==version)throw new CommerceError(409,'EDIT_CONFLICT','This product changed since you opened it. Reload the latest version before saving.');
        if(before&&before.slug!==input.slug)throw new CommerceError(409,'SLUG_LOCKED','The product URL cannot change after creation');
        const values={slug:input.slug,name:input.name,description:input.description,active:input.active,featuredRank:input.featuredRank,updatedAt:new Date()};
        if(id)await tx.update(s.products).set({...values,version:sql`${s.products.version}+1`}).where(eq(s.products.id,id));
        else await tx.insert(s.products).values({...values,id:productId});
        const existing=await tx.select({variant:s.variants,stock:s.inventory.available}).from(s.variants).leftJoin(s.inventory,eq(s.inventory.variantId,s.variants.id)).where(eq(s.variants.productId,productId));
        for(const v of input.variants){if(v.id&&!existing.some(e=>e.variant.id===v.id&&e.variant.active))throw new CommerceError(400,'INVALID_VARIANT','Variant does not belong to this product');}
        const oldIds=existing.filter(e=>e.variant.active).map(e=>e.variant.id);const retained=input.variants.flatMap(v=>v.id?[v.id]:[]);
        const removed=oldIds.filter(v=>!retained.includes(v));
        if(removed.length)await tx.update(s.variants).set({active:false}).where(inArray(s.variants.id,removed));
        const changes:unknown[]=[];
        for(const v of input.variants){
          const variantId=v.id??randomUUID();const {id:_id,stock,...variant}=v;
          const old=existing.find(e=>e.variant.id===variantId);
          if(old)await tx.update(s.variants).set({...variant,active:true}).where(eq(s.variants.id,variantId));
          else await tx.insert(s.variants).values({...variant,id:variantId,productId,active:true});
          await tx.insert(s.inventory).values({variantId,available:stock}).onConflictDoUpdate({target:s.inventory.variantId,set:{available:stock,updatedAt:new Date()}});
          if(!old||old.stock!==stock)await tx.insert(s.inventoryMovements).values({id:randomUUID(),variantId,userId,beforeQuantity:old?.stock??0,afterQuantity:stock,reason:'Admin catalogue adjustment'});
          if(!old||old.variant.pricePaise!==v.pricePaise||old.stock!==stock)changes.push({variantId,sku:v.sku,priceBefore:old?.variant.pricePaise??null,priceAfter:v.pricePaise,stockBefore:old?.stock??0,stockAfter:stock});
        }
        await tx.delete(s.images).where(eq(s.images.productId,productId));
        await tx.insert(s.images).values(input.images.map((url,position)=>({productId,position,url})));
        await tx.delete(s.productCategories).where(eq(s.productCategories.productId,productId));
        await tx.insert(s.productCategories).values(input.categories.map(categorySlug=>({productId,categorySlug})));
        await tx.insert(s.adminAudit).values({id:randomUUID(),userId,action:id?'product.updated':'product.created',entityId:productId,details:{name:input.name,active:input.active,changes,removedVariantIds:removed,previousVersion:before?.version??null}});
      });
    }catch(error){
      const cause=(error as {cause?:{code?:string}})?.cause;
      if(cause?.code==='23505'||(error as {code?:string})?.code==='23505')throw new CommerceError(409,'DUPLICATE_VALUE','The product URL or SKU already exists. Use a unique value.');
      throw error;
    }
    return product(productId);
  }
  return {
    product,save,
    async list(query:z.infer<typeof adminListQuerySchema>){
      const where:SQL[]=[];
      if(query.q){const term='%'+query.q.replace(/[\\%_]/g,'\\$&')+'%';where.push(sql`(${s.products.name} ILIKE ${term} OR ${s.products.slug} ILIKE ${term})`);}
      if(query.status!=='all')where.push(eq(s.products.active,query.status==='active'));
      const [rows,total]=await Promise.all([db.select({id:s.products.id}).from(s.products).where(and(...where)).orderBy(desc(s.products.updatedAt),asc(s.products.id)).limit(query.limit).offset((query.page-1)*query.limit),db.select({count:sql<number>`count(*)::int`}).from(s.products).where(and(...where))]);
      return {items:await Promise.all(rows.map(r=>product(r.id))),total:total[0].count,page:query.page,limit:query.limit};
    },
    async summary(){
      const [counts,stock]=await Promise.all([db.select({total:sql<number>`count(*)::int`,active:sql<number>`count(*) FILTER (WHERE active)::int`}).from(s.products),db.select({count:sql<number>`count(*)::int`}).from(s.variants).innerJoin(s.products,eq(s.products.id,s.variants.productId)).innerJoin(s.inventory,eq(s.inventory.variantId,s.variants.id)).where(and(eq(s.products.active,true),eq(s.variants.active,true),sql`${s.inventory.available}<=3`))]);
      return {totalProducts:counts[0].total,activeProducts:counts[0].active,lowStockVariants:stock[0].count};
    },
    categories:()=>db.select().from(s.categories).orderBy(asc(s.categories.name)),
    async createCategory(value:{slug:string,name:string},userId:string){
      try{await db.transaction(async tx=>{await tx.insert(s.categories).values(value);await tx.insert(s.adminAudit).values({id:randomUUID(),userId,action:'category.created',entityId:value.slug,details:value});});}
      catch(error){if((error as {cause?:{code?:string}})?.cause?.code==='23505')throw new CommerceError(409,'DUPLICATE_VALUE','This category already exists');throw error;}return value;
    },
    async audit(){const rows=await db.select({id:s.adminAudit.id,action:s.adminAudit.action,entityId:s.adminAudit.entityId,userName:s.adminUsers.name,createdAt:s.adminAudit.createdAt,details:s.adminAudit.details}).from(s.adminAudit).innerJoin(s.adminUsers,eq(s.adminUsers.id,s.adminAudit.userId)).orderBy(desc(s.adminAudit.createdAt),desc(s.adminAudit.id)).limit(30);return rows.map(r=>({...r,createdAt:r.createdAt.toISOString()}));},
    async record(userId:string,action:string,entityId:string,details:unknown){await db.insert(s.adminAudit).values({id:randomUUID(),userId,action,entityId,details});},
    async user(email:string){return (await db.select().from(s.adminUsers).where(eq(s.adminUsers.email,email)))[0];},
    async failedLogin(id:string){await db.update(s.adminUsers).set({failedAttempts:sql`CASE WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1 ELSE failed_attempts+1 END`,lockedUntil:sql`CASE WHEN locked_until IS NOT NULL AND locked_until <= now() THEN NULL WHEN failed_attempts+1 >= 8 THEN now()+interval '15 minutes' ELSE locked_until END`}).where(eq(s.adminUsers.id,id));},
    async startSession(userId:string,tokenHash:string,expiresAt:Date){await db.transaction(async tx=>{await tx.update(s.adminUsers).set({failedAttempts:0,lockedUntil:null}).where(eq(s.adminUsers.id,userId));await tx.delete(s.adminSessions).where(lt(s.adminSessions.expiresAt,new Date()));await tx.insert(s.adminSessions).values({tokenHash,userId,expiresAt});});},
    async session(tokenHash:string){return (await db.select({user:s.adminUsers,session:s.adminSessions}).from(s.adminSessions).innerJoin(s.adminUsers,eq(s.adminUsers.id,s.adminSessions.userId)).where(and(eq(s.adminSessions.tokenHash,tokenHash),gt(s.adminSessions.expiresAt,new Date()),eq(s.adminUsers.active,true))))[0];},
    async endSession(tokenHash:string){await db.delete(s.adminSessions).where(eq(s.adminSessions.tokenHash,tokenHash));},
  };
}
export type AdminRepository=ReturnType<typeof adminRepository>;
