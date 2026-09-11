import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { changeScannerPin, isAdminEmail } from "@/lib/access";

export const runtime = "edge";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!isAdminEmail(user?.email)) return NextResponse.json({ error: "অনুমতি নেই।" }, { status: 403 });
  const { pin } = await request.json() as { pin?: string };
  if (!/^\d{4}(?:\d{2})?$/.test(String(pin || ""))) return NextResponse.json({ error: "৪ অথবা ৬ সংখ্যার PIN দিন।" }, { status: 400 });
  await changeScannerPin(String(pin));
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("akb_scanner_access");
  return response;
}
