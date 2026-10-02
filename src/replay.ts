import type { EventRecord, Topic } from "./parser.js";

export interface ReplayOptions { topic?: Topic; since?: number; until?: number; dedupe?: boolean; }
export interface ReplayStats {
  selected: number;
  delivered: number;
  duplicates: number;
  byTopic: Record<Topic, number>;
}

export function replayEvents(events: readonly EventRecord[], listener: (event: EventRecord) => void,
  options: ReplayOptions = {}): ReplayStats {
  for (const bound of ["since", "until"] as const) {
    const value = options[bound];
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
      throw new Error(`${bound} must be a nonnegative safe integer`);
  }
  if (options.since !== undefined && options.until !== undefined && options.since > options.until)
    throw new Error("since must not exceed until");
  const result: ReplayStats = { selected: 0, delivered: 0, duplicates: 0,
    byTopic: { "payment.created": 0, "payment.failed": 0 } };
  const seen = new Map<string, string>();
  for (const event of events) {
    if (options.topic && event.topic !== options.topic) continue;
    if (options.since !== undefined && event.timestamp < options.since) continue;
    if (options.until !== undefined && event.timestamp > options.until) continue;
    result.selected++;
    if (options.dedupe) {
      const key = JSON.stringify([event.topic, event.eventId]);
      const payload = JSON.stringify([event.paymentId, event.timestamp]);
      if (seen.has(key)) {
        if (seen.get(key) !== payload) throw new Error(`conflicting event: ${event.eventId}`);
        result.duplicates++;
        continue;
      }
      seen.set(key, payload);
    }
    listener(event);
    result.delivered++;
    result.byTopic[event.topic]++;
  }
  return result;
}
