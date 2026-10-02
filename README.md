# legion-spike-event-replay

A tiny Node 20 + TypeScript tool for ordered dry-run replay of saved JSONL events.
It complements [event-bus](https://github.com/ivanserbanuk2002/legion-spike-event-bus).
No runtime dependencies or network calls; the sample contains synthetic payment events.
Each row has `eventId`, `topic`, `paymentId`, and a nonnegative safe-integer millisecond `timestamp`.
Supported topics are `payment.created` and `payment.failed`. IDs are nonblank strings.
This is a local replay helper; it does not execute payments or publish to a broker.

`replayEvents(events, listener, { topic?, since? })` calls a synchronous listener
in file order. `since` is inclusive. Journals with decreasing timestamps are rejected,
not sorted. Callback errors stop replay; earlier deliveries are not rolled back.
The library expects records validated by `parseEvents`; async handlers are not awaited.

`dedupe: true` skips exact repeats of `(topic, eventId)` within selected events.
Conflicting payment IDs or timestamps for that key throw. Dedupe is off by default
and scoped to one replay call; equal payment IDs do not imply duplicate events.

Run `npm ci`, then `npm run replay -- --input data/sample-events.jsonl --dedupe`.
Optional `--topic payment.failed` and `--since 2000` filter the dry run. `--help` lists flags.
JSON output reports selected/delivered/duplicate counts and deliveries per topic.
CLI delivery means a local no-op callback ran, not a broker acknowledgement. Errors exit 2.

## Development

`npm run typecheck` and `npm test` check the offline contract on Node 20 in CI.
See [CONTRIBUTING](CONTRIBUTING.md). MIT licensed.
Status: working local spike; durable checkpoints and broker transport are outside scope.
