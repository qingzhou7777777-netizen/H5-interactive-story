import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

import { defineConfig } from "prisma/config";

const envFile = resolve(process.cwd(), ".env");

if (existsSync(envFile)) {
  loadEnvFile(envFile);
}

export default defineConfig({
  earlyAccess: true,
  schema: "database/schema.prisma",
  migrations: {
    path: "database/migrations",
  },
});
