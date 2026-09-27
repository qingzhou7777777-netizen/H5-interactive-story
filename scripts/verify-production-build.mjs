import { readdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const roots = [resolve("apps/h5/dist"), resolve("apps/admin/dist")];
const checkedExtensions = new Set([".html", ".js", ".css"]);
// React Router itself contains a harmless `http://localhost` URL-construction
// fallback. We specifically reject deployable API loopback endpoints.
const forbidden = [
  "http://localhost:3000",
  "https://localhost:3000",
  "127.0.0.1:3000",
];

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (checkedExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const violations = [];
for (const root of roots) {
  for (const file of await filesUnder(root)) {
    const content = await readFile(file, "utf8");
    for (const value of forbidden) {
      if (content.includes(value)) violations.push(`${file}: ${value}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(`生产构建仍包含本地地址：\n${violations.join("\n")}`);
}

console.info("生产构建校验通过：H5/Admin 不包含 localhost 或 127.0.0.1。 ");
