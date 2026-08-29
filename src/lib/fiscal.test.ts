import { describe, it, expect } from "vitest";
import {
  canonicalize,
  computeEventHash,
  computeCloseHash,
  verifyEvents,
  verifyCloses,
} from "./fiscal";

describe("canonicalize", () => {
  it("produces stable output regardless of source key order", () => {
    expect(canonicalize({ b: 2, a: 1 })).toBe(canonicalize({ a: 1, b: 2 }));
    expect(canonicalize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("sorts nested object keys recursively", () => {
    expect(canonicalize({ z: { y: 2, x: 1 } })).toBe('{"z":{"x":1,"y":2}}');
  });

  it("preserves array order", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("treats null and undefined as null", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(undefined)).toBe("null");
  });

  it("handles booleans, numbers and bigints", () => {
    expect(canonicalize(true)).toBe("true");
    expect(canonicalize(false)).toBe("false");
    expect(canonicalize(1.5)).toBe("1.5");
    expect(canonicalize(0)).toBe("0");
    expect(canonicalize(BigInt(-3))).toBe("-3");
  });

  it("escapes strings as JSON", () => {
    expect(canonicalize('a"b')).toBe('"a\\"b"');
    expect(canonicalize("é")).toBe('"é"');
  });

  it("is deterministic across calls for mixed payloads", () => {
    const obj = { c: 3, a: 1, b: [2, 1], n: null, s: "x", o: { q: 9, p: 8 } };
    expect(canonicalize(obj)).toBe(canonicalize(obj));
  });
});

describe("computeEventHash", () => {
  const ts = new Date("2026-01-01T00:00:00.000Z");

  it("returns a 64-char lowercase hex SHA-256", () => {
    const h = computeEventHash(null, 1, "VENTE", ts, "{}");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for identical input", () => {
    expect(computeEventHash(null, 1, "VENTE", ts, "{}")).toBe(
      computeEventHash(null, 1, "VENTE", ts, "{}"),
    );
  });

  it("changes when ANY field changes", () => {
    const base = computeEventHash(null, 1, "VENTE", ts, "{}");
    expect(computeEventHash("abc", 1, "VENTE", ts, "{}")).not.toBe(base);
    expect(computeEventHash(null, 2, "VENTE", ts, "{}")).not.toBe(base);
    expect(computeEventHash(null, 1, "REMBOURSEMENT", ts, "{}")).not.toBe(base);
    expect(
      computeEventHash(null, 1, "VENTE", new Date("2026-01-02T00:00:00.000Z"), "{}"),
    ).not.toBe(base);
    expect(computeEventHash(null, 1, "VENTE", ts, '{"x":1}')).not.toBe(base);
  });

  it("treats null and undefined previousHash identically", () => {
    expect(computeEventHash(null, 1, "VENTE", ts, "{}")).toBe(
      computeEventHash(undefined as unknown as null, 1, "VENTE", ts, "{}"),
    );
  });
});

describe("verifyEvents", () => {
  function buildChain(n: number) {
    const events: {
      sequence: number;
      type: string;
      timestamp: Date;
      dataJson: string;
      previousHash: string | null;
      hash: string;
    }[] = [];
    let prev: string | null = null;
    for (let i = 1; i <= n; i++) {
      const t = new Date(2026, 0, i);
      const data = canonicalize({ seq: i, total: i * 10 });
      const hash = computeEventHash(prev, i, "VENTE", t, data);
      events.push({ sequence: i, type: "VENTE", timestamp: t, dataJson: data, previousHash: prev, hash });
      prev = hash;
    }
    return events;
  }

  it("accepts a valid chain", () => {
    const r = verifyEvents(buildChain(5));
    expect(r.ok).toBe(true);
    expect(r.eventsChecked).toBe(5);
    expect(r.firstBreakAt).toBeNull();
    expect(r.lastSequence).toBe(5);
  });

  it("accepts an empty chain", () => {
    const r = verifyEvents([]);
    expect(r.ok).toBe(true);
    expect(r.eventsChecked).toBe(0);
    expect(r.lastSequence).toBe(0);
  });

  it("accepts a single-event chain (previousHash null)", () => {
    const r = verifyEvents(buildChain(1));
    expect(r.ok).toBe(true);
    expect(r.eventsChecked).toBe(1);
  });

  it("detects a tampered data payload", () => {
    const events = buildChain(3);
    events[1].dataJson = canonicalize({ seq: 2, total: 999 });
    const r = verifyEvents(events);
    expect(r.ok).toBe(false);
    expect(r.firstBreakAt).toBe(2);
  });

  it("detects a tampered hash and propagates the break", () => {
    const events = buildChain(3);
    events[1].hash = "0".repeat(64);
    const r = verifyEvents(events);
    expect(r.ok).toBe(false);
    expect(r.firstBreakAt).toBe(2);
  });

  it("rejects a first event with a non-null previousHash", () => {
    const events = buildChain(3);
    events[0].previousHash = "deadbeef";
    const r = verifyEvents(events);
    expect(r.ok).toBe(false);
    expect(r.firstBreakAt).toBe(1);
  });

  it("sorts out-of-order input by sequence before verifying", () => {
    const r = verifyEvents(buildChain(3).reverse());
    expect(r.ok).toBe(true);
  });
});

describe("computeCloseHash / verifyCloses", () => {
  function buildCloses(periods: string[]) {
    const closes: {
      period: string;
      timestamp: Date;
      dataJson: string;
      previousHash: string | null;
      hash: string;
    }[] = [];
    let prev: string | null = null;
    const t = new Date(2026, 0, 1);
    for (const p of periods) {
      const data = canonicalize({ period: p, salesTotal: 100 });
      const hash = computeCloseHash(prev, p, t, data);
      closes.push({ period: p, timestamp: t, dataJson: data, previousHash: prev, hash });
      prev = hash;
    }
    return closes;
  }

  it("accepts a valid monthly close chain", () => {
    const r = verifyCloses(buildCloses(["2026-01", "2026-02", "2026-03"]));
    expect(r.ok).toBe(true);
    expect(r.eventsChecked).toBe(3);
  });

  it("accepts an empty close chain", () => {
    const r = verifyCloses([]);
    expect(r.ok).toBe(true);
  });

  it("detects a tampered close hash", () => {
    const closes = buildCloses(["2026-01", "2026-02"]);
    closes[1].hash = "x".repeat(64);
    const r = verifyCloses(closes);
    expect(r.ok).toBe(false);
  });

  it("detects a broken previousHash link", () => {
    const closes = buildCloses(["2026-01", "2026-02", "2026-03"]);
    closes[2].previousHash = "broken";
    const r = verifyCloses(closes);
    expect(r.ok).toBe(false);
  });
});
