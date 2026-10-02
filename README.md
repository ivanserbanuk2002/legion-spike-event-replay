# legion-spike-event-replay

A tiny Node 20 + TypeScript tool for ordered dry-run replay of saved JSONL events.
It complements [event-bus](https://github.com/ivanserbanuk2002/legion-spike-event-bus).
No runtime dependencies or network calls; the sample contains synthetic payment events.
Each row has `eventId`, `topic`, `paymentId`, and a nonnegative safe-integer millisecond `timestamp`.
Supported topics are `payment.created` and `payment.failed`. IDs are nonblank strings.
This is a local replay helper; it does not execute payments or publish to a broker.
