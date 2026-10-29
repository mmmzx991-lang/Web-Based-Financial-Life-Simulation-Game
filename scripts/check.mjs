import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(join(directory, e.name))
      : /\.m?js$/.test(e.name)
        ? [join(directory, e.name)]
        : [],
  );
}
const sources = ["server", "public", "tests", "scripts"].flatMap(files);
for (const source of sources) {
  const result = spawnSync(process.execPath, ["--check", source], {
    stdio: "inherit",
  });
  if (result.status) process.exit(result.status);
}
console.log(`Syntax checked ${sources.length} JavaScript files.`);
