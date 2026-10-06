import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ListQuery, Product } from '@store/contracts';
import * as s from './schema.js';
export function catalogueRepository(db:NodePgDatabase<typeof s>) {
  async function hydrate(rows:(typeof s.products.$inferSelect)[]):Promise<Product[]> {
    if(!rows.length)return [];
    const ids=rows.map(p=>p.id);
    const [variantRows,imageRows,categoryRows]=await Promise.all([
      db.select({variant:s.variants,stock:s.inventory.available}).from(s.variants).leftJoin(s.inventory,eq(s.inventory.variantId,s.variants.id)).where(and(inArray(s.variants.productId,ids),eq(s.variants.active,true))).orderBy(asc(s.variants.pricePaise),asc(s.variants.id)),
      db.select().from(s.images).where(inArray(s.images.productId,ids)).orderBy(asc(s.images.position)),
      db.select().from(s.productCategories).where(inArray(s.productCategories.productId,ids)),
    ]);
    return rows.map(p=>({id:p.id,slug:p.slug,name:p.name,description:p.description,
      categories:categoryRows.filter(c=>c.productId===p.id).map(c=>c.categorySlug),
      images:imageRows.filter(i=>i.productId===p.id).map(i=>i.url),
      variants:variantRows.filter(v=>v.variant.productId===p.id).map(({variant,stock})=>({id:variant.id,sku:variant.sku,label:variant.label,pricePaise:variant.pricePaise,compareAtPaise:variant.compareAtPaise,colour:variant.colour,material:variant.material,gender:variant.gender,stock:stock??0})),
    }));
  }
  return {
    async list(query:ListQuery){
      const filters:SQL[]=[eq(s.products.active,true),sql`EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = ${s.products.id} AND v.active=true)`];
      if(query.q){const term='%'+query.q.replace(/[\\%_]/g,'\\$&')+'%';filters.push(sql`(${s.products.name} ILIKE ${term} OR ${s.products.description} ILIKE ${term})`);}
      if(query.category)filters.push(sql`EXISTS (SELECT 1 FROM product_categories c WHERE c.product_id = ${s.products.id} AND c.category_slug = ${query.category})`);
      const vf:SQL[]=[sql`v.product_id = ${s.products.id}`,sql`v.active=true`];
      if(query.colour)vf.push(sql`v.colour = ${query.colour}`);
      if(query.material)vf.push(sql`v.material = ${query.material}`);
      if(query.gender)vf.push(sql`v.gender = ${query.gender}`);
      if(query.minPrice!==undefined)vf.push(sql`v.price_paise >= ${query.minPrice}`);
      if(query.maxPrice!==undefined)vf.push(sql`v.price_paise <= ${query.maxPrice}`);
      filters.push(sql`EXISTS (SELECT 1 FROM product_variants v WHERE ${sql.join(vf,sql` AND `)})`);
      const minimum=sql`(SELECT min(v.price_paise) FROM product_variants v WHERE v.product_id = ${s.products.id} AND v.active=true)`;
      const order=query.sort==='name'?asc(s.products.name):query.sort==='price-asc'?asc(minimum):query.sort==='price-desc'?desc(minimum):asc(s.products.featuredRank);
      const where=and(...filters);
      const [rows,count]=await Promise.all([
        db.select().from(s.products).where(where).orderBy(order,asc(s.products.id)).limit(query.limit).offset((query.page-1)*query.limit),
        db.select({count:sql<number>`count(*)::int`}).from(s.products).where(where),
      ]);
      return {items:await hydrate(rows),total:count[0].count,page:query.page,limit:query.limit};
    },
    async product(slug:string){return (await hydrate(await db.select().from(s.products).where(and(eq(s.products.slug,slug),eq(s.products.active,true))).limit(1)))[0];},
    async variants(ids:string[]){
      return db.select({variant:s.variants,product:s.products,stock:s.inventory.available}).from(s.variants)
        .innerJoin(s.products,eq(s.products.id,s.variants.productId)).leftJoin(s.inventory,eq(s.inventory.variantId,s.variants.id))
        .where(and(inArray(s.variants.id,ids),eq(s.products.active,true),eq(s.variants.active,true)));
    },
    async firstImages(ids:string[]){return db.select().from(s.images).where(and(inArray(s.images.productId,ids),eq(s.images.position,0)));},
    async facets(){
      const [categories,values]=await Promise.all([
        db.select().from(s.categories).where(sql`EXISTS (SELECT 1 FROM product_categories c JOIN products p ON p.id=c.product_id WHERE c.category_slug=${s.categories.slug} AND p.active=true)`).orderBy(asc(s.categories.name)),
        db.selectDistinct({colour:s.variants.colour,material:s.variants.material,gender:s.variants.gender}).from(s.variants).innerJoin(s.products,eq(s.products.id,s.variants.productId)).where(and(eq(s.products.active,true),eq(s.variants.active,true))),
      ]);
      const unique=(key:'colour'|'material'|'gender')=>[...new Set(values.map(v=>v[key]))].sort();
      return {categories,colours:unique('colour'),materials:unique('material'),genders:unique('gender')};
    },
    async ready(){await db.execute(sql`SELECT 1`);},
  };
}
export type CatalogueRepository=ReturnType<typeof catalogueRepository>;
