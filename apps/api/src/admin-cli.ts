import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { connectDatabase } from './db.js';
import { adminUsers,adminSessions } from './schema.js';
import { hashPassword } from './password.js';
function secret(prompt:string):Promise<string>{
 if(!process.stdin.isTTY)throw new Error('Run this command in an interactive PowerShell or terminal window');
 process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();let value='';
 return new Promise((resolve,reject)=>{
  const finish=(error?:Error)=>{process.stdin.off('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');error?reject(error):resolve(value);};
  const onData=(chunk:Buffer)=>{for(const char of chunk.toString('utf8')){if(char==='\u0003'){finish(new Error('Cancelled'));return;}if(char==='\r'||char==='\n'){finish();return;}if(char==='\u007f'||char==='\b')value=value.slice(0,-1);else if(char>=' '&&value.length<4096)value+=char;}};
  process.stdin.on('data',onData);
 });
}
const {db,pool}=connectDatabase();
try {
 const reader=createInterface({input:process.stdin,output:process.stdout});let email:string,name:string;
 try{email=z.string().trim().email().max(254).parse(await reader.question('Admin email: ')).toLowerCase();name=z.string().trim().min(1).max(100).parse(await reader.question('Display name: '));}finally{reader.close();}
 const password=await secret('Password (12–128 characters, hidden): '),confirm=await secret('Confirm password (hidden): ');
 if(password!==confirm)throw new Error('Passwords do not match');
 const passwordHash=await hashPassword(password);const reset=process.argv.includes('--reset');
 const existing=(await db.select({id:adminUsers.id}).from(adminUsers).where(eq(adminUsers.email,email)))[0];
 if(existing&&!reset)throw new Error('This account exists. Use npm run admin:reset-password to replace its password.');
 if(!existing&&reset)throw new Error('Account not found. Use npm run admin:create first.');
 if(existing)await db.transaction(async tx=>{await tx.update(adminUsers).set({name,passwordHash,failedAttempts:0,lockedUntil:null}).where(eq(adminUsers.id,existing.id));await tx.delete(adminSessions).where(eq(adminSessions.userId,existing.id));});
 else await db.insert(adminUsers).values({id:randomUUID(),email,name,passwordHash,role:'admin'});
 console.log(reset?'Password updated; old sessions revoked.':'Admin account created. Open http://localhost:4321/admin/ to sign in.');
}catch(error){console.error(error instanceof Error&&!(error as any).cause?error.message:'Could not update the admin account. Run migrations and check the database connection.');process.exitCode=1;}finally{await pool.end();}
