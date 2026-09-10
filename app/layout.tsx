import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AKB Scan · Document Scanner & Print Optimizer",
  description: "Turn document photos and PDFs into clean, straight, print-ready scans on your device.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "AKB Scan", statusBarStyle: "black-translucent" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bn">
      <body className="antialiased">{children}</body>
    </html>
  );
}
