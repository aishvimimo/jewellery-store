import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { productSchema } from '@store/contracts';
import { connectDatabase } from './db.js';
import { seedData } from './seed-data.js';
const {db,pool,env}=connectDatabase();
try{
  if(env.NODE_ENV==='production' && process.env.ALLOW_SAMPLE_SEED!=='true')throw new Error('Sample seed disabled in production. Import your real catalogue instead.');
  const data=z.array(productSchema).parse(JSON.parse(await readFile(resolve(process.cwd(),'../../database/seeds.json'),'utf8')));
  await seedData(db,data);console.log('Seeded '+data.length+' sample products without resetting existing inventory.');
}finally{await pool.end();}
