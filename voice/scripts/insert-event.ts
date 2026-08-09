// A4 verification helper: hand-insert a flag or timer event; the running dev
// process must speak it (< 2s). Works against Convex when CONVEX_URL is set,
// else against the local JSONL sink.
//   npm run insert:flag            npm run insert:timer
//   npm run insert:flag -- "Custom alert text"

import { makeEvent } from "../src/contract.js";
import { makeSink } from "../src/sink.js";

const [type = "flag", ...rest] = process.argv.slice(2);
if (type !== "flag" && type !== "timer") {
  console.error("usage: insert-event.ts flag|timer [text…]");
  process.exit(1);
}
const text =
  rest.join(" ").trim() ||
  (type === "flag"
    ? "Safety flag: aspirin conflicts with documented warfarin. Risk of bleeding."
    : "Rhythm check due now.");

const sink = makeSink();
await sink.append(makeEvent(type, { text, say: text }, { source: "system" }));
console.log(`[insert] appended ${type} via ${sink.label}\n[insert] "${text}"`);
sink.close();
setTimeout(() => process.exit(0), 150);
