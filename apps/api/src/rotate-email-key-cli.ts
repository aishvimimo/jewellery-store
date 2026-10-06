import { connectDatabase } from './db.js';
import { rotateDevelopmentEmailKey } from './rotate-email-key.js';
// Only for the first hosted deployment of an imported development database.
// Stop other API instances/writers first. Never use this to rotate arbitrary keys.
if (!process.argv.includes('--from-development-fallback')) {
  throw new Error('Explicit --from-development-fallback flag required');
}
const { pool, env } = connectDatabase();
try {
  const client = await pool.connect();
  try {
    const count = await rotateDevelopmentEmailKey(client, env.EMAIL_ENCRYPTION_KEY || '');
    console.log(`Email key migration complete: ${count} payloads re-encrypted.`);
  } finally { client.release(); }
} catch {
  console.error('Email key migration failed. Do not start the API; check the configured key and restore history.');
  process.exitCode = 1;
} finally { await pool.end(); }
