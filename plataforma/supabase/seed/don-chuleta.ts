// Carta real de Don Chuleta (fotografías de la carta, nov-2026).
// Precios en quetzales tal como aparecen. null = precio pendiente de confirmar
// (la sección "Para Disfrutar" aparece tapada en la foto).

export type ProductoCarta = {
  nombre: string;
  precio: number | null;
  opciones?: { grupo: string; elecciones: string[] };
};
export type CategoriaCarta = { nombre: string; descripcion?: string; productos: ProductoCarta[] };

export const cartaDonChuleta: CategoriaCarta[] = [
  {
    nombre: "Nuestras Carnes",
    descripcion: "Acompañados de frijoles volteados, papa asada, cebollín y 3 tortillas.",
    productos: [
      { nombre: "Chuleta", precio: 30 },
      { nombre: "Costilla en Barbacoa", precio: 30 },
      { nombre: "Pechuga", precio: 30 },
      { nombre: "Viuda", precio: 35 },
      { nombre: "Chorizo", precio: 25 },
      { nombre: "Pollo Asado", precio: 25 },
      { nombre: "Churrasquito", precio: 23 },
      { nombre: "Puyazo Nacional", precio: 40 },
      { nombre: "Puyazo Importado", precio: 60 },
      { nombre: "Arrachera", precio: 60 },
    ],
  },
  {
    nombre: "Hamburguesas",
    descripcion: "Cualquier hamburguesa es acompañada de papas fritas.",
    productos: [
      { nombre: "Hamburguesa Simple", precio: 35 },
      { nombre: "Hamburguesa en Barbacoa", precio: 35 },
      { nombre: "Hamburguesa con Huevo", precio: 40 },
      { nombre: "Cheese Burger", precio: 55 },
    ],
  },
  {
    nombre: "Para Disfrutar",
    productos: [
      { nombre: "Alitas Buffalo", precio: null },
      { nombre: "Alitas en Barbacoa", precio: null },
      { nombre: "Alitas Teriyaki", precio: null },
      { nombre: "Alitas Mango Habanero", precio: null },
      { nombre: "Alitas de Mostaza", precio: null },
      { nombre: "Tacos de Birria", precio: null },
    ],
  },
  {
    nombre: "Postres",
    productos: [
      { nombre: "Pastel de Zanahoria", precio: 16 },
      { nombre: "Pastel de Queso Fresa", precio: 16 },
      { nombre: "Pastel de Tres Leches", precio: 16 },
      { nombre: "Pastel de Chocolate", precio: 16 },
    ],
  },
  {
    nombre: "Cervezas",
    productos: [
      { nombre: "Coronitas", precio: 7 },
      { nombre: "Corona", precio: 12 },
      { nombre: "Gallo", precio: 12 },
      { nombre: "Cabro Extra", precio: 12 },
      { nombre: "Monte Carlo", precio: 17 },
      { nombre: "Cabro Reserva", precio: 17 },
      { nombre: "Cimarrona", precio: 15 },
      { nombre: "Michelada de Gallo o Corona", precio: 20, opciones: { grupo: "Elige tu cerveza", elecciones: ["Gallo", "Corona"] } },
      { nombre: "Michelada de Cabro o Monte Carlo", precio: 25, opciones: { grupo: "Elige tu cerveza", elecciones: ["Cabro", "Monte Carlo"] } },
      { nombre: "Mineral Preparada", precio: 17 },
    ],
  },
  {
    nombre: "Bebidas Frías",
    productos: [
      { nombre: "Gaseosas", precio: 8 },
      { nombre: "Té Frío", precio: 8 },
      { nombre: "Refrescos Naturales", precio: 8 },
      { nombre: "Frappé Oreo", precio: 22 },
      { nombre: "Frappé Capuchino", precio: 22 },
      { nombre: "Frappé Mocaccino", precio: 22 },
      { nombre: "Frappé Piña Colada", precio: 22 },
      { nombre: "Frappé Cookies and Cream", precio: 22 },
    ],
  },
  {
    nombre: "Bebidas Calientes",
    productos: [
      { nombre: "Café", precio: 7 },
      { nombre: "Café con Leche", precio: 10 },
      { nombre: "Té de Manzanilla", precio: 8 },
      { nombre: "Capuchino", precio: 12 },
      { nombre: "Chocolate", precio: 10 },
      { nombre: "Chocolate con Leche", precio: 13 },
    ],
  },
  {
    nombre: "Tequila",
    productos: [
      { nombre: "Shot de Rancho Escondido", precio: 10 },
      { nombre: "Shot de Gran Malo", precio: 25 },
    ],
  },
];
