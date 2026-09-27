import { buildApp } from "./app.js";
import { readApiRuntimeConfig } from "./runtime-config.js";

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 3000);
const runtimeConfig = readApiRuntimeConfig();

const app = await buildApp({ runtimeConfig });

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, "graceful shutdown started");
  const timer = setTimeout(() => {
    app.log.error("graceful shutdown timed out");
    process.exit(1);
  }, runtimeConfig.shutdownTimeoutMs);
  timer.unref();
  try {
    await app.close();
    clearTimeout(timer);
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, "graceful shutdown failed");
    process.exit(1);
  }
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
