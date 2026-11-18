// Zod configurado una sola vez para toda la aplicación.
// "jitless": no intenta ejecutar código generado al vuelo (eval). La política
// de contenido de la página (CSP) lo prohíbe, y así el navegador no registra
// avisos. Las validaciones funcionan exactamente igual.
import { z } from "zod";

z.config({ jitless: true });

export { z };
