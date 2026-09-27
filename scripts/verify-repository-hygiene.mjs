import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const skippedDirectories = new Set([".git", "node_modules", "dist", "coverage", ".vite", ".turbo"]);
const allowedEnvironmentFiles = new Set([
  ".env.example",
  ".env.development",
  ".env.production.example",
  ".env.static",
]);
const forbiddenExtensions = new Set([".dump", ".backup", ".bak", ".pem", ".key", ".p12", ".pfx", ".jks"]);
const signatures = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["JWT", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["OpenAI-style key", /sk-[A-Za-z0-9_-]{20,}/],
  ["AWS-style key", /(?:AKIA|ASIA)[A-Z0-9]{16}/],
  ["GitHub token", /(?:ghp_|github_pat_)[A-Za-z0-9_]+/],
];

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const violations = [];
const notices = [];
for (const path of await filesUnder(root)) {
  const name = path.split(/[\\/]/).at(-1) ?? "";
  const repositoryPath = relative(root, path).replaceAll("\\", "/");
  const metadata = await stat(path);

  if (name.startsWith(".env") && !allowedEnvironmentFiles.has(name)) {
    violations.push(`${repositoryPath}: environment file must not be committed`);
  }
  if (forbiddenExtensions.has(extname(name).toLowerCase()) || /tunnel-credentials.*\.json$/i.test(name)) {
    violations.push(`${repositoryPath}: credential or database export file`);
  }
  if (/(dump|backup)/i.test(name) && /\.(sql|zip|gz|7z)$/i.test(name)) {
    violations.push(`${repositoryPath}: probable database dump or backup`);
  }
  if (metadata.size > 95 * 1024 * 1024) {
    violations.push(`${repositoryPath}: file exceeds the 95 MiB repository limit`);
  } else if (metadata.size >= 10 * 1024 * 1024) {
    notices.push(`${repositoryPath}: ${(metadata.size / 1024 / 1024).toFixed(2)} MiB`);
  }

  if (metadata.size <= 2 * 1024 * 1024 && !/\.(png|jpg|jpeg|gif|mp4|zip)$/i.test(name)) {
    const text = await readFile(path, "utf8");
    for (const [kind, pattern] of signatures) {
      if (pattern.test(text)) violations.push(`${repositoryPath}: possible ${kind}`);
    }
  }
}

for (const notice of notices) console.info(`NOTICE large tracked candidate ${notice}`);
if (violations.length > 0) {
  throw new Error(`仓库卫生检查失败：\n${violations.join("\n")}`);
}
console.info("仓库卫生检查通过：未发现禁止的环境文件、凭据签名、数据库导出或超过95 MiB的文件。");
