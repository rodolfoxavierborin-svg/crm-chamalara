import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dent'up Odontologia - CRM",
  description: "Plataforma Integrada de CRM & Atendimento Dent'up",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dent'up CRM",
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="notranslate" translate="no">
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body className="notranslate bg-slate-50 text-slate-800 antialiased">{children}</body>
    </html>
  );
}