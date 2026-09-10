export type FilterName = "auto" | "original" | "color" | "gray" | "bw" | "strong-bw" | "ink" | "photo";
export type Point = { x: number; y: number };

export const defaultCorners = (w: number, h: number): Point[] => [
  { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h },
];
export function detectDocumentCorners(canvas:HTMLCanvasElement):Point[]{const s=Math.min(1,700/Math.max(canvas.width,canvas.height)),w=Math.round(canvas.width*s),h=Math.round(canvas.height*s),c=imageToCanvas(canvas,w,h),d=c.getContext("2d",{willReadFrequently:true})!.getImageData(0,0,w,h).data,sx=new Float32Array(w),sy=new Float32Array(h);for(let y=2;y<h-2;y+=2)for(let x=2;x<w-2;x+=2){const i=(y*w+x)*4,j=i+8,k=((y+2)*w+x)*4,l=.299*d[i]+.587*d[i+1]+.114*d[i+2];sx[x]+=Math.abs(l-(.299*d[j]+.587*d[j+1]+.114*d[j+2]));sy[y]+=Math.abs(l-(.299*d[k]+.587*d[k+1]+.114*d[k+2]))}const best=(a:Float32Array,f:number,t:number)=>{let n=Math.floor(f);for(let i=Math.floor(f);i<Math.floor(t);i++)if(a[i]>a[n])n=i;return n},l=best(sx,w*.02,w*.35),r=best(sx,w*.65,w*.98),t=best(sy,h*.02,h*.35),b=best(sy,h*.65,h*.98);if(r-l<w*.35||b-t<h*.35)return defaultCorners(canvas.width,canvas.height);return[{x:l/s,y:t/s},{x:r/s,y:t/s},{x:r/s,y:b/s},{x:l/s,y:b/s}]}

export async function fileToImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

function solve8(a: number[][], b: number[]) {
  for (let i = 0; i < 8; i++) {
    let m = i;
    for (let j = i + 1; j < 8; j++) if (Math.abs(a[j][i]) > Math.abs(a[m][i])) m = j;
    [a[i], a[m]] = [a[m], a[i]]; [b[i], b[m]] = [b[m], b[i]];
    const d = a[i][i] || 1e-9;
    for (let k = i; k < 8; k++) a[i][k] /= d; b[i] /= d;
    for (let j = 0; j < 8; j++) if (j !== i) {
      const f = a[j][i]; for (let k = i; k < 8; k++) a[j][k] -= f * a[i][k]; b[j] -= f * b[i];
    }
  }
  return b;
}

export function perspectiveCorrect(source: HTMLCanvasElement, p: Point[]): HTMLCanvasElement {
  const top = Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y), bottom = Math.hypot(p[2].x-p[3].x,p[2].y-p[3].y);
  const left = Math.hypot(p[3].x-p[0].x,p[3].y-p[0].y), right = Math.hypot(p[2].x-p[1].x,p[2].y-p[1].y);
  const w = Math.max(1, Math.round(Math.max(top,bottom))), h = Math.max(1, Math.round(Math.max(left,right)));
  const dst = [{x:0,y:0},{x:w-1,y:0},{x:w-1,y:h-1},{x:0,y:h-1}];
  const A:number[][]=[], B:number[]=[];
  for(let i=0;i<4;i++){const x=dst[i].x,y=dst[i].y,u=p[i].x,v=p[i].y;A.push([x,y,1,0,0,0,-u*x,-u*y]);B.push(u);A.push([0,0,0,x,y,1,-v*x,-v*y]);B.push(v)}
  const q=solve8(A,B), sctx=source.getContext("2d",{willReadFrequently:true})!, src=sctx.getImageData(0,0,source.width,source.height);
  const out=document.createElement("canvas"); out.width=w;out.height=h;const ctx=out.getContext("2d")!, im=ctx.createImageData(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const z=q[6]*x+q[7]*y+1,sx=(q[0]*x+q[1]*y+q[2])/z,sy=(q[3]*x+q[4]*y+q[5])/z;const ix=Math.max(0,Math.min(source.width-1,Math.round(sx))),iy=Math.max(0,Math.min(source.height-1,Math.round(sy)));const si=(iy*source.width+ix)*4,di=(y*w+x)*4;im.data[di]=src.data[si];im.data[di+1]=src.data[si+1];im.data[di+2]=src.data[si+2];im.data[di+3]=255}
  ctx.putImageData(im,0,0); return out;
}

export function enhance(source: HTMLCanvasElement, filter: FilterName, strength=65): HTMLCanvasElement {
  const out=document.createElement("canvas");out.width=source.width;out.height=source.height;const ctx=out.getContext("2d",{willReadFrequently:true})!;ctx.drawImage(source,0,0);
  if(filter==="original") return out;
  const im=ctx.getImageData(0,0,out.width,out.height),d=im.data,w=out.width,h=out.height;
  const scale=Math.max(12,Math.round(Math.min(w,h)/45)), gw=Math.ceil(w/scale),gh=Math.ceil(h/scale),light=new Float32Array(gw*gh),count=new Uint32Array(gw*gh);
  for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){const i=(y*w+x)*4,g=(Math.floor(y/scale)*gw+Math.floor(x/scale));light[g]+=.299*d[i]+.587*d[i+1]+.114*d[i+2];count[g]++}
  for(let i=0;i<light.length;i++)light[i]/=count[i]||1;
  const k=strength/100;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,g=Math.min(gh-1,Math.floor(y/scale))*gw+Math.min(gw-1,Math.floor(x/scale)),local=light[g]||220;let r=d[i],gg=d[i+1],b=d[i+2];
    if(filter!=="photo"){const correction=(235-local)*k;r+=correction;gg+=correction;b+=correction}
    let l=.299*r+.587*gg+.114*b;
    if(filter==="gray"||filter==="bw"||filter==="strong-bw"||filter==="ink")r=gg=b=l;
    if(filter==="bw"||filter==="strong-bw"||filter==="ink"){const threshold=filter==="strong-bw"?190:filter==="ink"?155:175;const soft=filter==="strong-bw"?18:32;l=255/(1+Math.exp(-(l-threshold)/soft));r=gg=b=l}
    else if(filter==="auto"||filter==="color"||filter==="gray"){const c=filter==="color"?1.18:1.32;r=(r-128)*c+128;gg=(gg-128)*c+128;b=(b-128)*c+128;if(l>205){const lift=(255-l)*(.55*k);r+=lift;gg+=lift;b+=lift}}
    else if(filter==="photo"){r=(r-128)*1.08+128;gg=(gg-128)*1.08+128;b=(b-128)*1.08+128}
    d[i]=Math.max(0,Math.min(255,r));d[i+1]=Math.max(0,Math.min(255,gg));d[i+2]=Math.max(0,Math.min(255,b));
  }
  ctx.putImageData(im,0,0);return out;
}

export function imageToCanvas(img: CanvasImageSource, w:number, h:number){const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d")!.drawImage(img,0,0,w,h);return c}
export const canvasBlob=(c:HTMLCanvasElement,type="image/jpeg",quality=.94)=>new Promise<Blob>((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error("Export failed")),type,quality));
