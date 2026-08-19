import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const eventSources = ["src/index.ts", "src/commercial.ts", "src/permanent-file.ts"];

test("audit and outbox metadata use the postgres JSON helper", async () => {
  for (const path of eventSources) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /JSON\.stringify\(metadata\)\}\s*::jsonb/);
    assert.match(source, /tx\.json\(metadata\)/);
  }
});
