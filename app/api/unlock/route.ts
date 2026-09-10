import { NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(request: Request) {
  const { pin } = await request.json() as { pin?: string };
  if (!process.env.SCANNER_PIN || String(pin) !== process.env.SCANNER_PIN) return NextResponse.json({ error:"PIN সঠিক নয়।" }, { status:401 });
  if (!process.env.SCANNER_ACCESS_TOKEN) return NextResponse.json({ error:"Scanner lock প্রস্তুত নয়।" }, { status:503 });
  const response = NextResponse.json({ ok:true });
  response.cookies.set("akb_scanner_access", process.env.SCANNER_ACCESS_TOKEN, { httpOnly:true, secure:true, sameSite:"strict", path:"/", maxAge:60*60*24*30 });
  return response;
}
