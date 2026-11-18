import type { NextConfig } from "next";

const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const desarrollo = process.env.NODE_ENV !== "production";

/**
 * Política de contenido: la página solo carga recursos propios y de Supabase
 * (datos, fotos y la conexión en vivo de pedidos). Así, aunque algo lograra
 * meterse en la página, no podría mandar datos a otro sitio ni mostrarse
 * dentro de otra página. ('unsafe-inline' lo exige Next.js para sus scripts
 * iniciales; en desarrollo también 'unsafe-eval' y la recarga en vivo.)
 */
const politicaContenido = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${desarrollo ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${supabase ? ` ${supabase}` : ""}`,
  "font-src 'self'",
  `connect-src 'self'${supabase ? ` ${supabase} ${supabase.replace(/^https/, "wss")}` : ""}${desarrollo ? " ws: wss:" : ""}`,
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  poweredByHeader: false,
  images: {
    qualities: [40, 75],
    // Fotos que los restaurantes suban a Supabase Storage (Fase 3).
    remotePatterns: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? [new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/menu/**`)]
      : [],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: politicaContenido },
          // Solo HTTPS una vez publicado (los navegadores lo ignoran en http://localhost).
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
  partialPrefetching: true,
  // Las fotos se reducen en el teléfono antes de subirlas (~1 MB); margen para 3 MB.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  turbopack: {
    rules: {
      "*.css": {
        // Los CSS Modules (*.module.css) siguen el camino normal de Next.js.
        condition: { not: { path: /\.module\.css$/ } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
