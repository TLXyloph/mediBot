import { describe, expect, it, vi } from "vitest";
import { VitalPublisher, toVitalEvent, validateVitals } from "../server/vitals.js";
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

describe("toVitalEvent", () => {
  it("maps readings to the shared append-only event contract", () => {
    expect(toVitalEvent(reading, 1234)).toEqual({
      ts: 1234,
      type: "vital",
      source: "vision",
      role: "medic",
      payload: {
        hrBpm: 88,
        spo2Pct: 97,
        systolicMmHg: 118,
        diastolicMmHg: 76,
      },
      conf: 0.94,
      refs: [],
    });
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
    expect(appendVital).toHaveBeenCalledTimes(2);
  });

  it("does not suppress a retry after an append failure", async () => {
    const appendVital = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("event-2");
    const publisher = new VitalPublisher({ appendVital } satisfies EventSink);

    await expect(publisher.publish(reading)).rejects.toThrow("offline");
    await expect(publisher.publish(reading)).resolves.toMatchObject({ eventId: "event-2" });
    expect(appendVital).toHaveBeenCalledTimes(2);
  });
});
