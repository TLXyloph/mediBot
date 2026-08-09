import { test } from "node:test";
import assert from "node:assert/strict";
import { createPipeline } from "../src/pipeline.js";
import type { EventSink } from "../src/sink.js";

function stubSink(): EventSink {
  return {
    label: "stub",
    append: async () => {},
    watchAlerts: () => () => {},
    close: () => {},
  };
}

test("wake hangover: 'Maddie Bart' … pause … 'epi given' becomes one mark command", () => {
  const pipeline = createPipeline(stubSink());
  assert.deepEqual(pipeline("Maddie Bart"), []); // wake-only: held, nothing evented
  const events = pipeline("at the Defrin given.");
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "intervention");
  assert.equal(events[0].payload.mark, true);
});

test("wake hangover consumed once; later plain speech is a normal utterance", () => {
  const pipeline = createPipeline(stubSink());
  pipeline("MediBot");
  pipeline("epi given"); // consumes hangover
  const events = pipeline("patient is stable now");
  assert.equal(events[0].type, "utterance");
  assert.equal(events[0].payload.question, undefined);
});

test("fused segment emits scene utterance AND command events", () => {
  const pipeline = createPipeline(stubSink());
  const events = pipeline("He's still complaining of chest pain. Correction, BP 90 over 60.");
  assert.equal(events.length, 2);
  assert.equal(events[0].type, "utterance");
  assert.equal(events[0].payload.text, "He's still complaining of chest pain.");
  assert.equal(events[1].type, "correction");
  assert.equal(events[1].payload.text, "BP 90 over 60");
});

test("VoiceOS pre-classified kind bypasses the grammar", () => {
  const pipeline = createPipeline(stubSink());
  const events = pipeline("BP 90 over 60", { kind: "correction" });
  assert.equal(events[0].type, "correction");
  assert.equal(events[0].payload.text, "BP 90 over 60");
});
