import assert from "node:assert/strict";
import test from "node:test";
import * as replay from "../src/replay.js";
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


test("replay filters without reordering and delivers synchronous callbacks", () => {
  const events = [event, { ...event, eventId: "e2", timestamp: 20 },
    { ...event, eventId: "e3", topic: "payment.failed" as const, timestamp: 30 }];
  const seen: string[] = [];
  const result = replay.replayEvents(events, (e) => seen.push(e.eventId),
    { topic: "payment.created", since: 20 });
  assert.deepEqual(seen, ["e2"]);
  assert.equal(result.selected, 1);
  assert.equal(result.delivered, 1);
  assert.deepEqual(result.byTopic, { "payment.created": 1, "payment.failed": 0 });
  assert.equal(replay.replayEvents([], () => assert.fail()).delivered, 0);
});

test("replay preserves callback failure without delivering later events", () => {
  const failure = new Error("handler failed");
  let calls = 0;
  assert.throws(() => replay.replayEvents([event, event], () => { calls++; throw failure; }),
    (error) => error === failure);
  assert.equal(calls, 1);
});
