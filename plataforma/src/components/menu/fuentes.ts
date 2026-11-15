import { Allura, Oswald } from "next/font/google";

// Letra manuscrita de los títulos de sección y números de los precios.
export const allura = Allura({ variable: "--font-allura", weight: "400", subsets: ["latin"], display: "swap" });
export const oswald = Oswald({ variable: "--font-oswald", weight: ["500", "600"], subsets: ["latin"], display: "swap" });
