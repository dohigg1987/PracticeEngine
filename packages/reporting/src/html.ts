import { moneyToDecimal } from "../../domain/src/money.js";
import type { BuiltStatement } from "./framework.js";

export interface AccountsDocumentInput {
  entityName: string;
  registrationNumber?: string;
  periodEnd: string;
  frameworkLabel: string;
  version: number;
  statements: BuiltStatement[];
  approvalText?: string;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function amount(value: bigint): string {
  const decimal = moneyToDecimal(value < 0n ? -value : value);
  return value < 0n ? `(${decimal})` : decimal;
}

export function renderAccountsHtml(input: AccountsDocumentInput): string {
  if (!input.entityName.trim() || !input.statements.length || input.version < 1) throw new Error("ACCOUNTS_DOCUMENT_INPUT_INVALID");
  const statements = input.statements.map((statement) => `<section class="statement" data-statement="${escapeHtml(statement.code)}"><h2>${escapeHtml(statement.caption)}</h2><table><thead><tr><th scope="col">Description</th><th scope="col">Current period</th></tr></thead><tbody>${statement.lines.map((line) => `<tr data-report-line="${escapeHtml(line.code)}"><th scope="row">${escapeHtml(line.caption)}</th><td>${escapeHtml(amount(line.balance))}</td></tr>`).join("")}</tbody></table></section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(input.entityName)} accounts</title><style>@page{size:A4;margin:18mm}*{box-sizing:border-box}body{font:10.5pt/1.45 Arial,sans-serif;color:#17202a;margin:0}header{min-height:210mm;display:grid;place-content:center;text-align:center;page-break-after:always}h1{font-size:24pt;margin:0 0 12mm}h2{font-size:16pt;border-bottom:2px solid #17202a;padding-bottom:3mm}.meta{color:#52606d}.statement{page-break-before:always}table{width:100%;border-collapse:collapse}th,td{padding:3mm 2mm;border-bottom:1px solid #d9e2ec}th{text-align:left}td{text-align:right;font-variant-numeric:tabular-nums}footer{margin-top:16mm;border-top:1px solid #9fb3c8;padding-top:4mm;color:#52606d}@media screen{body{max-width:850px;margin:32px auto;padding:32px;box-shadow:0 8px 40px #0002}header{min-height:70vh}}</style></head><body><header><div><p class="meta">${escapeHtml(input.frameworkLabel)}</p><h1>${escapeHtml(input.entityName)}</h1>${input.registrationNumber ? `<p>Registered number ${escapeHtml(input.registrationNumber)}</p>` : ""}<p>Annual report and financial statements<br>for the period ended ${escapeHtml(input.periodEnd)}</p><p class="meta">Accounts version ${input.version}</p></div></header><main>${statements}</main><footer>${escapeHtml(input.approvalText ?? "Draft accounts generated from the controlled engagement record.")}</footer></body></html>`;
}
