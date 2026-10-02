export type Topic = "payment.created" | "payment.failed";
export interface EventRecord {
  eventId: string;
  topic: Topic;
  paymentId: string;
  timestamp: number;
}

export function parseEvents(text: string): EventRecord[] {
  const events: EventRecord[] = [];
  let previous = -1;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("expected an object");
      const { eventId, topic, paymentId, timestamp } = parsed as Record<string, unknown>;
      if (typeof eventId !== "string" || !eventId.trim() ||
          typeof paymentId !== "string" || !paymentId.trim()) throw new Error("IDs must be nonblank strings");
      if (topic !== "payment.created" && topic !== "payment.failed") throw new Error("unknown topic");
      if (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp) || timestamp < 0)
        throw new Error("timestamp must be a nonnegative safe integer");
      if (timestamp < previous) throw new Error("timestamps must be in file order");
      previous = timestamp;
      events.push({ eventId, topic, paymentId, timestamp });
    } catch (error) {
      throw new Error(`line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return events;
}
