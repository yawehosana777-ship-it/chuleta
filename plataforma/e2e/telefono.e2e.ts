// Fase 7: recorrido real en tamaño teléfono (Pixel 7) con Edge.
// Solo lectura: nada de lo que hace llega a la base de datos como pedido.
import { expect, test, type Page } from "@playwright/test";

const MENU = "/r/don-chuleta";

/** Ninguna página debe obligar a desplazarse de lado en un teléfono. */
async function sinDesplazamientoLateral(page: Page) {
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(sobra).toBeLessThanOrEqual(1);
}

test.describe("menú del cliente", () => {
  test("carga con categorías, sin desplazamiento lateral y con cabeceras de seguridad", async ({ page }) => {
    const respuesta = await page.goto(MENU);
    expect(respuesta?.status()).toBe(200);
    const cabeceras = respuesta!.headers();
    expect(cabeceras["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(cabeceras["x-content-type-options"]).toBe("nosniff");
    await expect(page.getByRole("heading", { level: 1, name: "Don Chuleta" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Categorías" })).toBeVisible();
    await sinDesplazamientoLateral(page);
  });

  test("buscar sin acentos encuentra el producto", async ({ page }) => {
    await page.goto(MENU);
    await page.getByRole("searchbox", { name: "Buscar productos" }).fill("cafe con leche");
    await expect(page.getByRole("button", { name: /Café con Leche/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Chuleta/ })).toHaveCount(0);
  });

  test("agregar al pedido suma bien y el producto sin precio no se puede pedir", async ({ page }) => {
    await page.goto(MENU);
    await page.getByRole("button", { name: /^Chuleta/ }).first().click();
    const hoja = page.getByRole("dialog");
    await hoja.getByRole("button", { name: "Más" }).click();
    await hoja.getByRole("button", { name: /Agregar/ }).click();
    await expect(page.getByRole("button", { name: /Ver mi pedido/ }).last()).toContainText("Q 60.00");

    await page.getByRole("button", { name: /^Alitas Buffalo/ }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: /Precio por confirmar/ })).toBeDisabled();
  });

  test("domicilio: sin datos, el formulario marca cada campo y no envía nada", async ({ page }) => {
    await page.goto(MENU);
    await page.getByRole("button", { name: /^Café/ }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: /Agregar/ }).click();
    await page.getByRole("button", { name: /Ver mi pedido/ }).last().click();
    const hoja = page.getByRole("dialog");
    await hoja.getByRole("button", { name: /Pedir a domicilio/ }).click();
    await expect(hoja.getByText("Gratis")).toBeVisible();
    await hoja.getByRole("button", { name: /Enviar pedido/ }).click();
    await expect(hoja.getByText("Escribe un teléfono de 8 dígitos, por ejemplo 5555-1234.").first()).toBeVisible();
    await expect(hoja.getByText("Confirma que tu dirección está dentro de la zona de entrega.")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${MENU}$`));
    await sinDesplazamientoLateral(page);
  });
});

test.describe("enlaces inventados y páginas privadas", () => {
  test("un código de mesa o de seguimiento inventado da 'no encontrado'", async ({ page }) => {
    expect((await page.goto(`${MENU}/mesa/${"0".repeat(24)}`))?.status()).toBe(404);
    expect((await page.goto(`/pedido/${"0".repeat(32)}`))?.status()).toBe(404);
    expect((await page.goto("/r/no-existe"))?.status()).toBe(404);
  });

  test("el panel sin sesión lleva a iniciar sesión", async ({ browser }) => {
    const limpio = await browser.newContext();
    const page = await limpio.newPage();
    await page.goto("/panel/don-chuleta/pedidos");
    await expect(page).toHaveURL(/\/acceso\?siguiente=/);
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await limpio.close();
  });

  test("acceso de empleados: usuario inventado da un mensaje genérico", async ({ browser }) => {
    const limpio = await browser.newContext();
    const page = await limpio.newPage();
    await page.goto("/acceso/empleado?r=don-chuleta");
    await page.getByLabel("Usuario").fill("no.existe");
    await page.getByLabel("Contraseña").fill("contrasena-incorrecta-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Usuario o contraseña incorrectos.")).toBeVisible();
    await sinDesplazamientoLateral(page);
    await limpio.close();
  });
});
