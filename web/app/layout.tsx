import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Từ điển tiếng Việt",
  description: "Tra cứu từ điển tiếng Việt, Hán-Việt, Nôm, IPA và nguồn dẫn.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Từ điển tiếng Việt",
    description: "Bộ từ điển tiếng Việt có dẫn nguồn, search không dấu và lớp Hán-Việt.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
