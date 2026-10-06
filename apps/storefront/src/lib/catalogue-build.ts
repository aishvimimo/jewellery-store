import { z } from 'zod';
import { productListSchema, facetsSchema, productSchema, type Product } from '@store/contracts';
import sample from '../../../../database/seeds.json';
const url=import.meta.env.CATALOG_API_URL || import.meta.env.PUBLIC_API_URL || 'http://localhost:3001';
export const usingSamples=import.meta.env.ALLOW_SAMPLE_CATALOG==='true';
export async function buildCatalogue():Promise<Product[]>{
  if(usingSamples)return z.array(productSchema).parse(sample);
  const items:Product[]=[];let page=1;
  try {
    while(true){
      const response=await fetch(`${url}/api/v1/products?limit=48&page=${page}`,{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Catalogue API returned '+response.status);
      const result=productListSchema.parse(await response.json());items.push(...result.items);
      if(items.length>=result.total)break;
      if(!result.items.length)throw new Error('Catalogue pagination returned an empty page');
      page++;
    }
    return items;
  }catch(error){throw new Error('Cannot build catalogue. Start the API and seed PostgreSQL, or set CATALOG_API_URL to a reachable API. Offline samples require ALLOW_SAMPLE_CATALOG=true.',{cause:error});}
}
export async function buildFacets(){
  if(usingSamples){const items=await buildCatalogue();const variants=items.flatMap(p=>p.variants);return {categories:[...new Set(items.flatMap(p=>p.categories))].map(slug=>({slug,name:slug.replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase())})),colours:[...new Set(variants.map(v=>v.colour))],materials:[...new Set(variants.map(v=>v.material))],genders:[...new Set(variants.map(v=>v.gender))]};}
  const response=await fetch(url+'/api/v1/facets',{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Unable to load catalogue facets');return facetsSchema.parse(await response.json());
}
