import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { readEnv } from './env.js';
export function connectDatabase(){
  const env=readEnv();
  const pool=new pg.Pool({connectionString:env.DATABASE_URL,max:env.DB_POOL_MAX,
    ssl:env.DATABASE_SSL==='require'?{rejectUnauthorized:true}:false,
    connectionTimeoutMillis:5000,idleTimeoutMillis:30000,
    statement_timeout:10000,
  });
  pool.on('error',()=>console.error('Idle database connection failed'));
  return {pool,db:drizzle(pool,{schema}),env};
}
