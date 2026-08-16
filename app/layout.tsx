import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interlocks — Conflicts, clearly managed",
  description:
    "A local-first conflicts management workspace for disclosures, reviews, controls, and audit history.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/interlocks-icon.svg",
    shortcut: "/interlocks-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
