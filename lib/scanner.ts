export type FilterName = "auto" | "soft-copy" | "original" | "color" | "gray" | "bw" | "strong-bw" | "ink" | "photo";
export type Point = { x: number; y: number };

export const defaultCorners = (w: number, h: number): Point[] => [
  { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h },
];
export function orderCorners(points:Point[]):Point[]{
  if(points.length!==4)return points;
  const sums=points.map(p=>p.x+p.y),diffs=points.map(p=>p.x-p.y);
  const at=(values:number[],pick:"min"|"max")=>points[values.indexOf(pick==="min"?Math.min(...values):Math.max(...values))];
  const ordered=[at(sums,"min"),at(diffs,"max"),at(sums,"max"),at(diffs,"min")];
  return new Set(ordered).size===4?ordered.map(p=>({...p})):points;
}
export function detectDocumentCorners(canvas:HTMLCanvasElement):Point[]{
  const s=Math.min(1,800/Math.max(canvas.width,canvas.height)),w=Math.max(8,Math.round(canvas.width*s)),h=Math.max(8,Math.round(canvas.height*s));
  const c=imageToCanvas(canvas,w,h),data=c.getContext("2d",{willReadFrequently:true})!.getImageData(0,0,w,h).data,gray=new Float32Array(w*h);
  for(let i=0,p=0;i<data.length;i+=4,p++)gray[p]=.299*data[i]+.587*data[i+1]+.114*data[i+2];
  type Sample={a:number;b:number;score:number};
  const vertical:Sample[]=[],horizontal:Sample[]=[];
  // Collect the strongest paper/background transition in each scan line. Keeping
  // many local samples lets tilted and perspective-skewed edges win over text.
  for(let y=3;y<h-3;y+=3)for(const [from,to,side] of [[.015,.48,-1],[.52,.985,1]] as const){let bx=Math.round(w*from),score=0;for(let x=Math.max(3,bx);x<Math.min(w-3,Math.round(w*to));x++){const g=Math.abs(gray[y*w+x+2]-gray[y*w+x-2]);if(g>score){score=g;bx=x}}if(score>10)vertical.push({a:y,b:bx,score:score+(side<0?(w-bx):bx)/w})}
  for(let x=3;x<w-3;x+=3)for(const [from,to,side] of [[.015,.48,-1],[.52,.985,1]] as const){let by=Math.round(h*from),score=0;for(let y=Math.max(3,by);y<Math.min(h-3,Math.round(h*to));y++){const g=Math.abs(gray[(y+2)*w+x]-gray[(y-2)*w+x]);if(g>score){score=g;by=y}}if(score>10)horizontal.push({a:x,b:by,score:score+(side<0?(h-by):by)/h})}
  const fit=(samples:Sample[],low:boolean,extent:number)=>{const chosen=samples.filter(q=>low?q.b<extent*.5:q.b>=extent*.5).sort((a,b)=>b.score-a.score).slice(0,Math.max(12,Math.floor(samples.length*.18)));if(chosen.length<8)return null;let sa=0,sb=0,saa=0,sab=0;for(const q of chosen){sa+=q.a;sb+=q.b;saa+=q.a*q.a;sab+=q.a*q.b}const den=chosen.length*saa-sa*sa;if(Math.abs(den)<1)return null;const m=(chosen.length*sab-sa*sb)/den;return {m,k:(sb-m*sa)/chosen.length}}
  const left=fit(vertical,true,w),right=fit(vertical,false,w),top=fit(horizontal,true,h),bottom=fit(horizontal,false,h);
  if(!left||!right||!top||!bottom)return defaultCorners(canvas.width,canvas.height);
  const cross=(v:{m:number;k:number},q:{m:number;k:number})=>{const den=1-q.m*v.m;if(Math.abs(den)<.05)return null;const y=(q.m*v.k+q.k)/den;return {x:(v.m*y+v.k)/s,y:y/s}};
  const result=[cross(left,top),cross(right,top),cross(right,bottom),cross(left,bottom)];
  if(result.some(p=>!p))return defaultCorners(canvas.width,canvas.height);const points=result as Point[],area=Math.abs(points.reduce((sum,p,i)=>sum+p.x*points[(i+1)%4].y-points[(i+1)%4].x*p.y,0))/2;
  if(area<canvas.width*canvas.height*.18||points.some(p=>p.x<0||p.y<0||p.x>canvas.width||p.y>canvas.height))return defaultCorners(canvas.width,canvas.height);
  return orderCorners(points);
}

export async function fileToImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

export function perspectiveCorrect(source: HTMLCanvasElement, p: Point[]): HTMLCanvasElement {
  const top = Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y), bottom = Math.hypot(p[2].x-p[3].x,p[2].y-p[3].y);
  const left = Math.hypot(p[3].x-p[0].x,p[3].y-p[0].y), right = Math.hypot(p[2].x-p[1].x,p[2].y-p[1].y);
  const w = Math.max(1, Math.round(Math.max(top,bottom))), h = Math.max(1, Math.round(Math.max(left,right)));
  const sctx=source.getContext("2d",{willReadFrequently:true})!, src=sctx.getImageData(0,0,source.width,source.height);
  const out=document.createElement("canvas"); out.width=w;out.height=h;const ctx=out.getContext("2d")!, im=ctx.createImageData(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const u=w===1?0:x/(w-1),v=h===1?0:y/(h-1),iu=1-u,iv=1-v;
    const sx=Math.max(0,Math.min(source.width-1,p[0].x*iu*iv+p[1].x*u*iv+p[2].x*u*v+p[3].x*iu*v));
    const sy=Math.max(0,Math.min(source.height-1,p[0].y*iu*iv+p[1].y*u*iv+p[2].y*u*v+p[3].y*iu*v));
    const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(source.width-1,x0+1),y1=Math.min(source.height-1,y0+1),fx=sx-x0,fy=sy-y0,di=(y*w+x)*4;
    for(let channel=0;channel<3;channel++){
      const a=src.data[(y0*source.width+x0)*4+channel]*(1-fx)+src.data[(y0*source.width+x1)*4+channel]*fx;
      const b=src.data[(y1*source.width+x0)*4+channel]*(1-fx)+src.data[(y1*source.width+x1)*4+channel]*fx;
      im.data[di+channel]=a*(1-fy)+b*fy;
    }
    im.data[di+3]=255;
  }
  ctx.putImageData(im,0,0); return out;
}

export function enhance(source: HTMLCanvasElement, filter: FilterName, strength=65): HTMLCanvasElement {
  const out=document.createElement("canvas");out.width=source.width;out.height=source.height;const ctx=out.getContext("2d",{willReadFrequently:true})!;ctx.drawImage(source,0,0);
  if(filter==="original") return out;
  const im=ctx.getImageData(0,0,out.width,out.height),d=im.data,w=out.width,h=out.height;
  const scale=Math.max(12,Math.round(Math.min(w,h)/45)), gw=Math.ceil(w/scale),gh=Math.ceil(h/scale),light=new Float32Array(gw*gh),count=new Uint32Array(gw*gh);
  for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){const i=(y*w+x)*4,g=(Math.floor(y/scale)*gw+Math.floor(x/scale));light[g]+=.299*d[i]+.587*d[i+1]+.114*d[i+2];count[g]++}
  for(let i=0;i<light.length;i++)light[i]/=count[i]||1;
  // Smooth the illumination map before applying it. A nearest-cell map makes
  // hard checkerboard patches visible on folded paper and strong shadows.
  for(let pass=0;pass<3;pass++){const next=new Float32Array(light.length);for(let gy=0;gy<gh;gy++)for(let gx=0;gx<gw;gx++){let sum=0,n=0;for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){const xx=gx+ox,yy=gy+oy;if(xx>=0&&xx<gw&&yy>=0&&yy<gh){sum+=light[yy*gw+xx];n++}}next[gy*gw+gx]=sum/n}light.set(next)}
  const k=strength/100;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,gx=Math.min(gw-1,x/scale),gy=Math.min(gh-1,y/scale),x0=Math.floor(gx),y0=Math.floor(gy),x1=Math.min(gw-1,x0+1),y1=Math.min(gh-1,y0+1),fx=gx-x0,fy=gy-y0,local=(light[y0*gw+x0]*(1-fx)+light[y0*gw+x1]*fx)*(1-fy)+(light[y1*gw+x0]*(1-fx)+light[y1*gw+x1]*fx)*fy;let r=d[i],gg=d[i+1],b=d[i+2];
    if(filter!=="photo"){const correction=(235-local)*k;r+=correction;gg+=correction;b+=correction}
    let l=.299*r+.587*gg+.114*b;
    if(filter==="gray"||filter==="bw"||filter==="strong-bw"||filter==="ink")r=gg=b=l;
    if(filter==="bw"||filter==="strong-bw"||filter==="ink"){const threshold=filter==="strong-bw"?190:filter==="ink"?155:175;const soft=filter==="strong-bw"?18:32;l=255/(1+Math.exp(-(l-threshold)/soft));r=gg=b=l}
    else if(filter==="soft-copy"){const base=Math.max(45,local),normalized=Math.max(0,Math.min(255,l/base*244)),clean=(normalized-128)*1.18+128,chroma=Math.max(r,gg,b)-Math.min(r,gg,b),keep=chroma>28?.9:.48;r=clean+(r-l)*keep;gg=clean+(gg-l)*keep;b=clean+(b-l)*keep;if(clean>174){const white=Math.min(.96,(clean-174)/62);r+=(255-r)*white;gg+=(255-gg)*white;b+=(255-b)*white}}
    else if(filter==="auto"||filter==="color"||filter==="gray"){const c=filter==="color"?1.16:1.28;r=(r-128)*c+128;gg=(gg-128)*c+128;b=(b-128)*c+128;l=.299*r+.587*gg+.114*b;if(l>188){const white=Math.min(.88,(l-188)/58)*k;r+=(255-r)*white;gg+=(255-gg)*white;b+=(255-b)*white}}
    else if(filter==="photo"){r=(r-128)*1.08+128;gg=(gg-128)*1.08+128;b=(b-128)*1.08+128}
    d[i]=Math.max(0,Math.min(255,r));d[i+1]=Math.max(0,Math.min(255,gg));d[i+2]=Math.max(0,Math.min(255,b));
  }
  ctx.putImageData(im,0,0);return out;
}

export function imageToCanvas(img: CanvasImageSource, w:number, h:number){const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d")!.drawImage(img,0,0,w,h);return c}
export const canvasBlob=(c:HTMLCanvasElement,type="image/jpeg",quality=.94)=>new Promise<Blob>((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error("Export failed")),type,quality));
