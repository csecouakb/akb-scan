"use client";

import { KeyRound, LoaderCircle, LockKeyhole } from "lucide-react";
import { FormEvent, useState } from "react";
import Link from "next/link";

export default function UnlockPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/unlock", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ pin:form.get("pin") }) });
    if (response.ok) location.replace("/");
    else { const result=await response.json() as {error?:string}; setError(result.error || "PIN সঠিক নয়।"); setBusy(false); }
  }
  return <main className="submit-shell"><section className="submit-card unlock-card"><div className="unlock-icon"><LockKeyhole/></div><h1>AKB Scan</h1><p>Scanner ব্যবহার করতে ৪ অথবা ৬ সংখ্যার PIN দিন</p><form onSubmit={unlock}><label>PIN<input name="pin" required autoFocus type="password" inputMode="numeric" pattern="[0-9]{4}|[0-9]{6}" maxLength={6} placeholder="••••" autoComplete="off" /></label>{error&&<p className="form-error">{error}</p>}<button className="submit-primary" disabled={busy}>{busy?<><LoaderCircle className="spin"/> যাচাই হচ্ছে…</>:<>প্রবেশ করুন <KeyRound/></>}</button></form><Link className="admin-link" href="/admin">Admin login</Link></section></main>;
}
