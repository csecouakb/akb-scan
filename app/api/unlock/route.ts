import { NextResponse } from "next/server";
import { scannerSessionToken, verifyPin } from "@/lib/access";

export const runtime = "edge";

export async function POST(request: Request) {
  const { pin } = await request.json() as { pin?: string };
  if (!/^\d{4}(?:\d{2})?$/.test(String(pin || "")) || !await verifyPin(String(pin))) return NextResponse.json({ error:"PIN সঠিক নয়।" }, { status:401 });
  const response = NextResponse.json({ ok:true });
  response.cookies.set("akb_scanner_access", await scannerSessionToken(), { httpOnly:true, secure:true, sameSite:"strict", path:"/", maxAge:60*60*24*30 });
  return response;
}
