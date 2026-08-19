import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { auditSource, summarizeBaseline, unexpectedFindings } from "./ui-quality-guard.mjs";

async function fixture(files) {
  const root = await mkdtemp(path.join(tmpdir(), "ui-quality-guard-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, "src", name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return root;
}

test("detects every prohibited UI source pattern", async (t) => {
  const root = await fixture({
    "bad.tsx": `export const Bad = () => <><button onClick={() => window.confirm("Sure?")}>Go</button><dt>Content hash</dt><code>{item.content_hash}</code></>`,
    "bad.css": `.thing.fui-Button { font-size: 11px; border-radius: 12px; }`,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const rules = new Set((await auditSource(root)).map(({ rule }) => rule));
  assert.deepEqual(rules, new Set(["browser-dialog", "off-ramp-radius", "private-fluent-selector", "small-font", "visible-hash"]));
});

test("detects confirm and prompt browser-dialog variants", async (t) => {
  const root = await fixture({
    "dialogs.tsx": `window.prompt("Reason"); globalThis.confirm("Continue?"); window["prompt"]("Reason"); prompt("Reason");`,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const findings = (await auditSource(root)).filter(
    ({ rule }) => rule === "browser-dialog",
  );
  assert.equal(findings.length, 4);
});

test("accepts public selectors, the type floor, and the Fluent radius ramp", async (t) => {
  const root = await fixture({
    "good.tsx": `export const Good = () => <button>Continue</button>`,
    "good.css": `.a { font-size: 12px; border-radius: 2px; } .b { border-radius: 4px; } .c { border-radius: 6px; } .d { border-radius: 8px; } .round { border-radius: 50%; } .token { border-radius: var(--borderRadiusMedium); } .circular { border-radius: 10000px; }`,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await auditSource(root), []);
});

test("baseline is a debt ceiling and a new occurrence fails", async (t) => {
  const root = await fixture({ "legacy.css": `.old { border-radius: 10px; }` });
  t.after(() => rm(root, { recursive: true, force: true }));
  const existing = await auditSource(root);
  const baseline = summarizeBaseline(existing);
  assert.deepEqual(unexpectedFindings(existing, baseline), []);
  await writeFile(path.join(root, "src", "legacy.css"), `.old { border-radius: 10px; } .new { border-radius: 10px; }`);
  assert.equal(unexpectedFindings(await auditSource(root), baseline).length, 1);
});

test("tests and demo fixtures do not create product UI findings", async (t) => {
  const root = await fixture({
    "component.test.tsx": `window.confirm("test"); window.prompt("test"); export const label = "Content hash";`,
    "demo.ts": `window.confirm("demo"); window.prompt("demo");`,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await auditSource(root), []);
});
