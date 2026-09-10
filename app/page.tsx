import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Scanner from "./scanner";

export default async function Home() {
  const token = (await cookies()).get("akb_scanner_access")?.value;
  if (!process.env.SCANNER_ACCESS_TOKEN || token !== process.env.SCANNER_ACCESS_TOKEN) redirect("/unlock");
  return <Scanner />;
}
