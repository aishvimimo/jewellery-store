import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { rotateDevelopmentEmailKey } from '../src/rotate-email-key.js';
function encrypt(text: string, key: string) {
 const iv=randomBytes(12), c=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
 const body=Buffer.concat([c.update(text,'utf8'),c.final()]);
 return [iv,c.getAuthTag(),body].map(b=>b.toString('base64')).join('.');
}
function decrypt(value: string, key: string) {
 const [iv,tag,body]=value.split('.').map(v=>Buffer.from(v,'base64'));
 const c=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);c.setAuthTag(tag);
 return Buffer.concat([c.update(body),c.final()]).toString('utf8');
}
test('development email rotation preserves content and state, skips nulls and is repeatable',async()=>{
 const db=new PGlite(), key=randomBytes(32).toString('hex');
 try {
 await db.exec('CREATE TABLE email_outbox(id text PRIMARY KEY,encrypted_payload text,state text);');
 await db.query('INSERT INTO email_outbox VALUES ($1,$2,$3)', ['old',encrypt('private verification link','1'.repeat(64)),'preview']);
 await db.query('INSERT INTO email_outbox VALUES ($1,$2,$3)', ['new',encrypt('queued message',key),'queued']);
 await db.exec("INSERT INTO email_outbox VALUES ('sent',NULL,'sent');");
 assert.equal(await rotateDevelopmentEmailKey(db,key),1);
 const {rows}=await db.query<any>('SELECT * FROM email_outbox ORDER BY id');
 assert.equal(decrypt(rows.find(r=>r.id==='old').encrypted_payload,key),'private verification link');
 assert.equal(rows.find(r=>r.id==='old').state,'preview');
 assert.equal(rows.find(r=>r.id==='sent').encrypted_payload,null);
 assert.equal(await rotateDevelopmentEmailKey(db,key),0);
 } finally {await db.close();}
});
test('an unreadable payload rolls back the complete batch and the public fallback cannot be a destination',async()=>{
 const db=new PGlite(), key=randomBytes(32).toString('hex');
 try {
 await db.exec('CREATE TABLE email_outbox(id text PRIMARY KEY,encrypted_payload text);');
 const before=encrypt('must survive','1'.repeat(64));
 await db.query('INSERT INTO email_outbox VALUES ($1,$2)', ['first',before]);
 await db.query('INSERT INTO email_outbox VALUES ($1,$2)', ['bad',encrypt('different original key',randomBytes(32).toString('hex'))]);
 await assert.rejects(rotateDevelopmentEmailKey(db,key));
 assert.equal((await db.query<any>("SELECT encrypted_payload FROM email_outbox WHERE id='first'")).rows[0].encrypted_payload,before);
 await assert.rejects(rotateDevelopmentEmailKey(db,'1'.repeat(64)));
 } finally {await db.close();}
});
