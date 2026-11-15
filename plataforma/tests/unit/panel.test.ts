import { describe, expect, it } from "vitest";
import { correoEmpleado, permisosEfectivos, PERMISOS } from "@/lib/permisos";
import {
  esquemaAccesoEmpleado, esquemaCambioContrasena, esquemaEmpleado, esquemaGrupo, esquemaOpcion, esquemaProducto,
  esquemaRestaurante, precioACentavos, tipoDeImagen,
} from "@/lib/validaciones-panel";

const CAT = "8501d9ec-2724-403e-9fb4-a37a50506526";

describe("precios", () => {
  it("acepta formatos comunes y los pasa a centavos", () => {
    expect(precioACentavos("35")).toBe(3500);
    expect(precioACentavos("35.5")).toBe(3550);
    expect(precioACentavos("Q 35.50")).toBe(3550);
    expect(precioACentavos("1,250.00")).toBe(125000);
    expect(precioACentavos("0")).toBe(0);
  });
  it("vacío = precio por confirmar; texto raro = inválido", () => {
    expect(precioACentavos("")).toBeNull();
    expect(precioACentavos(undefined)).toBeNull();
    for (const malo of ["abc", "-5", "35.555", "1e3", "35,5,5.00.0", "9999999"]) expect(precioACentavos(malo)).toBe("invalido");
  });
});

describe("formulario de producto", () => {
  it("lee casillas y precio", () => {
    const p = esquemaProducto.parse({ nombre: " Chuleta ", precio: "30", categoria: CAT, activo: "on" });
    expect(p).toMatchObject({ nombre: "Chuleta", precio: 3000, activo: true, agotado: false, destacado: false, descripcion: null });
  });
  it("rechaza precio inválido, nombre vacío y categoría falsa", () => {
    const r = esquemaProducto.safeParse({ nombre: "", precio: "treinta", categoria: "1; drop table" });
    expect(r.success).toBe(false);
    const campos = r.error!.issues.map((i) => i.path[0]);
    expect(campos).toEqual(expect.arrayContaining(["nombre", "precio", "categoria"]));
  });
});

describe("opciones", () => {
  it("el máximo no puede ser menor que el mínimo", () => {
    expect(esquemaGrupo.safeParse({ nombre: "Cerveza", minimo: 2, maximo: 1 }).success).toBe(false);
    expect(esquemaGrupo.parse({ nombre: "Cerveza", minimo: "1", maximo: "1" })).toEqual({ nombre: "Cerveza", minimo: 1, maximo: 1 });
  });
  it("el precio extra de una opción es obligatorio (0 si no cuesta más)", () => {
    expect(esquemaOpcion.parse({ nombre: "Corona", extra: "0" }).extra).toBe(0);
    expect(esquemaOpcion.parse({ nombre: "Queso", extra: "5" }).extra).toBe(500);
    expect(esquemaOpcion.safeParse({ nombre: "Queso", extra: "" }).success).toBe(false);
  });
});

describe("datos del restaurante", () => {
  it("separa especialidades y limita su cantidad", () => {
    expect(esquemaRestaurante.parse({ nombre: "Don Chuleta", etiquetas: "Carnes, Cervezas ,, Postres" }).etiquetas).toEqual(["Carnes", "Cervezas", "Postres"]);
    expect(esquemaRestaurante.safeParse({ nombre: "X Y", etiquetas: "a,b,c,d,e,f,g" }).success).toBe(false);
  });
  it("ignora colores que no son #rrggbb y plantillas desconocidas", () => {
    const r = esquemaRestaurante.parse({ nombre: "Don Chuleta", acento: "red;}", plantilla: "hack" });
    expect(r.acento).toBe("");
    expect(r.plantilla).toBe("parrilla");
  });
});

describe("empleados", () => {
  it("usuario en minúsculas, sin espacios; contraseña de 10+", () => {
    const e = esquemaEmpleado.parse({ nombre: "Ana López", usuario: " Ana.Mesera ", contrasena: "temporal-123", rol: "staff", permisos: ["orders.view"] });
    expect(e.usuario).toBe("ana.mesera");
    expect(esquemaEmpleado.safeParse({ nombre: "Ana", usuario: "ana mesera", contrasena: "temporal-123" }).success).toBe(false);
    expect(esquemaEmpleado.safeParse({ nombre: "Ana", usuario: "ana", contrasena: "corta" }).success).toBe(false);
  });
  it("nunca se puede pedir rol de dueño ni el permiso de administrar empleados para el personal", () => {
    const e = esquemaEmpleado.parse({ nombre: "Ana", usuario: "ana", contrasena: "temporal-123", rol: "owner", permisos: ["staff.manage"] });
    expect(e.rol).toBe("staff");
    expect(e.permisos).toEqual([]);
  });
  it("correo interno por restaurante", () => {
    expect(correoEmpleado("Ana.Mesera", "don-chuleta")).toBe("ana.mesera.don-chuleta@empleados.invalid");
  });
  it("dueño y gerente tienen todo; el personal solo lo asignado", () => {
    expect(permisosEfectivos("owner", []).size).toBe(PERMISOS.length);
    expect([...permisosEfectivos("staff", ["menu.edit", "staff.manage", "inventado"])]).toEqual(["menu.edit"]);
  });
  it("acceso y cambio de contraseña", () => {
    expect(esquemaAccesoEmpleado.safeParse({ restaurante: "Don-Chuleta", usuario: "ana", contrasena: "x" }).success).toBe(true);
    expect(esquemaAccesoEmpleado.safeParse({ restaurante: "../x", usuario: "ana", contrasena: "x" }).success).toBe(false);
    expect(esquemaCambioContrasena.safeParse({ contrasena: "nueva-clave-1", confirmar: "otra-clave-12" }).success).toBe(false);
  });
});

describe("fotos: se revisa el contenido real del archivo", () => {
  const conCabecera = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
  it("reconoce JPG, PNG y WebP", () => {
    expect(tipoDeImagen(conCabecera(0xff, 0xd8, 0xff))?.ext).toBe("jpg");
    expect(tipoDeImagen(conCabecera(0x89, 0x50, 0x4e, 0x47))?.ext).toBe("png");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(tipoDeImagen(webp)?.ext).toBe("webp");
  });
  it("rechaza otros archivos aunque se llamen .jpg", () => {
    expect(tipoDeImagen(new TextEncoder().encode("<svg onload=alert(1)>....."))).toBeNull();
    expect(tipoDeImagen(new TextEncoder().encode("%PDF-1.7 aaaaaaaa"))).toBeNull();
    expect(tipoDeImagen(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});
