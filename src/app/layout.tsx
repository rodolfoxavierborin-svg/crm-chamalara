import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dent'up Odontologia - CRM",
  description: "Plataforma Integrada de CRM & Atendimento Dent'up",
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
      <body className="notranslate">{children}</body>
    </html>
  );
}