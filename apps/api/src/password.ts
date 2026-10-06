import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
const derive=(password:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>{
 scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key));
});
export async function hashPassword(password:string){
 if(password.length<12||password.length>128)throw new Error('Use a password between 12 and 128 characters');
 const salt=randomBytes(16).toString('hex');
 const key=await derive(password,salt);
 return `scrypt$32768$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password:string,encoded:string){
 const [kind,cost,salt,hex]=encoded.split('$');
 if(kind!=='scrypt'||cost!=='32768'||!/^[a-f0-9]{32}$/.test(salt||'')||!/^[a-f0-9]{128}$/.test(hex||''))return false;
 const key=await derive(password,salt);
 return timingSafeEqual(key,Buffer.from(hex,'hex'));
}
