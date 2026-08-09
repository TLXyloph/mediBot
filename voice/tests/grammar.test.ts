import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand, commandToEvents } from "../src/grammar.js";
import { makeEvent } from "../src/contract.js";

test("unattributed events omit role entirely (brain validator rejects null)", () => {
  const e = makeEvent("utterance", { text: "chest hurts" });
  assert.equal("role" in e, false);
});

test("correction with em-dash and trailing period", () => {
  const c = parseCommand("Correction — BP 90 over 60.");
  assert.deepEqual(c, { kind: "correction", text: "BP 90 over 60" });
});

test("correction plain", () => {
  const c = parseCommand("correction BP 90 over 60");
  assert.deepEqual(c, { kind: "correction", text: "BP 90 over 60" });
});

test("correction mid-sentence does not trigger", () => {
  assert.equal(parseCommand("the correction was applied earlier"), null);
});

test("bare 'correction' with nothing after is not a command", () => {
  assert.equal(parseCommand("Correction."), null);
});

test("mark command", () => {
  const c = parseCommand("MediBot, mark epi given");
  assert.deepEqual(c, { kind: "mark", text: "epi given" });
});

test("mark with ASR spacing of wake word", () => {
  const c = parseCommand("medi bot mark time of arrest.");
  assert.deepEqual(c, { kind: "mark", text: "time of arrest" });
});

test("question keeps question mark", () => {
  const c = parseCommand("MediBot, when was the last epi?");
  assert.deepEqual(c, { kind: "question", text: "when was the last epi?" });
});

test("hey-prefixed question", () => {
  const c = parseCommand("Hey MediBot what's the rhythm");
  assert.deepEqual(c, { kind: "question", text: "what's the rhythm" });
});

test("plain speech is not a command", () => {
  assert.equal(parseCommand("patient says his chest hurts and he takes warfarin"), null);
});

test("bare wake word returns wake sentinel for the pipeline hangover", () => {
  assert.deepEqual(parseCommand("MediBot."), { kind: "wake", text: "" });
});

// ---- real ASR output observed live on 2026-08-09 (OOV wake word mangling) ----

test("ASR 'Merbau Mark Abby Given' → mark (say-voice variant)", () => {
  assert.deepEqual(parseCommand("Merbau Mark Abby Given"), { kind: "mark", text: "Abby Given" });
});

test("'Mark' itself never matches as a wake word", () => {
  assert.deepEqual(parseCommand("Mark epinephrine given"), { kind: "mark", text: "epinephrine given" });
});

test("ASR 'Metabott Mark Appy Given' → mark", () => {
  assert.deepEqual(parseCommand("Metabott Mark Appy Given"), { kind: "mark", text: "Appy Given" });
});

test("ASR 'metabolomic epi given' → mark via given-heuristic", () => {
  assert.deepEqual(parseCommand("metabolomic epi given"), { kind: "mark", text: "epi given" });
});

test("ASR 'Maddie Bart' alone → wake sentinel", () => {
  assert.deepEqual(parseCommand("Maddie Bart"), { kind: "wake", text: "" });
});

test("ASR 'Mark epinephrine given' (wake dropped) → bare mark", () => {
  assert.deepEqual(parseCommand("Mark epinephrine given"), { kind: "mark", text: "epinephrine given" });
});

test("ASR 'When was the last Epic?' (wake dropped) → bare query template", () => {
  assert.deepEqual(parseCommand("When was the last Epic?"), {
    kind: "question",
    text: "When was the last Epic?",
  });
});

test("ASR 'at the Defrin given.' stays a plain utterance (scribe's job)", () => {
  assert.equal(parseCommand("at the Defrin given."), null);
});

test("ASR 'That a boy, Mark. Epinephrine given.' → mark via window recovery", () => {
  assert.deepEqual(parseCommand("That a boy, Mark. Epinephrine given."), {
    kind: "mark",
    text: "Epinephrine given",
  });
});

test("ASR 'Never bought Mark Ecko given.' → mark via window recovery", () => {
  assert.deepEqual(parseCommand("Never bought Mark Ecko given."), {
    kind: "mark",
    text: "Ecko given",
  });
});

test("ambient given-statement without wake is NOT a command", () => {
  assert.equal(parseCommand("epi given two minutes ago"), null);
});

test("assumeWake treats bare text as post-wake", () => {
  assert.deepEqual(parseCommand("epi given", { assumeWake: true }), { kind: "mark", text: "epi given" });
  assert.deepEqual(parseCommand("when was the last epi", { assumeWake: true }), {
    kind: "question",
    text: "when was the last epi",
  });
});

test("correction event shape", () => {
  const [e] = commandToEvents({ kind: "correction", text: "BP 90 over 60" }, "correction BP 90 over 60");
  assert.equal(e.type, "correction");
  assert.equal(e.source, "voice");
  assert.equal(e.role, "medic");
  assert.equal(e.payload.text, "BP 90 over 60");
  assert.deepEqual(e.refs, []);
  assert.ok(typeof e.ts === "number" && e.ts > 0);
});

test("mark → intervention event", () => {
  const [e] = commandToEvents({ kind: "mark", text: "epi given" }, "MediBot, mark epi given");
  assert.equal(e.type, "intervention");
  assert.equal(e.payload.mark, true);
  assert.equal(e.payload.text, "epi given");
});

test("question → utterance event with question payload", () => {
  const raw = "MediBot, when was the last epi?";
  const [e] = commandToEvents({ kind: "question", text: "when was the last epi?" }, raw);
  assert.equal(e.type, "utterance");
  assert.equal(e.payload.question, "when was the last epi?");
  assert.equal(e.payload.text, raw);
  assert.equal(e.role, "medic");
});
