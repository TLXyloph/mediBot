import { test } from "node:test";
import assert from "node:assert/strict";
import { TranscriptSegmenter } from "../src/segmenter.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("flushes on idle gap", async () => {
  const out: string[] = [];
  const seg = new TranscriptSegmenter((t) => out.push(t), 30);
  seg.push("chest ");
  seg.push("hurts");
  await sleep(80);
  assert.deepEqual(out, ["chest hurts"]);
  seg.dispose();
});

test("flushes immediately on finished flag", async () => {
  const out: string[] = [];
  const seg = new TranscriptSegmenter((t) => out.push(t), 5000);
  seg.push("giving ");
  seg.push("aspirin", { finished: true });
  assert.deepEqual(out, ["giving aspirin"]);
  seg.dispose();
});

test("flushes on external boundary and normalizes whitespace", () => {
  const out: string[] = [];
  const seg = new TranscriptSegmenter((t) => out.push(t), 5000);
  seg.push("  BP   is ");
  seg.push(" 120 over 80 ");
  seg.boundary();
  assert.deepEqual(out, ["BP is 120 over 80"]);
  seg.dispose();
});

test("speaker change forces a segment boundary", () => {
  const out: Array<{ t: string; s?: string }> = [];
  const seg = new TranscriptSegmenter((t, m) => out.push({ t, s: m.speaker }), 5000);
  seg.push("chest hurts", { speaker: "spk_1" });
  seg.push(" I copy", { speaker: "spk_2" });
  seg.boundary();
  assert.deepEqual(out, [
    { t: "chest hurts", s: "spk_1" },
    { t: "I copy", s: "spk_2" },
  ]);
  seg.dispose();
});

test("empty and too-short buffers do not emit", async () => {
  const out: string[] = [];
  const seg = new TranscriptSegmenter((t) => out.push(t), 30);
  seg.push("   ");
  seg.boundary();
  seg.push("a");
  seg.boundary();
  await sleep(50);
  assert.deepEqual(out, []);
  seg.dispose();
});
