import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

/**
 * Cliente de BD único por proceso. En dev, Next recarga módulos: se cachea en
 * globalThis para no agotar conexiones.
 */
const globalForDb = globalThis as unknown as {
  __reservasSql?: ReturnType<typeof postgres>;
};

function createClient() {
  const env = getEnv();
  return postgres(env.DATABASE_URL, {
    max: 10,
    onnotice: () => {},
  });
}

export function getSql() {
  if (!globalForDb.__reservasSql) globalForDb.__reservasSql = createClient();
  return globalForDb.__reservasSql;
}

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!cachedDb) cachedDb = drizzle(getSql(), { schema });
  return cachedDb;
}

export { schema };
