import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const themeBootstrap = `
  (() => {
    try {
      const stored = localStorage.getItem("interlocks:theme:v1");
      const theme = stored === "light" || stored === "dark"
        ? stored
        : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    } catch {}
  })();
`;

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="interlocks-theme" strategy="beforeInteractive">
          {themeBootstrap}
        </Script>
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
