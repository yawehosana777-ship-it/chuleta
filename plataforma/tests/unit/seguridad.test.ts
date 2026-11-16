import { describe, expect, it } from "vitest";
import { generarToken, hashToken, tokenConFormatoValido } from "@/lib/invitaciones";
import { esquemaAceptarInvitacion, rutaInternaSegura } from "@/lib/validaciones";
import { cartaDonChuleta } from "../../supabase/seed/don-chuleta";

describe("tokens de invitación", () => {
  it("son únicos, con formato válido, y el hash no revela el token", () => {
    const a = generarToken();
    const b = generarToken();
    expect(a).not.toBe(b);
    expect(tokenConFormatoValido(a)).toBe(true);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).not.toContain(a);
  });

  it("rechaza tokens con formato extraño", () => {
    expect(tokenConFormatoValido("../../etc")).toBe(false);
    expect(tokenConFormatoValido("")).toBe(false);
  });
});

describe("redirecciones después de iniciar sesión", () => {
  it("permite rutas internas", () => {
    expect(rutaInternaSegura("/panel/menu")).toBe("/panel/menu");
  });
  it("bloquea redirecciones a otros sitios", () => {
    expect(rutaInternaSegura("//sitio-malo.com")).toBe("/panel");
    expect(rutaInternaSegura("https://sitio-malo.com")).toBe("/panel");
    expect(rutaInternaSegura("/\\sitio-malo.com")).toBe("/panel");
    expect(rutaInternaSegura(null)).toBe("/panel");
  });
});

describe("crear cuenta desde invitación", () => {
  it("exige contraseña de 10+ caracteres y que coincidan", () => {
    expect(esquemaAceptarInvitacion.safeParse({ nombre: "Ana", password: "corta", confirmar: "corta" }).success).toBe(false);
    expect(
      esquemaAceptarInvitacion.safeParse({ nombre: "Ana", password: "una frase larga", confirmar: "otra frase larga" }).success,
    ).toBe(false);
    expect(
      esquemaAceptarInvitacion.safeParse({ nombre: "Ana", password: "una frase larga", confirmar: "una frase larga" }).success,
    ).toBe(true);
  });
});

describe("carta de Don Chuleta", () => {
  it("tiene los 50 productos de la carta y precios no negativos", () => {
    const productos = cartaDonChuleta.flatMap((c) => c.productos);
    expect(productos).toHaveLength(50);
    expect(productos.every((p) => p.precio === null || p.precio >= 0)).toBe(true);
  });
});
