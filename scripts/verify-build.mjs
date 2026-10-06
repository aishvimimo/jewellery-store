import { spawn } from 'node:child_process';
// npm exposes its JavaScript entry point when running an npm script. Launching
// it with Node also works on Windows, where npm is normally a .cmd wrapper.
const npmEntry=process.env.npm_execpath;
if(!npmEntry)throw new Error('Run this check using npm run verify:build');
const server=spawn(process.execPath,['--import','tsx','scripts/test-preview.ts'],{stdio:['ignore','pipe','inherit']});
try {
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Test API startup timed out')),30000);server.stdout.on('data',chunk=>{const text=String(chunk);process.stdout.write(text);if(text.includes('port 3001')){clearTimeout(timer);resolve();}});server.on('exit',code=>{clearTimeout(timer);reject(new Error('Test API exited '+code));});});
  const response=await fetch('http://127.0.0.1:3001/api/v1/products');if(!response.ok)throw new Error('Live test API unavailable');
  const status=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[npmEntry,'run','build'],{stdio:'inherit',env:{...process.env,CATALOG_API_URL:'http://127.0.0.1:3001',PUBLIC_API_URL:'http://127.0.0.1:3001',ALLOW_SAMPLE_CATALOG:'false'}});child.on('error',reject);child.on('exit',resolve);});
  if(status!==0)throw new Error('Production build failed');
} finally {server.kill('SIGTERM');}
