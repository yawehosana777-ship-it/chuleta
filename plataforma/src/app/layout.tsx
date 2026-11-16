import type { Metadata, Viewport } from "next";
import { Alfa_Slab_One, Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"] });
const alfa = Alfa_Slab_One({ variable: "--font-alfa", weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Menús digitales", template: "%s · Menús digitales" },
  description: "Plataforma de menús digitales y pedidos para restaurantes.",
};

export const viewport: Viewport = { themeColor: "#141212", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${montserrat.variable} ${alfa.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
