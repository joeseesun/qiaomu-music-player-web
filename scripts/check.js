const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const required = [
  "server.js",
  "dist/index.html",
  "src/App.tsx",
  "src/main.tsx",
  "src/styles.css",
  "Dockerfile",
  "docker-compose.yml"
];

let ok = true;
for (const rel of required) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.error(`Missing ${rel}`);
    ok = false;
  }
}

const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
if (!server.includes("createServer")) {
  console.error("server.js does not create an HTTP server");
  ok = false;
}

if (!ok) {
  process.exit(1);
}

console.log("Build checks passed.");
