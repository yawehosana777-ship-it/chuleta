// Fase 3: empleados, permisos y fotos del menú.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { como, crearBaseDeDatos } from "./base-de-datos";

const U = {
  duenoA: "00000000-0000-0000-0000-0000000005a1",
  duenoB: "00000000-0000-0000-0000-0000000005b1",
  gerenteA: "00000000-0000-0000-0000-0000000005a2",
  meseroA: "00000000-0000-0000-0000-0000000005a3",
  cocinaA: "00000000-0000-0000-0000-0000000005a4",
  viejo: "00000000-0000-0000-0000-0000000005a5",
};
const R = { a: "10000000-0000-0000-0000-0000000005aa", b: "10000000-0000-0000-0000-0000000005bb" };
const CAT_A = "20000000-0000-0000-0000-0000000005aa";

let db: PGlite;
let membresiaMesero: string;
let membresiaCocina: string;

const crear = (actor: string, user: string, usuario: string, rol: string, permisos: string[] = []) =>
  como<{ id: string }>(db, "authenticated", actor,
    "select create_staff_member($1, $2, $3, 'Nombre', $4::member_role, $5::permission_code[]) as id",
    [R.a, user, usuario, rol, `{${permisos.join(",")}}`]);

beforeAll(async () => {
  db = await crearBaseDeDatos();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${U.duenoA}', 'a@x.gt'), ('${U.duenoB}', 'b@x.gt'),
      ('${U.gerenteA}', 'gerente.resto-a@empleados.test'),
      ('${U.meseroA}', 'mesero.resto-a@empleados.test'),
      ('${U.cocinaA}', 'cocina.resto-a@empleados.test');
    insert into auth.users (id, email, created_at) values
      ('${U.viejo}', 'viejo.resto-a@empleados.test', now() - interval '1 hour');
    insert into restaurants (id, slug, name, status) values
      ('${R.a}', 'resto-a', 'Resto A', 'active'), ('${R.b}', 'resto-b', 'Resto B', 'active');
    insert into memberships (restaurant_id, user_id, role) values
      ('${R.a}', '${U.duenoA}', 'owner'), ('${R.b}', '${U.duenoB}', 'owner');
    insert into categories (id, restaurant_id, name) values ('${CAT_A}', '${R.a}', 'Carnes');
  `);
});

describe("alta de empleados", () => {
  it("el dueño de otro restaurante no puede crear empleados aquí", async () => {
    await expect(crear(U.duenoB, U.meseroA, "mesero", "staff")).rejects.toThrow(/not_authorized/);
  });

  it("no se puede crear otro dueño", async () => {
    await expect(crear(U.duenoA, U.meseroA, "mesero", "owner")).rejects.toThrow(/not_authorized/);
  });

  it("rechaza una cuenta vieja o con otro usuario en el correo", async () => {
    await expect(crear(U.duenoA, U.viejo, "viejo", "staff")).rejects.toThrow(/staff_user_mismatch/);
    await expect(crear(U.duenoA, U.meseroA, "otro", "staff")).rejects.toThrow(/staff_user_mismatch/);
  });

  it("rechaza usuarios con caracteres no permitidos", async () => {
    await expect(crear(U.duenoA, U.meseroA, "Me sero!", "staff")).rejects.toThrow(/invalid_username/);
  });

  it("el dueño crea un mesero con permisos; staff.manage nunca se le asigna", async () => {
    const { rows } = await crear(U.duenoA, U.meseroA, "mesero", "staff", ["orders.view", "staff.manage"]);
    membresiaMesero = rows[0].id;
    const p = await como<{ permission: string }>(db, "postgres", null,
      "select permission from membership_permissions where membership_id = $1", [membresiaMesero]);
    expect(p.rows.map((r) => r.permission)).toEqual(["orders.view"]);
    const perfil = await como<{ username: string; must_change_password: boolean }>(db, "postgres", null,
      `select username, must_change_password from profiles where user_id = '${U.meseroA}'`);
    expect(perfil.rows[0]).toEqual({ username: "mesero", must_change_password: true });
  });

  it("la misma cuenta no se puede usar dos veces y el usuario no se repite", async () => {
    await expect(crear(U.duenoA, U.meseroA, "mesero", "staff")).rejects.toThrow(/username_taken|staff_user_mismatch/);
  });

  it("solo el dueño nombra gerentes", async () => {
    const { rows } = await crear(U.duenoA, U.gerenteA, "gerente", "manager");
    expect(rows[0].id).toBeTruthy();
  });

  it("un gerente puede crear personal pero no otro gerente", async () => {
    await expect(crear(U.gerenteA, U.cocinaA, "cocina", "manager")).rejects.toThrow(/not_authorized/);
    const { rows } = await crear(U.gerenteA, U.cocinaA, "cocina", "staff", ["menu.edit"]);
    membresiaCocina = rows[0].id;
  });

  it("un mesero sin staff.manage no puede crear empleados", async () => {
    await db.exec(`insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000005a9', 'nuevo.resto-a@empleados.test')`);
    await expect(crear(U.meseroA, "00000000-0000-0000-0000-0000000005a9", "nuevo", "staff")).rejects.toThrow(/not_authorized/);
  });
});

describe("administrar empleados", () => {
  it("el mesero no puede cambiarse permisos ni desactivar a otros", async () => {
    await expect(como(db, "authenticated", U.meseroA, "select set_staff_permissions($1, '{menu.edit}')", [membresiaMesero]))
      .rejects.toThrow(/not_authorized/);
    await expect(como(db, "authenticated", U.meseroA, "select set_staff_active($1, false)", [membresiaCocina]))
      .rejects.toThrow(/not_authorized/);
  });

  it("nadie puede desactivar al dueño", async () => {
    const { rows } = await como<{ id: string }>(db, "postgres", null,
      `select id from memberships where user_id = '${U.duenoA}'`);
    await expect(como(db, "authenticated", U.gerenteA, "select set_staff_active($1, false)", [rows[0].id]))
      .rejects.toThrow(/not_authorized/);
  });

  it("el dueño cambia permisos y desactiva; el desactivado pierde el acceso de inmediato", async () => {
    await como(db, "authenticated", U.duenoA, "select set_staff_permissions($1, '{menu.edit}')", [membresiaMesero]);
    const antes = await como(db, "authenticated", U.meseroA,
      `update categories set name = 'Carnes asadas' where id = '${CAT_A}' returning id`);
    expect(antes.rows).toHaveLength(1);

    await como(db, "authenticated", U.duenoA, "select set_staff_active($1, false)", [membresiaMesero]);
    const despues = await como(db, "authenticated", U.meseroA,
      `update categories set name = 'Hackeado' where id = '${CAT_A}' returning id`);
    expect(despues.rows).toHaveLength(0);
  });

  it("el empleado marca su contraseña como cambiada (solo la suya)", async () => {
    await como(db, "authenticated", U.cocinaA, "select mark_password_changed()");
    const { rows } = await como<{ username: string; must_change_password: boolean }>(db, "postgres", null,
      "select username, must_change_password from profiles where username in ('cocina', 'mesero') order by username");
    expect(rows).toEqual([
      { username: "cocina", must_change_password: false },
      { username: "mesero", must_change_password: true },
    ]);
  });
});

describe("permisos del menú (criterio de la Fase 3)", () => {
  it("personal sin menu.edit no puede modificar el menú", async () => {
    await db.exec(`insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000005b2', 'caja.resto-a@empleados.test')`);
    await crear(U.duenoA, "00000000-0000-0000-0000-0000000005b2", "caja", "staff", ["orders.view"]);
    const r = await como(db, "authenticated", "00000000-0000-0000-0000-0000000005b2",
      `update categories set name = 'X' where id = '${CAT_A}' returning id`);
    expect(r.rows).toHaveLength(0);
    await expect(como(db, "authenticated", "00000000-0000-0000-0000-0000000005b2",
      `insert into categories (restaurant_id, name) values ('${R.a}', 'Nueva')`)).rejects.toThrow(/row-level security/);
  });

  it("el personal no puede cambiar el slug ni el estado del restaurante", async () => {
    await expect(como(db, "authenticated", U.duenoA, `update restaurants set status = 'suspended' where id = '${R.a}'`))
      .rejects.toThrow(/permission denied/);
  });
});

describe("fotos en Storage", () => {
  it("solo se sube a la carpeta del propio restaurante y con menu.edit", async () => {
    await como(db, "authenticated", U.duenoA,
      `insert into storage.objects (bucket_id, name) values ('menu', '${R.a}/productos/x.webp')`);
    await expect(como(db, "authenticated", U.duenoA,
      `insert into storage.objects (bucket_id, name) values ('menu', '${R.b}/productos/x.webp')`)).rejects.toThrow(/row-level security/);
    await expect(como(db, "authenticated", U.duenoA,
      `insert into storage.objects (bucket_id, name) values ('menu', 'no-es-uuid/x.webp')`)).rejects.toThrow(/row-level security/);
    await expect(como(db, "anon", null,
      `insert into storage.objects (bucket_id, name) values ('menu', '${R.a}/x.webp')`)).rejects.toThrow(/permission denied|row-level security/);
  });

  it("otro restaurante no puede borrar fotos ajenas", async () => {
    const r = await como(db, "authenticated", U.duenoB, `delete from storage.objects where name like '${R.a}/%' returning id`);
    expect(r.rows).toHaveLength(0);
  });
});
