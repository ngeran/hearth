import { campusesResponseSchema } from "@hearth/shared";
import { asc } from "drizzle-orm";
import { Hono } from "hono";

import { createDb } from "../db/client";
import { campuses } from "../db/schema";
import { requireSession } from "../middleware/session";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();

routes.use("*", requireSession);

routes.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(campuses).orderBy(asc(campuses.name));

  return c.json(
    campusesResponseSchema.parse({
      campuses: rows.map((row) => ({
        id: row.id,
        name: row.name,
        nameEl: row.nameEl,
        city: row.city,
        cityEl: row.cityEl,
      })),
    }),
  );
});

export const campusesRoutes = routes;
