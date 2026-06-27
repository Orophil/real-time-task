import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hyring Task Board",
  description: "Real-time shared task board",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
