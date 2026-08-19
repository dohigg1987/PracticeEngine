import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const forcedColorsCss = readFileSync(
  new URL("../src/forced-colors.css", import.meta.url),
  "utf8",
);

test("forced-colors stylesheet is scoped to the operating-system preference", () => {
  assert.match(forcedColorsCss, /@media \(forced-colors: active\)/);
  assert.doesNotMatch(forcedColorsCss, /prefers-color-scheme/);
});

test("forced-colors stylesheet uses system colors for focus, selection and state boundaries", () => {
  for (const systemColor of [
    "Canvas",
    "CanvasText",
    "ButtonBorder",
    "GrayText",
    "Highlight",
    "HighlightText",
    "Mark",
  ]) {
    assert.match(forcedColorsCss, new RegExp(`\\b${systemColor}\\b`));
  }
  assert.match(forcedColorsCss, /:focus-visible/);
  assert.match(forcedColorsCss, /\[aria-selected="true"\]/);
  assert.match(forcedColorsCss, /\[role="alert"\]/);
  assert.match(forcedColorsCss, /\[role="status"\]/);
});

test("forced-colors stylesheet retains a bordered, system-colored statutory preview", () => {
  assert.match(
    forcedColorsCss,
    /\.statutory-page\s*\{[^}]*border:\s*2px solid CanvasText/s,
  );
  assert.match(
    forcedColorsCss,
    /\.page-canvas,\s*\.statutory-page\s*\{[^}]*background:\s*Canvas/s,
  );
});
