// Plantillas visuales del menú del cliente. Cada restaurante guarda en
// restaurants.theme la plantilla elegida y, si quiere, sus propios colores.
// Todo lo que llega de la base de datos se valida: un color inválido se
// ignora y se usa el de la plantilla (así nunca se inyecta CSS).
import { z } from "zod";

export type Colores = {
  fondo: string;
  superficie: string;
  superficie2: string;
  texto: string;
  tenue: string;
  acento: string;
  acento2: string;
  resalte: string;
  textoAcento: string;
};

export const PLANTILLAS = {
  parrilla: {
    nombre: "Parrilla (oscuro)",
    colores: {
      fondo: "#141212", superficie: "#1d1918", superficie2: "#272120", texto: "#f5ede3", tenue: "#a99d94",
      acento: "#7c1d22", acento2: "#a02a30", resalte: "#f2b544", textoAcento: "#f5ede3",
    },
  },
  claro: {
    nombre: "Cafetería (claro)",
    colores: {
      fondo: "#f7f1e8", superficie: "#ffffff", superficie2: "#efe6d8", texto: "#2b211c", tenue: "#6b5d53",
      acento: "#9b2c2c", acento2: "#b83a3a", resalte: "#8a5300", textoAcento: "#ffffff",
    },
  },
  campo: {
    nombre: "Campo (verde)",
    colores: {
      fondo: "#0f1a14", superficie: "#16241c", superficie2: "#1e3126", texto: "#eef3ea", tenue: "#a3b3a6",
      acento: "#2f6b45", acento2: "#3b8456", resalte: "#d8c36a", textoAcento: "#ffffff",
    },
  },
} satisfies Record<string, { nombre: string; colores: Colores }>;

export type NombrePlantilla = keyof typeof PLANTILLAS;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const texto = (max: number) => z.string().trim().min(1).max(max);

const esquemaTema = z.object({
  plantilla: z.enum(Object.keys(PLANTILLAS) as [NombrePlantilla, ...NombrePlantilla[]]).catch("parrilla"),
  colores: z.record(z.string(), z.unknown()).catch({}),
  lema: texto(80).optional().catch(undefined),
  etiquetas: z.array(z.unknown()).max(12).catch([]),
});

export type Tema = { plantilla: NombrePlantilla; colores: Colores; lema?: string; etiquetas: string[] };

export function leerTema(valor: unknown): Tema {
  const t = esquemaTema.parse(valor && typeof valor === "object" ? valor : {});
  const colores: Colores = { ...PLANTILLAS[t.plantilla].colores };
  for (const clave of Object.keys(colores) as (keyof Colores)[]) {
    const propio = hex.safeParse(t.colores[clave]);
    if (propio.success) colores[clave] = propio.data;
  }
  const etiquetas = t.etiquetas
    .map((e) => texto(24).safeParse(e))
    .filter((r) => r.success)
    .map((r) => r.data)
    .slice(0, 6);
  return { plantilla: t.plantilla, colores, lema: t.lema, etiquetas };
}

/** Variables CSS que usa la hoja de estilos del menú. */
export function variablesTema(colores: Colores): Record<`--m-${string}`, string> {
  return {
    "--m-fondo": colores.fondo,
    "--m-superficie": colores.superficie,
    "--m-superficie-2": colores.superficie2,
    "--m-texto": colores.texto,
    "--m-tenue": colores.tenue,
    "--m-acento": colores.acento,
    "--m-acento-2": colores.acento2,
    "--m-resalte": colores.resalte,
    "--m-texto-acento": colores.textoAcento,
  };
}
