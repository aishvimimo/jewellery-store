import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CommerceError } from './quote.js';
export type MediaOptions={driver:'local'|'r2',localDir:string,publicUrl:string,production:boolean,r2AccountId?:string,r2AccessKeyId?:string,r2SecretAccessKey?:string,r2Bucket?:string};
export function mediaStore(options:MediaOptions){
 let s3:S3Client|undefined;
 return {
  async upload(buffer:Buffer,mimetype:string){
   if(!['image/jpeg','image/png','image/webp','image/avif'].includes(mimetype))throw new CommerceError(400,'INVALID_IMAGE','Choose a JPEG, PNG, WebP or AVIF image');
   let result:Buffer;
   try{const image=sharp(buffer,{limitInputPixels:25000000});const meta=await image.metadata();if(!['jpeg','png','webp','avif','heif'].includes(meta.format||''))throw new Error('Unsupported format');result=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();}
   catch{throw new CommerceError(400,'INVALID_IMAGE','This image could not be processed. Use a valid image under 8 MB and 25 megapixels.');}
   const name=randomUUID()+'.webp';
   if(options.driver==='local'){
    if(options.production)throw new CommerceError(503,'MEDIA_NOT_CONFIGURED','Configure R2 storage before uploading production images');
    await mkdir(resolve(options.localDir),{recursive:true});await writeFile(resolve(options.localDir,name),result,{flag:'wx'});
   }else{
    if(!options.r2AccountId||!options.r2AccessKeyId||!options.r2SecretAccessKey||!options.r2Bucket)throw new CommerceError(503,'MEDIA_NOT_CONFIGURED','R2 upload configuration is incomplete');
    s3??=new S3Client({region:'auto',endpoint:`https://${options.r2AccountId}.r2.cloudflarestorage.com`,credentials:{accessKeyId:options.r2AccessKeyId,secretAccessKey:options.r2SecretAccessKey}});
    try{await s3.send(new PutObjectCommand({Bucket:options.r2Bucket,Key:'products/'+name,Body:result,ContentType:'image/webp',CacheControl:'public, max-age=31536000, immutable'}));}
    catch{throw new CommerceError(503,'UPLOAD_FAILED','Image storage is unavailable. Please try again.');}
   }
   return {url:options.publicUrl.replace(/\/$/,'')+(options.driver==='r2'?'/products/':'/')+name,format:'webp'};
  },
  async localFile(name:string){if(options.driver!=='local'||options.production||!/^[a-f0-9-]{36}\.webp$/.test(name))throw new CommerceError(404,'NOT_FOUND','Image not found');try{return await readFile(resolve(options.localDir,name));}catch{throw new CommerceError(404,'NOT_FOUND','Image not found');}},
 };
}
export type MediaStore=ReturnType<typeof mediaStore>;
