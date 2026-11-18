import { defineConfig, devices } from "@playwright/test";

// Pruebas en tamaño teléfono con el Edge que ya está instalado (no descarga navegadores).
// Solo leen: no envían pedidos ni cambian datos en Supabase.
// Uso: con `npm run dev` corriendo, `npm run test:telefono`.
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.URL_PRUEBAS ?? "http://localhost:3000",
    channel: "msedge",
    ...devices["Pixel 7"],
    locale: "es-GT",
    timezoneId: "America/Guatemala",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
