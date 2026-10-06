import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { connectDatabase } from './db.js';
const {pool}=connectDatabase();
try {
  const client=await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(81270603)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const dir=resolve(process.cwd(),'../../database/migrations');
    for(const name of (await readdir(dir)).filter(s=>s.endsWith('.sql')).sort()) {
      const text=await readFile(resolve(dir,name),'utf8');
      const checksum=createHash('sha256').update(text).digest('hex');
      const old=await client.query('SELECT checksum FROM schema_migrations WHERE name=$1',[name]);
      if(old.rows.length){if(old.rows[0].checksum!==checksum)throw new Error('Applied migration was modified: '+name);continue;}
      await client.query('BEGIN');
      try{await client.query(text);await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);await client.query('COMMIT');console.log('Applied '+name);}
      catch(e){await client.query('ROLLBACK');throw e;}
    }
  } finally {await client.query('SELECT pg_advisory_unlock(81270603)');client.release();}
} finally {await pool.end();}
