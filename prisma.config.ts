import "dotenv/config";
import { defineConfig } from "prisma/config";

// CLI (migrate, seed, studio) usa a conexão direta com o papel dono das tabelas.
// A aplicação usa DATABASE_URL (pooled, papel beedock_app, sujeito a RLS) via adapter em lib/db.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --env-file-if-exists=.env prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL,
  },
});
