import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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


test("optional dedupe scopes IDs to topics and rejects conflicting selected records", () => {
  const other = { ...event, topic: "payment.failed" as const };
  const seen: string[] = [];
  const stats = replay.replayEvents([event, event, other], (e) => seen.push(e.topic), { dedupe: true });
  assert.deepEqual(seen, ["payment.created", "payment.failed"]);
  assert.equal(stats.selected, 3);
  assert.equal(stats.delivered, 2);
  assert.equal(stats.duplicates, 1);
  assert.equal(replay.replayEvents([event, event], () => {}).delivered, 2);
  assert.throws(() => replay.replayEvents([event, { ...event, paymentId: "other" }],
    () => {}, { dedupe: true }), /conflicting/);
});


test("CLI emits dry-run summary and supports inclusive filters and dedupe", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "--dedupe", "--since", "2000"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const stats = JSON.parse(result.stdout);
  assert.equal(stats.selected, 3);
  assert.equal(stats.delivered, 2);
  assert.equal(stats.duplicates, 1);
});

test("CLI returns 2 without summary for invalid arguments and missing files", () => {
  for (const args of [["--since", "NaN"], ["--topic", "unknown"], ["--input", "missing.jsonl"]]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
  }
});

test("until and since select inclusive boundaries in file order", () => {
  const events = [{ ...event, timestamp: 0 }, event, { ...event, eventId: "e2" },
    { ...event, eventId: "e3", timestamp: 20 }, { ...event, eventId: "e4", timestamp: 30 }];
  const seen: string[] = [];
  const stats = replay.replayEvents(events, (e) => seen.push(e.eventId), { since: 10, until: 20 });
  assert.deepEqual(seen, ["e1", "e2", "e3"]);
  assert.deepEqual(stats, { selected: 3, delivered: 3, duplicates: 0,
    byTopic: { "payment.created": 3, "payment.failed": 0 } });
  assert.equal(replay.replayEvents(events, () => {}, { until: 0 }).delivered, 1);
  assert.equal(replay.replayEvents(events, () => {}, { since: 10, until: 10 }).delivered, 2);
  assert.equal(replay.replayEvents(events, () => {}, { until: Number.MAX_SAFE_INTEGER }).delivered, 5);
});

test("replay rejects invalid time bounds and reversed ranges before delivery", () => {
  for (const bound of ["since", "until"] as const) {
    for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => replay.replayEvents([], () => assert.fail(), { [bound]: value }), /safe integer/);
    }
  }
  assert.throws(() => replay.replayEvents([event], () => assert.fail(), { since: 11, until: 10 }), /since.*until/);
});

test("until filters records before deduplication and conflict checks", () => {
  const events = [event, event, { ...event, paymentId: "conflict", timestamp: 20 }];
  const stats = replay.replayEvents(events, () => {}, { until: 10, dedupe: true });
  assert.deepEqual(stats, { selected: 2, delivered: 1, duplicates: 1,
    byTopic: { "payment.created": 1, "payment.failed": 0 } });
});

test("CLI supports inclusive until combined with since and dedupe", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts",
    "--since", "2000", "--until", "2000", "--dedupe"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { selected: 2, delivered: 1, duplicates: 1,
    byTopic: { "payment.created": 0, "payment.failed": 1 } });
});

test("CLI rejects invalid until syntax, unsafe bounds and reversed ranges", () => {
  for (const args of [["--until"], ["--until", ""], ["--until", "-1"], ["--until", "1.5"],
    ["--until", "NaN"], ["--until", "9007199254740992"], ["--since", "9007199254740992"],
    ["--since", "2000", "--until", "1000"]]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { encoding: "utf8" });
    assert.equal(result.status, 2, result.stdout);
    assert.equal(result.stdout, "");
    assert.notEqual(result.stderr, "");
  }
});

test("CLI still validates chronological order beyond replay boundaries", () => {
  const directory = mkdtempSync(join(tmpdir(), "event-replay-until-"));
  const input = join(directory, "events.jsonl");
  try {
    writeFileSync(input, [event, { ...event, timestamp: 20 }, { ...event, timestamp: 19 }]
      .map((e) => JSON.stringify(e)).join("\n"));
    for (const args of [["--until", "10"], ["--limit", "1"]]) {
      const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "--input", input,
        ...args], { encoding: "utf8" });
      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /line 3.*order/);
    }
  } finally {
    rmSync(input, { force: true });
    rmdirSync(directory);
  }
});

test("limit counts matched records before dedupe and excludes later conflicts from stats", () => {
  const events = [{ ...event, timestamp: 0 }, { ...event, topic: "payment.failed" as const },
    event, event, { ...event, paymentId: "later-conflict" }, { ...event, eventId: "later" }];
  const seen: string[] = [];
  const stats = replay.replayEvents(events, (e) => seen.push(e.eventId),
    { topic: "payment.created", since: 10, until: 10, limit: 2, dedupe: true });
  assert.deepEqual(seen, ["e1"]);
  assert.deepEqual(stats, { selected: 2, delivered: 1, duplicates: 1,
    byTopic: { "payment.created": 1, "payment.failed": 0 } });
});

test("limit preserves equal-time file order and synchronous delivery across topics", () => {
  const events = [event, { ...event, eventId: "e2", topic: "payment.failed" as const },
    { ...event, eventId: "e3", timestamp: 20 }];
  const seen: string[] = [];
  const stats = replay.replayEvents(events, (e) => seen.push(e.eventId), { limit: 2 });
  assert.deepEqual(seen, ["e1", "e2"]);
  assert.deepEqual(stats, { selected: 2, delivered: 2, duplicates: 0,
    byTopic: { "payment.created": 1, "payment.failed": 1 } });
  assert.equal(replay.replayEvents(events, () => {}, { limit: Number.MAX_SAFE_INTEGER }).selected, 3);
});

test("replay rejects invalid limits before delivery even for empty input", () => {
  for (const limit of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => replay.replayEvents([], () => assert.fail(), { limit }), /positive safe integer/);
  }
});

test("dedupe checks conflicts inside the limit but does not inspect records after it", () => {
  const events = [event, { ...event, paymentId: "conflicting" }];
  assert.equal(replay.replayEvents(events, () => {}, { limit: 1, dedupe: true }).delivered, 1);
  assert.throws(() => replay.replayEvents(events, () => {}, { limit: 2, dedupe: true }), /conflicting/);
});

test("CLI limits the filtered selection before dedupe", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "--since", "2000",
    "--until", "3000", "--limit", "2", "--dedupe"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { selected: 2, delivered: 1, duplicates: 1,
    byTopic: { "payment.created": 0, "payment.failed": 1 } });
});

test("CLI rejects malformed, zero and unsafe limits without a summary", () => {
  for (const args of [["--limit"], ["--limit", ""], ["--limit", "0"], ["--limit", "-1"],
    ["--limit", "1.5"], ["--limit", "NaN"], ["--limit", "9007199254740992"]]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { encoding: "utf8" });
    assert.equal(result.status, 2, result.stdout);
    assert.equal(result.stdout, "");
    assert.notEqual(result.stderr, "");
  }
});
