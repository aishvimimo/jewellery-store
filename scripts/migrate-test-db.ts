import { readFile,readdir } from 'node:fs/promises';
export async function migrateTestDb(db:{exec(sql:string):Promise<unknown>}){
 const dir=new URL('../database/migrations/',import.meta.url);
 for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,dir),'utf8'));
}
