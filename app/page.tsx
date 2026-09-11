import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Scanner from "./scanner";
import { scannerSessionToken } from "@/lib/access";

export default async function Home() {
  const token = (await cookies()).get("akb_scanner_access")?.value;
  if (!token || token !== await scannerSessionToken()) redirect("/unlock");
  return <Scanner />;
}
