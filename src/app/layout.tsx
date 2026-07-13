import type { Metadata } from "next";
import { IBM_Plex_Sans_JP, Geist_Mono } from "next/font/google";
import "./globals.css";

const plexJp = IBM_Plex_Sans_JP({
  variable: "--font-plex-jp",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "fp-desk",
  description: "FP業務支援システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${plexJp.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
