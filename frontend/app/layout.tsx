
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orion Bank | Customer Portal",
  description: "Your finances. Your future. A smarter banking experience.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
