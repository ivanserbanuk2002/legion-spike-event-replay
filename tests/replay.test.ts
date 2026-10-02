import assert from "node:assert/strict";
import test from "node:test";
import * as parser from "../src/parser.js";

const event = { eventId: "e1", topic: "payment.created" as const, paymentId: "p1", timestamp: 10 };

test("parser preserves equal-time file order and ignores blank lines", () => {
  const text = JSON.stringify(event) + "\n\n" + JSON.stringify({ ...event, eventId: "e2" });
  assert.deepEqual(parser.parseEvents(text).map((e) => e.eventId), ["e1", "e2"]);
});

test("parser rejects malformed, unknown and out-of-order events with line numbers", () => {
  for (const changes of [{ eventId: " " }, { topic: "unknown" }, { paymentId: null },
                         { timestamp: -1 }, { timestamp: 1.5 }, { timestamp: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => parser.parseEvents(JSON.stringify({ ...event, ...changes })), /line 1/);
  }
  for (const text of ["broken", "null", "[]"]) assert.throws(() => parser.parseEvents(text), /line 1/);
  assert.throws(() => parser.parseEvents(JSON.stringify(event) + "\n" +
    JSON.stringify({ ...event, timestamp: 9 })), /line 2.*order/);
});
