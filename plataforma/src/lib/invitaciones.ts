import { createHash, randomBytes } from "node:crypto";

export const DURACION_INVITACION_HORAS = 72;

/** Token aleatorio de 256 bits, apto para URL. Solo viaja en el enlace; en la base se guarda su hash. */
export function generarToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenConFormatoValido(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
