import { migrateTestDb } from './migrate-test-db.js';
// Disposable integration preview using PostgreSQL WASM; not the production database.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createApp } from '../apps/api/src/app.js';
import { catalogueRepository } from '../apps/api/src/catalogue.js';
import { seedData } from '../apps/api/src/seed-data.js';
import * as schema from '../apps/api/src/schema.js';
const pg=new PGlite();await migrateTestDb(pg);
const db=drizzle(pg,{schema}) as unknown as NodePgDatabase<typeof schema>;
await seedData(db,JSON.parse(await readFile(new URL('../database/seeds.json',import.meta.url),'utf8')));
const app=await createApp(catalogueRepository(db),{origins:['http://localhost:4321','http://localhost:4322'],logger:false});
await app.listen({host:'127.0.0.1',port:3001});console.log('Disposable PostgreSQL test API on port 3001');
const stop=async()=>{await app.close();await pg.close();process.exit(0);};process.on('SIGTERM',stop);process.on('SIGINT',stop);
