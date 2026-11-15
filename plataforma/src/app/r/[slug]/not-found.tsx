import Link from "next/link";
import { TarjetaAcceso } from "@/components/ui/tarjeta-acceso";

export default function MenuNoEncontrado() {
  return (
    <TarjetaAcceso titulo="Menú no disponible" subtitulo="Este restaurante no existe o su menú no está publicado por ahora.">
      <Link href="/" className="mt-2 inline-block text-sm font-semibold text-dorado underline-offset-4 hover:underline">
        Ir al inicio
      </Link>
    </TarjetaAcceso>
  );
}
