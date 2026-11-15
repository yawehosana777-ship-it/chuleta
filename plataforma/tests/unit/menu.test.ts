import { describe, expect, it } from "vitest";
import { formatoDinero } from "@/lib/dinero";
import { armarMenu, type FilaCategoria, type FilaRestaurante } from "@/lib/menu/armar";
import {
  agregarLinea, alternarOpcion, cambiarCantidad, crearLinea, seleccionInicial, totalArticulos, totalCarrito,
} from "@/lib/menu/carrito";
import { urlImagen } from "@/lib/menu/imagenes";
import { leerTema, PLANTILLAS } from "@/lib/menu/temas";
import type { GrupoOpciones, Producto } from "@/lib/menu/tipos";

const SUPA = "https://proyecto.supabase.co";

describe("formato de dinero", () => {
  it("muestra quetzales con dos decimales", () => {
    expect(formatoDinero(3000)).toBe("Q 30.00");
    expect(formatoDinero(2550)).toBe("Q 25.50");
    expect(formatoDinero(123456)).toBe("Q 1,234.56");
  });
});

describe("rutas de imagen", () => {
  it("acepta archivos de la app y rutas de Storage", () => {
    expect(urlImagen("/menus/don-chuleta/logo.png", SUPA)).toBe("/menus/don-chuleta/logo.png");
    expect(urlImagen("abc/productos/foto.webp", SUPA)).toBe(`${SUPA}/storage/v1/object/public/menu/abc/productos/foto.webp`);
  });
  it("rechaza URLs externas, saltos de carpeta y extensiones peligrosas", () => {
    for (const mala of ["https://malo.com/x.png", "//malo.com/x.png", "/menus/../../etc/x.png", "javascript:alert(1)", "/x.svg", "a b.png", ""]) {
      expect(urlImagen(mala, SUPA)).toBeNull();
    }
    expect(urlImagen(null, SUPA)).toBeNull();
  });
});

describe("temas", () => {
  it("sin tema usa la plantilla parrilla", () => {
    expect(leerTema(null)).toEqual({ plantilla: "parrilla", colores: PLANTILLAS.parrilla.colores, lema: undefined, etiquetas: [] });
  });
  it("respeta plantilla y colores válidos", () => {
    const t = leerTema({ plantilla: "claro", colores: { acento: "#123456" }, lema: "Rico", etiquetas: ["Café", "Pan"] });
    expect(t.plantilla).toBe("claro");
    expect(t.colores.acento).toBe("#123456");
    expect(t.colores.fondo).toBe(PLANTILLAS.claro.colores.fondo);
    expect(t.lema).toBe("Rico");
    expect(t.etiquetas).toEqual(["Café", "Pan"]);
  });
  it("ignora colores con CSS inyectado y datos inválidos", () => {
    const t = leerTema({ plantilla: "inexistente", colores: { acento: "red; background:url(x)", fondo: 5 }, etiquetas: [1, "", "x".repeat(40), "Bien"] });
    expect(t.plantilla).toBe("parrilla");
    expect(t.colores.acento).toBe(PLANTILLAS.parrilla.colores.acento);
    expect(t.colores.fondo).toBe(PLANTILLAS.parrilla.colores.fondo);
    expect(t.etiquetas).toEqual(["Bien"]);
  });
});

const grupoCerveza: GrupoOpciones = {
  id: "g1", nombre: "Elige tu cerveza", min: 1, max: 1,
  opciones: [{ id: "o1", nombre: "Gallo", extra: 0 }, { id: "o2", nombre: "Corona", extra: 0 }],
};
const michelada: Producto = {
  id: "p1", nombre: "Michelada", descripcion: null, precio: 2000, agotado: false, destacado: false, imagen: null, grupos: [grupoCerveza],
};

describe("carrito", () => {
  it("elige por defecto la primera opción de un grupo obligatorio", () => {
    expect(seleccionInicial([grupoCerveza])).toEqual({ g1: ["o1"] });
  });

  it("una línea por combinación de opciones; la misma combinación suma cantidad", () => {
    const gallo = crearLinea(michelada, { g1: ["o1"] }, 1)!;
    const corona = crearLinea(michelada, alternarOpcion({ g1: ["o1"] }, grupoCerveza, "o2"), 2)!;
    let lineas = agregarLinea([], gallo);
    lineas = agregarLinea(lineas, corona);
    lineas = agregarLinea(lineas, gallo);
    expect(lineas).toHaveLength(2);
    expect(totalArticulos(lineas)).toBe(4);
    expect(totalCarrito(lineas)).toBe(8000);
  });

  it("suma el precio extra de las opciones", () => {
    const grupo: GrupoOpciones = { id: "g2", nombre: "Extras", min: 0, max: 2, opciones: [{ id: "a", nombre: "Queso", extra: 500 }, { id: "b", nombre: "Tocino", extra: 700 }, { id: "c", nombre: "Huevo", extra: 300 }] };
    const p: Producto = { ...michelada, grupos: [grupo] };
    let e = alternarOpcion({}, grupo, "a");
    e = alternarOpcion(e, grupo, "b");
    e = alternarOpcion(e, grupo, "c"); // ya hay 2 (máximo): no se agrega
    expect(e.g2).toEqual(["a", "b"]);
    expect(crearLinea(p, e, 2)!.precioUnitario).toBe(3200);
  });

  it("no permite pedir sin precio, agotado o sin la opción obligatoria", () => {
    expect(crearLinea({ ...michelada, precio: null }, { g1: ["o1"] }, 1)).toBeNull();
    expect(crearLinea({ ...michelada, agotado: true }, { g1: ["o1"] }, 1)).toBeNull();
    expect(crearLinea(michelada, { g1: [] }, 1)).toBeNull();
  });

  it("limita la cantidad entre 1 y 20 y quita la línea al llegar a 0", () => {
    const l = crearLinea(michelada, { g1: ["o1"] }, 99)!;
    expect(l.cantidad).toBe(20);
    expect(cambiarCantidad([l], l.clave, 5)[0].cantidad).toBe(20);
    expect(cambiarCantidad([{ ...l, cantidad: 1 }], l.clave, -1)).toEqual([]);
  });
});

describe("armar el menú público", () => {
  const restaurante: FilaRestaurante = {
    slug: "demo", name: "Demo", description: null, address: "Calle 1", phone: null, currency: "GTQ",
    logo_path: "/menus/demo/logo.png", cover_path: "https://malo.com/x.jpg", theme: { lema: "Hola" },
  };
  const filas: FilaCategoria[] = [
    { id: "c2", name: "Bebidas", description: null, icon: "fria", image_path: null, active: true, position: 2, products: [
      { id: "b", name: "Agua", description: null, price_cents: 500, active: true, sold_out: true, featured: false, position: 0, product_images: [], option_groups: [] },
    ] },
    { id: "c1", name: "Comidas", description: "Con tortillas", icon: "desconocido", image_path: null, active: true, position: 1, products: [
      { id: "z", name: "Oculto", description: null, price_cents: 100, active: false, sold_out: false, featured: false, position: 0, product_images: [], option_groups: [] },
      { id: "a", name: "Chuleta", description: null, price_cents: 3000, active: true, sold_out: false, featured: false, position: 1,
        product_images: [{ storage_path: "../malo.png", position: 0 }, { storage_path: "/menus/demo/chuleta.webp", position: 1 }], option_groups: [] },
    ] },
    { id: "c3", name: "Vacía", description: null, icon: "plato", image_path: null, active: true, position: 3, products: [] },
    { id: "c4", name: "Inactiva", description: null, icon: "plato", image_path: null, active: false, position: 0, products: [
      { id: "x", name: "X", description: null, price_cents: 1, active: true, sold_out: false, featured: false, position: 0, product_images: [], option_groups: [] },
    ] },
  ];

  const menu = armarMenu(restaurante, filas, SUPA);

  it("ordena por posición y quita categorías inactivas o vacías y productos inactivos", () => {
    expect(menu.categorias.map((c) => c.nombre)).toEqual(["Comidas", "Bebidas"]);
    expect(menu.categorias[0].productos.map((p) => p.nombre)).toEqual(["Chuleta"]);
  });

  it("valida imágenes e íconos", () => {
    expect(menu.categorias[0].icono).toBe("plato");
    expect(menu.categorias[0].productos[0].imagen).toBe("/menus/demo/chuleta.webp");
    expect(menu.restaurante.logo).toBe("/menus/demo/logo.png");
    expect(menu.restaurante.portada).toBeNull();
  });

  it("conserva el estado agotado y lee el tema", () => {
    expect(menu.categorias[1].productos[0].agotado).toBe(true);
    expect(menu.restaurante.tema.lema).toBe("Hola");
  });
});
