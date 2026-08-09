// Setup check: verifies the Gemini key + finds the first working ears
// (model, modality) combo. `npm run check:gemini -- --tts` also speaks a test
// line through the TTS chain.

import { cfg } from "../src/config.js";
import { Ears } from "../src/ears.js";
import { Speaker } from "../src/tts.js";

if (!cfg.geminiApiKey) {
  console.error("FAIL: GEMINI_API_KEY not set in voice/.env");
  process.exit(1);
}

const ears = new Ears(
  () => {},
  () => {},
);
try {
  const combo = await ears.probe();
  console.log(`OK: ears will use ${combo.model} [${combo.modality}]`);
} catch (err) {
  console.error(`FAIL: ${String(err).slice(0, 300)}`);
  process.exit(1);
}

if (process.argv.includes("--tts")) {
  const speaker = new Speaker();
  speaker.say("MediBot voice check complete.");
  await speaker.idle();
  console.log("OK: TTS spoke");
}
process.exit(0);
