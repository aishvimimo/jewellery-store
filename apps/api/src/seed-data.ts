import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Product } from '@store/contracts';
import * as s from './schema.js';
export async function seedData(db:NodePgDatabase<typeof s>,data:Product[]){
  await db.transaction(async tx=>{
    const names:Record<string,string>={'jewellery-sets':'Jewellery Sets','bracelets':'Bracelets','necklaces':'Necklaces','rings':'Rings','earrings':'Earrings'};
    for(const [slug,name] of Object.entries(names))await tx.insert(s.categories).values({slug,name}).onConflictDoNothing();
    for(const [rank,p] of data.entries()) {
      await tx.insert(s.products).values({id:p.id,slug:p.slug,name:p.name,description:p.description,featuredRank:rank}).onConflictDoNothing();
      for(const slug of p.categories)await tx.insert(s.productCategories).values({productId:p.id,categorySlug:slug}).onConflictDoNothing();
      for(const [position,url] of p.images.entries())await tx.insert(s.images).values({productId:p.id,position,url}).onConflictDoNothing();
      for(const v of p.variants){
        const {stock,...variant}=v;
        await tx.insert(s.variants).values({...variant,productId:p.id}).onConflictDoNothing();
        await tx.insert(s.inventory).values({variantId:v.id,available:stock}).onConflictDoNothing();
      }
    }
  });
}
