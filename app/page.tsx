import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import Scanner from "./scanner";
import { scannerSessionToken } from "@/lib/access";

export default async function Home() {
  const token = (await cookies()).get("akb_scanner_access")?.value;
  if (!token || token !== await scannerSessionToken()) redirect("/unlock");
  return (
    <>
      <div style={{maxWidth:1220,margin:"14px auto 0",padding:"0 18px",display:"flex",justifyContent:"flex-end"}}>
        <Link href="/pdf-tools" style={{textDecoration:"none",background:"#111827",color:"#fff",padding:"10px 14px",borderRadius:10,fontWeight:800,fontSize:14}}>
          PDF Tools
        </Link>
      </div>
      <Scanner />
    </>
  );
}
