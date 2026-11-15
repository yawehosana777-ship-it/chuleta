// El dinero se maneja SIEMPRE en centavos enteros (Q 30.00 = 3000).
const SIMBOLOS: Record<string, string> = { GTQ: "Q" };

const formato = new Intl.NumberFormat("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 3000 → "Q 30.00" */
export function formatoDinero(centavos: number, moneda = "GTQ") {
  return `${SIMBOLOS[moneda] ?? moneda} ${formato.format(centavos / 100)}`;
}
