import { describe, expect, it } from "vitest";
import type { LineaCarrito } from "@/lib/menu/carrito";
import { enlaceWhatsApp, mensajePedido, numeroWhatsApp } from "@/lib/menu/whatsapp";
import { esquemaRestaurante } from "@/lib/validaciones-panel";

const linea = (nombre: string, precioUnitario: number, cantidad: number, extra: Partial<LineaCarrito> = {}): LineaCarrito => ({
  clave: nombre, productoId: nombre, nombre, detalle: [], opciones: [], nota: "", precioUnitario, cantidad, ...extra,
});

describe("numeroWhatsApp", () => {
  it("agrega el código de Guatemala a un número de 8 dígitos", () => {
    expect(numeroWhatsApp("5555-1234")).toBe("50255551234");
    expect(numeroWhatsApp(" 5555 1234 ")).toBe("50255551234");
  });
  it("respeta un número que ya trae código de país", () => {
    expect(numeroWhatsApp("+502 5555 1234")).toBe("50255551234");
    expect(numeroWhatsApp("+1 (305) 555-0100")).toBe("13055550100");
  });
  it("rechaza números incompletos o vacíos", () => {
    expect(numeroWhatsApp("")).toBeNull();
    expect(numeroWhatsApp(null)).toBeNull();
    expect(numeroWhatsApp("1234")).toBeNull();
    expect(numeroWhatsApp("0055551234")).toBeNull();
    expect(numeroWhatsApp("1234567890123456")).toBeNull();
  });
});

describe("mensajePedido", () => {
  const lineas = [
    linea("Chuleta", 3000, 2, { nota: "término medio" }),
    linea("Michelada de Gallo o Corona", 2000, 1, { detalle: ["Gallo"] }),
  ];

  it("lista productos, total y la mesa del QR", () => {
    const m = mensajePedido({ restaurante: "Don Chuleta", moneda: "GTQ", lineas, mesa: "Mesa 3", nombre: "Ana" });
    expect(m).toContain("Hola, quiero hacer un pedido en Don Chuleta:");
    expect(m).toContain("• 2 × Chuleta — Q 60.00\n   Nota: término medio");
    expect(m).toContain("• 1 × Michelada de Gallo o Corona (Gallo) — Q 20.00");
    expect(m).toContain("Total: Q 80.00");
    expect(m).toContain("Mesa 3");
    expect(m).toContain("Nombre: Ana");
    expect(m).toContain("Pago en efectivo.");
  });

  it("indica para llevar o a domicilio con la dirección", () => {
    expect(mensajePedido({ restaurante: "X", moneda: "GTQ", lineas, entrega: { tipo: "llevar" } })).toContain("Para llevar");
    const m = mensajePedido({ restaurante: "X", moneda: "GTQ", lineas, entrega: { tipo: "domicilio", direccion: " Barrio El Centro " } });
    expect(m).toContain("A domicilio: Barrio El Centro");
    expect(m).not.toContain("Nombre:");
  });
});

describe("enlaceWhatsApp", () => {
  it("codifica el mensaje para la dirección", () => {
    const url = enlaceWhatsApp("50255551234", "Hola & adiós\nTotal: Q 5.00");
    expect(url).toBe("https://wa.me/50255551234?text=Hola%20%26%20adi%C3%B3s%0ATotal%3A%20Q%205.00");
  });
});

describe("esquemaRestaurante: WhatsApp", () => {
  const base = { nombre: "Don Chuleta", plantilla: "parrilla", etiquetas: "" };
  it("acepta vacío (sin WhatsApp) y números válidos", () => {
    expect(esquemaRestaurante.parse({ ...base, whatsapp: "" }).whatsapp).toBeNull();
    expect(esquemaRestaurante.parse({ ...base, whatsapp: "5555-1234" }).whatsapp).toBe("5555-1234");
  });
  it("rechaza un número inválido con un mensaje claro", () => {
    const r = esquemaRestaurante.safeParse({ ...base, whatsapp: "12345" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toContain("WhatsApp válido");
  });
});
