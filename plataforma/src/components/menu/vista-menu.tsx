import Image from "next/image";
import type { CSSProperties } from "react";
import type { MenuPublico, MesaCliente } from "@/lib/menu/tipos";
import { variablesTema } from "@/lib/menu/temas";
import { allura, oswald } from "./fuentes";
import { IconoFlecha, IconoUbicacion } from "./iconos";
import { MenuInteractivo } from "./menu-interactivo";
import s from "./menu.module.css";

/** Página completa del menú del cliente: bienvenida, portada y menú. Con mesa, se puede pedir. */
export function VistaMenu({ menu, mesa }: { menu: MenuPublico; mesa?: MesaCliente }) {
  const { restaurante: r } = menu;
  return (
    <div className={`${s.pagina} ${allura.variable} ${oswald.variable}`} style={variablesTema(r.tema.colores) as CSSProperties}>
      {r.portada && (
        <div className={s.fondoEscritorio} aria-hidden="true">
          <Image src={r.portada} alt="" fill sizes="100vw" quality={40} />
        </div>
      )}

      <div className={s.columna}>
        <div className={s.bienvenida} aria-hidden="true">
          {r.logo ? (
            <Image className={s.bienvenidaLogo} src={r.logo} alt="" width={230} height={169} loading="eager" fetchPriority="high" />
          ) : (
            <span className={s.bienvenidaNombre}>{r.nombre}</span>
          )}
        </div>

        <header className={s.portada}>
          {r.portada && (
            <Image className={s.portadaFoto} src={r.portada} alt={`Fachada de ${r.nombre}`} fill sizes="(min-width: 520px) 440px, 100vw" loading="eager" fetchPriority="high" />
          )}
          <p className={s.portadaSaludo}>Bienvenidos a</p>
          <h1 className={s.portadaTitulo}>{r.nombre}</h1>
          {r.tema.etiquetas.length > 0 && (
            <ul className={s.etiquetas} aria-label="Especialidades">
              {r.tema.etiquetas.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          {r.descripcion && <p className={s.direccion}>{r.descripcion}</p>}
          {r.direccion && (
            <p className={s.direccion}>
              <IconoUbicacion size={16} />
              {r.direccion}
            </p>
          )}
          <a className={s.botonPrincipal} href="#menu">
            Ver menú <IconoFlecha />
          </a>
          {r.tema.lema && <p className={s.lema}>{r.tema.lema}</p>}
        </header>

        <MenuInteractivo restaurante={r} categorias={menu.categorias} mesa={mesa} />
      </div>
    </div>
  );
}
