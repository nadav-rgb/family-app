const fs = require('fs'), zlib = require('zlib');
function decodePNG(path){
  const b = fs.readFileSync(path);
  if(b.readUInt32BE(0)!==0x89504e47) throw new Error('not png');
  let off=8, W=0,H=0,bd=0,ct=0, idat=[];
  while(off<b.length){
    const len=b.readUInt32BE(off); const type=b.toString('ascii',off+4,off+8); const data=b.slice(off+8,off+8+len);
    if(type==='IHDR'){W=data.readUInt32BE(0);H=data.readUInt32BE(4);bd=data[8];ct=data[9];}
    else if(type==='IDAT'){idat.push(data);}
    else if(type==='IEND')break;
    off+=12+len;
  }
  const raw=zlib.inflateSync(Buffer.concat(idat));
  const ch = ct===6?4:ct===2?3:ct===0?1:ct===4?2:0;
  if(!ch) throw new Error('unsupported colortype '+ct);
  const bpp=ch*(bd/8); const stride=W*bpp;
  const out=Buffer.alloc(H*stride); let p=0;
  for(let y=0;y<H;y++){
    const f=raw[p++]; const cur=out.slice(y*stride,(y+1)*stride); const prev=y>0?out.slice((y-1)*stride,y*stride):null;
    for(let x=0;x<stride;x++){
      const rawb=raw[p++]; const a=x>=bpp?cur[x-bpp]:0; const bb=prev?prev[x]:0; const c=(prev&&x>=bpp)?prev[x-bpp]:0; let v;
      switch(f){case 0:v=rawb;break;case 1:v=rawb+a;break;case 2:v=rawb+bb;break;case 3:v=rawb+((a+bb)>>1);break;
        case 4:{const pa=Math.abs(bb-c),pb=Math.abs(a-c),pc=Math.abs(a+bb-2*c);const pr=(pa<=pb&&pa<=pc)?a:(pb<=pc?bb:c);v=rawb+pr;break;}
        default:v=rawb;}
      cur[x]=v&0xff;
    }
  }
  return {W,H,ch,stride,out};
}
function px(img,xf,yf){const x=Math.min(img.W-1,Math.floor(img.W*xf)),y=Math.min(img.H-1,Math.floor(img.H*yf));const i=y*img.stride+x*img.ch;return img.out[i]+','+img.out[i+1]+','+img.out[i+2];}
const pts={
  create:{title:[0.5,0.625],cardBg:[0.5,0.60],label:[0.18,0.705],inputBg:[0.5,0.745],inputBorder:[0.5,0.728],roleL:[0.25,0.825],roleR:[0.75,0.825],roleText:[0.78,0.825],cta:[0.5,0.915],ctaText:[0.5,0.915],hint:[0.5,0.965]},
  join:{title:[0.5,0.61],cardBg:[0.5,0.57],sub:[0.5,0.675],boxBg:[0.5,0.805],boxBorder:[0.42,0.778],cta:[0.5,0.905],link:[0.5,0.965]}
};
for(const [name,file] of [['create','assets/create-family-hero.png'],['join','assets/join-family-hero.png']]){
  const img=decodePNG(file); const r={dim:img.W+'x'+img.H+' ct'+img.ch};
  for(const [k,[xf,yf]] of Object.entries(pts[name])) r[k]=px(img,xf,yf);
  console.log(name, JSON.stringify(r,null,1));
}

console.log("\n=== VERTICAL SCAN x=50% ===");
for(const [name,file] of [['create','assets/create-family-hero.png'],['join','assets/join-family-hero.png']]){
  const img=decodePNG(file); const lines=[];
  for(let pct=56;pct<=99;pct+=1.5){ lines.push(pct.toFixed(0)+'%:'+px(img,0.5,pct/100)); }
  console.log(name, lines.join('  '));
}
