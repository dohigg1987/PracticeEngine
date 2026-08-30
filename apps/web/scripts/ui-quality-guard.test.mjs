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
    "bad.css": `.thing.fui-Button { color: #123456; font-size: 11px; border-radius: 12px; }`,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const rules = new Set((await auditSource(root)).map(({ rule }) => rule));
  assert.deepEqual(rules, new Set(["browser-dialog", "literal-color", "native-interactive", "off-ramp-font-size", "off-ramp-radius", "private-fluent-selector", "small-font", "visible-hash"]));
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

test("accepts public selectors, the Fluent type ramp, and the Fluent radius ramp", async (t) => {
  const root = await fixture({
    "good.tsx": `import { Button } from "@fluentui/react-components"; export const Good = () => <Button>Continue</Button>`,
    "good.css": `.a { font-size: var(--fontSizeBase200); border-radius: 2px; } .b { border-radius: 4px; } .c { border-radius: 6px; } .d { border-radius: 8px; } .round { border-radius: 50%; } .token { border-radius: var(--borderRadiusMedium); } .circular { border-radius: 10000px; } .hero { font-size: var(--fontSizeHero700); } .parent { font-size: inherit; }`,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await auditSource(root), []);
});

test("requires the Fluent type ramp outside statutory document output", async (t) => {
  const root = await fixture({
    "app.css": `.bad { font-size: 13px; } .good { font-size: var(--fontSizeBase300); } .statutory-page { font-size: 12px; } .statutory-page h2 { font-size: 23px; }`,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const findings = (await auditSource(root)).filter(({ rule }) => rule === "off-ramp-font-size");
  assert.deepEqual(findings.map(({ key }) => key), ["13px"]);
});

test("small-font resolves Fluent type-ramp tokens instead of only literal px and rem", async (t) => {
  const root = await fixture({
    "app.css": `.tiny { font-size: var(--fontSizeBase100); } .body { font-size: var(--fontSizeBase200); } .literal { font-size: 10px; }`,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const findings = (await auditSource(root)).filter(({ rule }) => rule === "small-font");
  assert.deepEqual(findings.map(({ key }) => key).sort(), ["10px", "var(--fontSizeBase100)"]);
});

test("detects native interactive elements but permits hidden file plumbing", async (t) => {
  const root = await fixture({
    "controls.tsx": `export const Bad = () => <><a href="/">Home</a><button>Save</button><details><summary>More</summary></details><input /><select /><textarea /></>`,
    "file.tsx": `export const File = () => <input hidden type="file" />`,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const findings = (await auditSource(root)).filter(({ rule }) => rule === "native-interactive");
  assert.deepEqual(findings.map(({ key }) => key), ["a", "button", "details", "input", "select", "summary", "textarea"]);
});

test("requires semantic color tokens outside controlled statutory and forced-color output", async (t) => {
  const root = await fixture({
    "app.css": `.bad { color: #fff; background: rgba(0, 0, 0, .2); } .good { color: var(--colorNeutralForeground1); } .statutory-page { color: #242424; }`,
    "forced-colors.css": `@media (forced-colors: active) { .selected { color: HighlightText; } }`,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const findings = (await auditSource(root)).filter(({ rule }) => rule === "literal-color");
  assert.deepEqual(findings.map(({ key }) => key), ["#fff", "rgba(0, 0, 0, .2)"]);
});

test("detects generated and attribute-based Fluent implementation selectors", async (t) => {
  const root = await fixture({
    "internals.css": `.fui-Button {} .___abc123 {} [class^="fui-"] {}`,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const findings = (await auditSource(root)).filter(({ rule }) => rule === "private-fluent-selector");
  assert.equal(findings.length, 3);
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
