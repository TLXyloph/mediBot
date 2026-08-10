import { describe, expect, it, vi } from "vitest";
import { VitalPublisher, toVitalEvents, validateVitals } from "../server/vitals.js";
import type { EventSink } from "../server/vitals.js";

const reading = {
  hrBpm: 88,
  spo2Pct: 97,
  systolicMmHg: 118,
  diastolicMmHg: 76,
  confidence: 0.94,
};

describe("validateVitals", () => {
  it("normalizes a complete monitor reading", () => {
    expect(validateVitals({ ...reading, hrBpm: 88.4 })).toEqual({ ...reading, hrBpm: 88 });
  });

  it.each([
    [{ ...reading, hrBpm: 251 }, "hrBpm"],
    [{ ...reading, spo2Pct: 49 }, "spo2Pct"],
    [{ ...reading, systolicMmHg: 70, diastolicMmHg: 80 }, "systolicMmHg"],
  ])("rejects unsafe or impossible values", (candidate, expected) => {
    expect(() => validateVitals(candidate)).toThrow(expected);
  });
});

describe("toVitalEvents", () => {
  it("maps a reading to per-vital {name,value} events sharing one ts", () => {
    const events = toVitalEvents(reading, 1234);
    expect(events).toHaveLength(4);
    expect(events.map((e) => e.payload)).toEqual([
      { name: "hr", value: 88 },
      { name: "spo2", value: 97 },
      { name: "sbp", value: 118 },
      { name: "dbp", value: 76 },
    ]);
    for (const e of events) {
      expect(e).toMatchObject({ ts: 1234, type: "vital", source: "vision", role: "medic", conf: 0.94, refs: [] });
    }
  });
});

describe("VitalPublisher", () => {
  it("publishes changes and suppresses identical consecutive readings", async () => {
    const appendVital = vi.fn(async () => "event-1");
    const publisher = new VitalPublisher({ appendVital } satisfies EventSink);

    await expect(publisher.publish(reading)).resolves.toMatchObject({
      accepted: true,
      duplicate: false,
      eventId: "event-1",
    });
    await expect(publisher.publish(reading)).resolves.toEqual({ accepted: false, duplicate: true });
    await expect(publisher.publish({ ...reading, hrBpm: 94 })).resolves.toMatchObject({
      accepted: true,
      duplicate: false,
    });
    // 4 per-vital events per accepted reading × 2 accepted publishes
    expect(appendVital).toHaveBeenCalledTimes(8);
  });

  it("does not suppress a retry after an append failure", async () => {
    const appendVital = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("event-2");
    const publisher = new VitalPublisher({ appendVital } satisfies EventSink);

    await expect(publisher.publish(reading)).rejects.toThrow("offline");
    await expect(publisher.publish(reading)).resolves.toMatchObject({ eventId: "event-2" });
    // 1 failed append, then 4 successful per-vital appends on retry
    expect(appendVital).toHaveBeenCalledTimes(5);
  });
});
