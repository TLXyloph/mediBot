// Compact read of the live events:timeline — debugging aid for integration.
//   npm run tail            # last 10 minutes
//   npm run tail -- 60      # last 60 minutes

import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { cfg, CONVEX_FNS } from "../src/config.js";

if (!cfg.convexUrl) {
  console.error("CONVEX_URL not set in voice/.env");
  process.exit(1);
}
const sinceMin = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 10;
const client = new ConvexHttpClient(cfg.convexUrl);
const rows = await client.query(anyApi[CONVEX_FNS.module][CONVEX_FNS.timeline], {
  since: Date.now() - sinceMin * 60_000,
});
const arr: Array<Record<string, unknown>> = Array.isArray(rows) ? rows : [];
if (arr.length === 0) console.log(`(no events in the last ${sinceMin} min)`);
for (const r of arr.slice(-40)) {
  const p = (r.payload ?? {}) as Record<string, unknown>;
  const text = p.text ?? p.say ?? p.question ?? JSON.stringify(p).slice(0, 60);
  console.log(
    `${new Date(Number(r.ts)).toLocaleTimeString()}  ${String(r.type).padEnd(14)} ${String(r.source).padEnd(7)} ${String(r.role ?? "-").padEnd(9)} ${String(text).slice(0, 70)}`,
  );
}
