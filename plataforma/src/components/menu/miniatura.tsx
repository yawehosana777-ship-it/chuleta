import Image from "next/image";
import type { Icono } from "@/lib/menu/tipos";
import { IconoCategoria } from "./iconos";
import s from "./menu.module.css";

/** Foto del producto o, si no tiene, la ilustración de su categoría. */
export function Miniatura({ imagen, icono, tamano = 72 }: { imagen: string | null; icono: Icono; tamano?: number }) {
  return (
    <span className={s.miniatura} aria-hidden="true">
      {imagen ? <Image src={imagen} alt="" fill sizes={`${tamano}px`} /> : <IconoCategoria icono={icono} />}
    </span>
  );
}
