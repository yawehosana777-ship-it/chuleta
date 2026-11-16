import Link from "next/link";

export default function Inicio() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="font-titulo text-4xl">Menús digitales</h1>
      <p className="max-w-sm text-tenue">Menús, pedidos de mesa y a domicilio para restaurantes.</p>
      <Link
        href="/acceso"
        className="flex h-12 items-center rounded-2xl bg-gradient-to-b from-guinda-2 to-guinda px-6 font-bold"
      >
        Entrar al panel
      </Link>
    </main>
  );
}
