import test from "node:test";
import assert from "node:assert/strict";
import { renderAccountsHtml } from "../../reporting/src/html.js";

test("accounts HTML renders print-ready statements and escapes client content", () => {
  const html = renderAccountsHtml({ entityName: "A & B <Charity>", registrationNumber: "01234567", periodEnd: "31 December 2026", frameworkLabel: "FRS 102 and Charities SORP 2026", version: 3, statements: [{ code: "SOFA", caption: "Statement of financial activities", lines: [{ code: "SOFA.INCOME", caption: "Income", balance: -15000000n, canonicalCodes: ["REV.TRADING"], sourceAccountIds: ["4000"] }] }] });
  assert.match(html, /<!doctype html>/);
  assert.match(html, /A &amp; B &lt;Charity&gt;/);
  assert.match(html, /\(150000\.00\)/);
  assert.match(html, /data-report-line="SOFA.INCOME"/);
  assert.doesNotMatch(html, /A & B <Charity>/);
});
