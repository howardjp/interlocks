import { access, readFile } from "node:fs/promises";

await access(".next/BUILD_ID");
await access(".next/server/app/page.js");
await access(".next/server/app/api/snapshot/route.js");

const manifest = JSON.parse(await readFile(".next/routes-manifest.json", "utf8"));
if (!Array.isArray(manifest.staticRoutes) || !Array.isArray(manifest.dynamicRoutes)) {
  throw new Error("Next.js route manifest is malformed");
}

console.log("Validated local production artifact: UI and persistence API routes are present.");
