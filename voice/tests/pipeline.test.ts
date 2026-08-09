import { test } from "node:test";
import assert from "node:assert/strict";
import { createPipeline } from "../src/pipeline.js";
import { VoiceOSPtt } from "../src/voiceos-ptt.js";
import type { EventSink } from "../src/sink.js";

test("PTT triggers once across chunks, then debounces", () => {
  let holds = 0;
  const ptt = new VoiceOSPtt(6000, () => {}, (_ms, done) => {
    holds++;
    done();
  });
  ptt.observeChunk("hey voice");
  assert.equal(holds, 0);
  ptt.observeChunk(" os correction");
  assert.equal(holds, 1);
  ptt.observeChunk("hey voiceos again");
  assert.equal(holds, 1);
});

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

test("same command via ears then VoiceOS within 12s appends once", () => {
  const pipeline = createPipeline(stubSink());
  const first = pipeline("correction heart rate 118"); // ears grammar path
  assert.equal(first.length, 1);
  assert.equal(first[0].type, "correction");
  const second = pipeline("heart rate 118", { kind: "correction" }); // VoiceOS MCP path
  assert.deepEqual(second, []);
  const different = pipeline("BP 90 over 60", { kind: "correction" });
  assert.equal(different.length, 1);
});

test("bare PTT trigger phrase is not evented", () => {
  const pipeline = createPipeline(stubSink());
  assert.deepEqual(pipeline("Hey VoiceOS."), []);
  assert.deepEqual(pipeline("voice os"), []);
  assert.deepEqual(pipeline("Hey, voice us."), []); // ASR manglings observed live
  assert.deepEqual(pipeline("Hey, boys OS"), []);
  const normal = pipeline("the voice on the radio said to hold");
  assert.equal(normal.length, 1); // only the trigger family is suppressed
});

test("mangled hey-anchored trigger fires the PTT chord", () => {
  let holds = 0;
  const ptt = new VoiceOSPtt(6000, () => {}, (_ms, done) => {
    holds++;
    done();
  });
  ptt.observeChunk("Hey, voice us.");
  assert.equal(holds, 1);
  const ptt2 = new VoiceOSPtt(6000, () => {}, (_ms, done) => {
    holds += 10;
    done();
  });
  ptt2.observeChunk("the boys os variant without a hey anchor");
  ptt2.observeChunk("chest hurts and he takes warfarin");
  assert.equal(holds, 1); // ambient speech never fires
});

test("VoiceOS pre-classified kind bypasses the grammar", () => {
  const pipeline = createPipeline(stubSink());
  const events = pipeline("BP 90 over 60", { kind: "correction" });
  assert.equal(events[0].type, "correction");
  assert.equal(events[0].payload.text, "BP 90 over 60");
});
