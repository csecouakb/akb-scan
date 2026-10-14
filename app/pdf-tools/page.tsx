import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { scannerSessionToken } from "@/lib/access";
import PdfTools from "./pdf-tools";

export default async function PdfToolsPage() {
  const token = (await cookies()).get("akb_scanner_access")?.value;
  if (!token || token !== await scannerSessionToken()) redirect("/unlock");
  return <PdfTools />;
}
