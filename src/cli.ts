import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parseEvents } from "./parser.js";
import { replayEvents } from "./replay.js";

try {
  const { values } = parseArgs({ options: {
    input: { type: "string", default: "data/sample-events.jsonl" },
    topic: { type: "string" }, since: { type: "string" }, until: { type: "string" },
    dedupe: { type: "boolean", default: false }, help: { type: "boolean", short: "h" },
  } });
  if (values.help) {
    console.log("Usage: npm run replay -- --input file.jsonl [--topic payment.created|payment.failed] [--since milliseconds] [--until milliseconds] [--dedupe]");
  } else {
    if (values.topic !== undefined && values.topic !== "payment.created" && values.topic !== "payment.failed")
      throw new Error("unknown topic");
    for (const bound of ["since", "until"] as const)
      if (values[bound] !== undefined && !/^\d+$/.test(values[bound])) throw new Error(`invalid --${bound}`);
    const since = values.since === undefined ? undefined : Number(values.since);
    const until = values.until === undefined ? undefined : Number(values.until);
    const events = parseEvents(readFileSync(values.input, "utf8"));
    const stats = replayEvents(events, () => {}, { topic: values.topic, since, until, dedupe: values.dedupe });
    console.log(JSON.stringify(stats));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
