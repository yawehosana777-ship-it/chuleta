-- Fase 7 · Pegar completo en Supabase > SQL Editor y ejecutar (Run).
-- Copia de supabase/migrations/20261116001000_endurecimiento.sql

-- =====================================================================
-- Fase 7 · Endurecimiento (hallazgos de la auditoría automática)
--   1. app.audit() (función de los registros de cambios) y
--      app.ruta_imagen_valida() no deben estar disponibles para el público.
--   2. Límite contra pedidos falsos en ráfaga: máximo 30 pedidos nuevos por
--      minuto por restaurante. Se suma a los límites que ya existen
--      (40 por cuenta de mesa, 3 abiertos por teléfono en domicilio).
-- =====================================================================

-- ---------- 1. Funciones internas ----------
revoke all on function app.audit() from public, anon, authenticated;
-- La usa la regla CHECK de las fotos cuando el personal guarda: solo personal con sesión.
revoke all on function app.ruta_imagen_valida(text) from public, anon;
grant execute on function app.ruta_imagen_valida(text) to authenticated;

-- ---------- 2. Límite de pedidos por minuto ----------
create function app.limite_pedidos() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.orders
      where restaurant_id = new.restaurant_id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'too_many_requests' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function app.limite_pedidos() from public, anon, authenticated;

create trigger limite_pedidos before insert on public.orders
  for each row execute function app.limite_pedidos();
