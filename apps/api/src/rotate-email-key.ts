import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

type Client = { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> };
const fallback = '1'.repeat(64);
function decrypt(payload: string, key: Buffer) {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted payload');
  const [iv, tag, body] = parts.map(v => Buffer.from(v, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', key, iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(body), cipher.final()]);
}
export async function rotateDevelopmentEmailKey(client: Client, newKeyHex: string) {
  if (!/^[a-f0-9]{64}$/.test(newKeyHex) || newKeyHex === fallback) {
    throw new Error('Set a unique private 64-character hexadecimal EMAIL_ENCRYPTION_KEY');
  }
  const newKey = Buffer.from(newKeyHex, 'hex'), oldKey = Buffer.from(fallback, 'hex');
  await client.query('BEGIN');
  try {
    await client.query('LOCK TABLE email_outbox IN ACCESS EXCLUSIVE MODE');
    const { rows } = await client.query('SELECT id, encrypted_payload FROM email_outbox WHERE encrypted_payload IS NOT NULL');
    let changed = 0;
    for (const row of rows) {
      // A repeat deployment leaves payloads already under the new key untouched.
      try { decrypt(row.encrypted_payload, newKey); continue; } catch {}
      let plaintext: Buffer;
      try { plaintext = decrypt(row.encrypted_payload, oldKey); }
      catch { throw new Error('Email key rotation stopped: a payload matches neither key. No changes committed.'); }
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', newKey, iv);
      const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const payload = [iv, cipher.getAuthTag(), body].map(b => b.toString('base64')).join('.');
      await client.query('UPDATE email_outbox SET encrypted_payload=$1 WHERE id=$2', [payload, row.id]);
      changed++;
    }
    await client.query('COMMIT');
    return changed;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
