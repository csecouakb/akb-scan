"use client";

import {useMemo,useRef,useState} from "react";
import {Camera,CheckCircle2,FilePlus2,Loader2,Send,Trash2,UploadCloud} from "lucide-react";
import {enhance,fileToImage,imageToCanvas} from "@/lib/scanner";

type Attachment={id:string;file:File;preview:string};

const MAX_FILES=5;
const MAX_TOTAL_BYTES=10*1024*1024;
const RECEIVER_URL="https://script.google.com/macros/s/AKfycbyYPWMNlTcbdwrt4F5j5HmG16Ayc322UK6UhOCv74Vuqs7c2QkY-66kBnGEmi1F4KObTg/exec";

function id(){return crypto.randomUUID()}
function makeReference(){const d=new Date(),p=(n:number)=>String(n).padStart(2,"0");return `AKB${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${crypto.randomUUID().slice(0,6).toUpperCase()}`}
async function cleanedImage(file:File):Promise<Blob>{const img=await fileToImage(file);const scale=Math.min(1,2200/Math.max(img.naturalWidth,img.naturalHeight));const canvas=imageToCanvas(img,Math.max(1,Math.round(img.naturalWidth*scale)),Math.max(1,Math.round(img.naturalHeight*scale)));const cleaned=enhance(canvas,"auto",65);return new Promise((resolve,reject)=>cleaned.toBlob(b=>b?resolve(b):reject(new Error("Image processing failed")),"image/jpeg",.9))}
async function blobToBase64(blob:Blob):Promise<string>{const buffer=await blob.arrayBuffer(),bytes=new Uint8Array(buffer);let binary="";const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));return btoa(binary)}
async function postReceiver(body:Record<string,unknown>){const res=await fetch(RECEIVER_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(body)}),text=await res.text();let data:any=null;try{data=JSON.parse(text)}catch{}if(!res.ok)throw new Error(text||`HTTP ${res.status}`);if(!data?.ok)throw new Error(data?.error||"Receiver error");return data}

export default function SubmitPage(){
  const camera=useRef<HTMLInputElement>(null),picker=useRef<HTMLInputElement>(null);
  const [name,setName]=useState(""),[mobile,setMobile]=useState(""),[subject,setSubject]=useState(""),[message,setMessage]=useState("");
  const [clean,setClean]=useState(false),[files,setFiles]=useState<Attachment[]>([]),[busy,setBusy]=useState(false);
  const [status,setStatus]=useState<"idle"|"ok"|"error">("idle"),[statusText,setStatusText]=useState("");
  const totalBytes=useMemo(()=>files.reduce((n,x)=>n+x.file.size,0),[files]);

  function addFiles(list:FileList|null){if(!list?.length)return;setStatus("idle");const incoming=Array.from(list).filter(f=>f.type.startsWith("image/")||f.type==="application/pdf"),room=Math.max(0,MAX_FILES-files.length),chosen=incoming.slice(0,room),next=[...files,...chosen.map(file=>({id:id(),file,preview:file.type.startsWith("image/")?URL.createObjectURL(file):""}))];const size=next.reduce((n,x)=>n+x.file.size,0);if(size>MAX_TOTAL_BYTES){chosen.forEach(f=>{const x=next.find(a=>a.file===f);if(x?.preview)URL.revokeObjectURL(x.preview)});setStatus("error");setStatusText("সব সংযুক্তি মিলিয়ে সর্বোচ্চ 10 MB রাখা যাবে।");return}setFiles(next);if(incoming.length>room){setStatus("error");setStatusText(`সর্বোচ্চ ${MAX_FILES}টি ফাইল সংযুক্ত করা যাবে।`)}}
  function removeFile(fid:string){setFiles(v=>{const x=v.find(a=>a.id===fid);if(x?.preview)URL.revokeObjectURL(x.preview);return v.filter(a=>a.id!==fid)})}

  async function submit(e:React.FormEvent){
    e.preventDefault();
    if(!name.trim()||!mobile.trim()||!message.trim()){setStatus("error");setStatusText("নাম, মোবাইল নম্বর এবং বক্তব্য পূরণ করুন।");return}
    if(!files.length){setStatus("error");setStatusText("কমপক্ষে একটি ছবি বা PDF সংযুক্ত করুন।");return}
    setBusy(true);setStatus("idle");setStatusText("");
    try{
      const reference=makeReference();
      const note=[`মোবাইল: ${mobile.trim()}`,subject.trim()?`বিষয়: ${subject.trim()}`:"",`বক্তব্য: ${message.trim()}`].filter(Boolean).join("\n");
      const started=await postReceiver({action:"start",reference,name:name.trim(),note,options:{enhance:clean,extractText:true,autoSubject:true}});
      const folderId=String(started.folderId||"");if(!folderId)throw new Error("Receiver folder তৈরি করতে পারেনি");
      const fileUrls:string[]=[];
      for(let i=0;i<files.length;i++){
        setStatusText(`সংযুক্তি ${i+1}/${files.length} পাঠানো হচ্ছে...`);
        const item=files[i],source=clean&&item.file.type.startsWith("image/")?await cleanedImage(item.file):item.file;
        const fileName=clean&&item.file.type.startsWith("image/")?item.file.name.replace(/\.[^.]+$/,"")+"-clean.jpg":item.file.name;
        const uploaded=await postReceiver({action:"upload",folderId,fileName,mimeType:source.type||item.file.type||"application/octet-stream",base64:await blobToBase64(source)});
        if(uploaded.fileUrl)fileUrls.push(String(uploaded.fileUrl));
      }
      await postReceiver({action:"finish",reference,fileUrls});
      setStatus("ok");setStatusText(`সফলভাবে জমা হয়েছে। রেফারেন্স: ${reference}`);setName("");setMobile("");setSubject("");setMessage("");files.forEach(x=>x.preview&&URL.revokeObjectURL(x.preview));setFiles([]);
    }catch(err){setStatus("error");setStatusText(err instanceof Error?err.message:"জমা দেওয়া যায়নি। আবার চেষ্টা করুন।")}finally{setBusy(false)}
  }

  return <main style={{minHeight:"100vh",background:"#f5f7fb",padding:"24px 14px",color:"#18202a"}}><div style={{maxWidth:760,margin:"0 auto"}}>
    <header style={{marginBottom:18}}><div style={{fontWeight:800,fontSize:14,letterSpacing:.3,color:"#176b87"}}>AKB Scan</div><h1 style={{fontSize:"clamp(26px,5vw,38px)",lineHeight:1.15,margin:"6px 0"}}>তথ্য / বক্তব্য জমা দিন</h1><p style={{margin:0,color:"#667085",lineHeight:1.6}}>নিচের তথ্য পূরণ করে প্রয়োজনীয় ছবি বা PDF সংযুক্ত করুন।</p></header>
    <form onSubmit={submit} style={{background:"white",border:"1px solid #e5e7eb",borderRadius:20,padding:"clamp(18px,4vw,30px)",boxShadow:"0 10px 35px rgba(15,23,42,.06)"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14}}><Field label="নাম *"><input value={name} onChange={e=>setName(e.target.value)} placeholder="আপনার নাম" style={inputStyle}/></Field><Field label="মোবাইল নম্বর *"><input value={mobile} onChange={e=>setMobile(e.target.value)} inputMode="tel" placeholder="01XXXXXXXXX" style={inputStyle}/></Field></div>
      <Field label="বিষয়"><input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="প্রযোজ্য হলে বিষয় লিখুন" style={inputStyle}/></Field>
      <Field label="বক্তব্য / বিবরণ *"><textarea value={message} onChange={e=>setMessage(e.target.value)} rows={6} placeholder="আপনার বক্তব্য বা প্রয়োজনীয় বিবরণ লিখুন" style={{...inputStyle,resize:"vertical",minHeight:130}}/></Field>
      <section style={{marginTop:20,borderTop:"1px solid #edf0f3",paddingTop:20}}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"end",flexWrap:"wrap"}}><div><b>সংযুক্তি *</b><div style={{fontSize:13,color:"#667085",marginTop:4}}>ছবি/PDF, সর্বোচ্চ {MAX_FILES}টি, মোট 10 MB</div></div><div style={{fontSize:13,color:totalBytes>MAX_TOTAL_BYTES*.85?"#b42318":"#667085"}}>{(totalBytes/1024/1024).toFixed(1)} MB</div></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginTop:12}}><button type="button" onClick={()=>camera.current?.click()} style={actionButton}><Camera size={20}/> ক্যামেরা</button><button type="button" onClick={()=>picker.current?.click()} style={actionButton}><FilePlus2 size={20}/> ছবি / PDF</button></div>
      <input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={e=>{addFiles(e.target.files);e.currentTarget.value=""}}/><input ref={picker} hidden type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>{addFiles(e.target.files);e.currentTarget.value=""}}/>
      {files.length>0&&<div style={{display:"grid",gap:8,marginTop:14}}>{files.map((x,i)=><div key={x.id} style={{display:"grid",gridTemplateColumns:"52px 1fr auto",gap:10,alignItems:"center",padding:9,border:"1px solid #e5e7eb",borderRadius:12}}><div style={{width:52,height:52,borderRadius:8,overflow:"hidden",background:"#eef2f6",display:"grid",placeItems:"center"}}>{x.preview?<img src={x.preview} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<UploadCloud size={20}/>}</div><div style={{minWidth:0}}><b style={{display:"block",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontSize:14}}>{i+1}. {x.file.name}</b><small style={{color:"#667085"}}>{(x.file.size/1024/1024).toFixed(2)} MB</small></div><button aria-label="সংযুক্তি মুছুন" type="button" onClick={()=>removeFile(x.id)} style={{border:0,background:"transparent",padding:8,cursor:"pointer",color:"#b42318"}}><Trash2 size={18}/></button></div>)}</div>}
      <label style={{display:"flex",gap:10,alignItems:"flex-start",marginTop:15,padding:12,borderRadius:12,background:"#f7fafc",cursor:"pointer"}}><input type="checkbox" checked={clean} onChange={e=>setClean(e.target.checked)} style={{marginTop:3}}/><span><b>ছবি পরিষ্কার করে পাঠান</b><small style={{display:"block",color:"#667085",marginTop:3,lineHeight:1.5}}>ছবির background ও contrast scanner-এর মতো করার চেষ্টা করবে। PDF অপরিবর্তিত থাকবে।</small></span></label></section>
      {status!=="idle"&&<div role="status" style={{display:"flex",gap:9,alignItems:"flex-start",marginTop:18,padding:12,borderRadius:12,background:status==="ok"?"#ecfdf3":"#fff1f0",color:status==="ok"?"#067647":"#b42318"}}>{status==="ok"?<CheckCircle2 size={20}/>:null}<span>{statusText}</span></div>}
      <button type="submit" disabled={busy} style={{width:"100%",marginTop:20,border:0,borderRadius:13,padding:"14px 18px",fontWeight:800,fontSize:16,cursor:busy?"wait":"pointer",background:"#176b87",color:"white",display:"flex",alignItems:"center",justifyContent:"center",gap:9,opacity:busy?.72:1}}>{busy?<><Loader2 size={20}/> জমা হচ্ছে...</>:<><Send size={20}/> জমা দিন</>}</button>
      <p style={{textAlign:"center",color:"#98a2b3",fontSize:12,margin:"13px 0 0"}}>AKB Scan • Secure submission</p>
    </form>
  </div></main>
}

function Field({label,children}:{label:string,children:React.ReactNode}){return <label style={{display:"grid",gap:7,marginTop:14}}><b style={{fontSize:14}}>{label}</b>{children}</label>}
const inputStyle:React.CSSProperties={width:"100%",boxSizing:"border-box",border:"1px solid #d0d5dd",borderRadius:11,padding:"12px 13px",font:"inherit",background:"#fff",outline:"none",color:"#18202a"};
const actionButton:React.CSSProperties={border:"1px solid #cbd5e1",borderRadius:11,padding:"12px 14px",background:"white",fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,color:"#344054"};