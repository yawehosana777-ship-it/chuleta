import { z } from "@/lib/zod";

// Variables visibles en el navegador. Se leen una por una porque Next.js
// solo incrusta en el navegador las referencias literales a process.env.NEXT_PUBLIC_*.
const publicas = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "Falta NEXT_PUBLIC_SUPABASE_URL en .env.local" }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string({ message: "Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local" })
    .min(20, "Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local"),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
});

export function envPublico() {
  return publicas.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  });
}
