# legion-spike-event-replay

A tiny Node 20 + TypeScript tool for ordered dry-run replay of saved JSONL events.
It complements [event-bus](https://github.com/ivanserbanuk2002/legion-spike-event-bus).
No broker dependencies or network calls; the sample contains synthetic payment events.
The source CLI runs through the pinned `tsx` development runner installed by `npm ci`.
Each row has `eventId`, `topic`, `paymentId`, and a nonnegative safe-integer millisecond `timestamp`.
Supported topics are `payment.created` and `payment.failed`. IDs are nonblank strings.
This is a local replay helper; it does not execute payments or publish to a broker.

`replayEvents(events, listener, { topic?, since?, until?, limit?, dedupe? })` calls a synchronous listener
in file order. `since` and `until` are inclusive nonnegative safe-integer millisecond
bounds; invalid bounds or `since > until` throw before delivery. Omit either bound
for an open-ended range. Journals with decreasing timestamps are rejected,
not sorted. Callback errors stop replay; earlier deliveries are not rolled back.
The library expects records validated by `parseEvents`; async handlers are not awaited.

`dedupe: true` skips exact repeats of `(topic, eventId)` within selected events.
Conflicting payment IDs or timestamps for that key throw. Dedupe is off by default
and scoped to one replay call; equal payment IDs do not imply duplicate events.

`limit` must be a positive safe integer when provided; invalid values throw before
delivery. It caps matching records after topic/time filters and before dedupe.
Exact duplicates count toward the cap. Replay stops after that selection, so
selected/delivered/duplicate and per-topic counts cover only its records; later
conflicts are not examined. An omitted limit selects every matching record.

Run `npm ci`, then `npm run --silent replay -- --input data/sample-events.jsonl --dedupe`.
Optional `--topic payment.failed`, `--since 2000` and `--until 3000` filter the dry run;
`--limit 2` caps matching records. CLI time bounds and limits accept decimal digits
only. `--help` lists flags.
JSON output reports selected/delivered/duplicate counts and deliveries per topic.
CLI delivery means a local no-op callback ran, not a broker acknowledgement. Errors exit 2.
Use npm's `--silent` option when piping JSON into another tool so npm's command banner is omitted.

```sh
npm run --silent replay -- --since 2000 --until 2000 --dedupe
```

This selects the two sample records at timestamp 2000 and delivers one after dedupe.
Time and topic filters apply before dedupe and conflict checks. The CLI parses and
validates the whole journal before replay, including records outside the selected
time range; it never hides invalid chronological order by filtering it out.

```sh
npm run --silent replay -- --since 2000 --until 3000 --limit 2 --dedupe
```

The two matching sample records are duplicates: selected 2, delivered 1, duplicates 1.
The later created event falls outside the limit. The CLI still validates the whole
input before replay; this limit bounds selection and delivery, not file reading or
parser memory usage.

## Development

`npm run typecheck` and `npm test` check the offline contract on Node 20 in CI.
See [CONTRIBUTING](CONTRIBUTING.md). MIT licensed.
Status: working local spike; durable checkpoints and broker transport are outside scope.
