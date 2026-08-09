import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand, commandToEvents } from "../src/grammar.js";

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

test("bare wake word is not a command", () => {
  assert.equal(parseCommand("MediBot."), null);
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
