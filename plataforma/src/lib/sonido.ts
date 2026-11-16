// Sonido de aviso generado en el navegador (sin archivos de audio).
// Los navegadores no dejan sonar nada hasta que la persona toca la pantalla
// una vez; por eso el panel pide "Toca para activar el sonido".

let contexto: AudioContext | null = null;

function obtener() {
  if (typeof window === "undefined") return null;
  contexto ??= new AudioContext();
  return contexto;
}

/** Intenta desbloquear el audio (llamar dentro de un toque o clic). */
export async function activarSonido() {
  const c = obtener();
  if (c && c.state === "suspended") await c.resume().catch(() => {});
  return c?.state === "running";
}

export const sonidoActivo = () => contexto?.state === "running";

/** Tres tonos cortos ascendentes: "¡pedido nuevo!". */
export function sonarAviso(veces = 1) {
  const c = obtener();
  if (!c || c.state !== "running") return false;
  const inicio = c.currentTime + 0.05;
  for (let v = 0; v < veces; v++) {
    [660, 880, 1100].forEach((frecuencia, i) => {
      const t = inicio + v * 0.9 + i * 0.18;
      const osc = c.createOscillator();
      const vol = c.createGain();
      osc.type = "sine";
      osc.frequency.value = frecuencia;
      vol.gain.setValueAtTime(0.0001, t);
      vol.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(vol).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }
  return true;
}
