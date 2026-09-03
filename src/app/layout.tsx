import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const displayFont = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const bodyFont = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Debet & Kredit",
  description: "Öppen bokföring för svenska småföretag — verifikat, moms och SIE 4",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Debet & Kredit" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport = {
  themeColor: "#ea580c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sv"
      className={`${displayFont.variable} ${bodyFont.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
