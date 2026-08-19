import { canonicalJson } from "./workflow.ts";

export const ACCOUNTS_HTML_RENDERER_VERSION = "accounts-html-v1";

export interface AccountsHtmlInput {
  organisation: {
    legalName: string;
    legalForm: string;
    jurisdiction: string;
  };
  engagement: {
    periodStart: string;
    periodEnd: string;
    framework: string;
    sectorProfile: string;
  };
  accountsVersion: {
    version: number;
    status: string;
    contentHash: string;
    generatedAt: string;
  };
  pack: {
    code: string;
    version: number;
    title: string;
    certificationStatus: string;
    provenanceLabel: string;
  };
  entityDetails?: {
    registrationNumber?: string;
    charityNumber?: string;
    registeredOffice?: string;
    governingDocument?: string;
    directorsOrTrustees?: string[];
  };
  reports?: Array<{
    code: string;
    title: string;
    paragraphs: string[];
  }>;
  policies?: Array<{
    code: string;
    title: string;
    paragraphs: string[];
  }>;
  lines: Array<{
    statementCode: string;
    statementCaption: string;
    statementOrder: number;
    lineCode: string;
    caption: string;
    displayOrder: number;
    balance: string;
    comparativeBalance?: string;
    fundBalances?: Array<{ fund: string; balance: string }>;
  }>;
  disclosures: Array<{
    code: string;
    applicability: string;
    answer: Record<string, unknown>;
  }>;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pounds(value: string): string {
  const negative = value.startsWith("-");
  const [wholeRaw, fractionRaw = ""] = (
    negative ? value.slice(1) : value
  ).split(".");
  const whole = (wholeRaw || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "(" : ""}£${whole}.${(fractionRaw + "00").slice(0, 2)}${negative ? ")" : ""}`;
}

function answerText(answer: Record<string, unknown>): string {
  return escapeHtml(canonicalJson(answer));
}

export function renderAccountsHtml(input: AccountsHtmlInput): string {
  const statements = new Map<
    string,
    { caption: string; order: number; lines: AccountsHtmlInput["lines"] }
  >();
  for (const line of [...input.lines].sort(
    (a, b) =>
      a.statementOrder - b.statementOrder ||
      a.displayOrder - b.displayOrder ||
      a.lineCode.localeCompare(b.lineCode),
  )) {
    const statement = statements.get(line.statementCode) ?? {
      caption: line.statementCaption,
      order: line.statementOrder,
      lines: [],
    };
    statement.lines.push(line);
    statements.set(line.statementCode, statement);
  }
  const statementHtml = [...statements.entries()]
    .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))
    .map(
      ([code, statement]) =>
        `<section class="statement"><h2>${escapeHtml(statement.caption)}</h2><table><thead><tr><th scope="col">Description</th><th scope="col">Year ended ${escapeHtml(input.engagement.periodEnd)}</th></tr></thead><tbody>${statement.lines.map((line) => `<tr><th scope="row"><span>${escapeHtml(line.caption)}</span><small>${escapeHtml(line.lineCode)}</small></th><td>${escapeHtml(pounds(line.balance))}</td></tr>`).join("")}</tbody></table><footer>${escapeHtml(code)}</footer></section>`,
    )
    .join("");
  const disclosureHtml = [...input.disclosures]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(
      (item) =>
        `<article class="disclosure"><h3>${escapeHtml(item.code.replaceAll("_", " "))}</h3><p class="tag">${escapeHtml(item.applicability)}</p><pre>${answerText(item.answer)}</pre></article>`,
    )
    .join("");
  const certification =
    input.pack.certificationStatus === "REGULATOR_CERTIFIED"
      ? "Regulator certified"
      : "Repository baseline — not regulator certified";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.organisation.legalName)} accounts</title><style>@page{size:A4;margin:18mm}*{box-sizing:border-box}body{margin:0;color:#17201c;font:10.5pt/1.45 Georgia,"Times New Roman",serif}header.cover{min-height:245mm;display:flex;flex-direction:column;justify-content:center;border-top:8px solid #244f3d}h1{font-size:28pt;margin:.2em 0}h2{font-size:18pt;border-bottom:2px solid #244f3d;padding-bottom:6px}h3{font-size:12pt}p{margin:.4em 0}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 28px;margin-top:30px}.meta div{border-top:1px solid #cad3ce;padding-top:5px}.meta b,.meta span{display:block}.meta span,small{color:#52615a;font:8.5pt Arial,sans-serif}.warning{margin-top:28px;padding:10px;border:1px solid #b58a2a;background:#fff9e8}.statement,.notes{break-before:page}.statement table{width:100%;border-collapse:collapse}.statement th,.statement td{padding:8px;border-bottom:1px solid #d9dfdc}.statement th{text-align:left;font-weight:normal}.statement td{text-align:right;font-variant-numeric:tabular-nums}.statement th span,.statement th small{display:block}.statement footer{text-align:right;color:#68766f;margin-top:8px}.disclosure{break-inside:avoid;border-top:1px solid #cad3ce;padding:8px 0}.tag{font:8pt Arial,sans-serif;color:#52615a}.disclosure pre{white-space:pre-wrap;overflow-wrap:anywhere;font:9pt/1.4 Arial,sans-serif;background:#f5f7f6;padding:10px}.document-footer{break-before:page;font:8pt Arial,sans-serif;color:#52615a;overflow-wrap:anywhere}</style></head><body><header class="cover"><p>Annual accounts</p><h1>${escapeHtml(input.organisation.legalName)}</h1><p>For the period ${escapeHtml(input.engagement.periodStart)} to ${escapeHtml(input.engagement.periodEnd)}</p><div class="meta"><div><span>Legal form</span><b>${escapeHtml(input.organisation.legalForm)}</b></div><div><span>Jurisdiction</span><b>${escapeHtml(input.organisation.jurisdiction)}</b></div><div><span>Reporting framework</span><b>${escapeHtml(input.engagement.framework)}</b></div><div><span>Sector profile</span><b>${escapeHtml(input.engagement.sectorProfile)}</b></div><div><span>Accounts version</span><b>${escapeHtml(input.accountsVersion.version)} · ${escapeHtml(input.accountsVersion.status)}</b></div><div><span>Framework pack</span><b>${escapeHtml(input.pack.code)} v${escapeHtml(input.pack.version)}</b></div></div><p class="warning"><b>${escapeHtml(certification)}</b><br>${escapeHtml(input.pack.title)} · ${escapeHtml(input.pack.provenanceLabel)}</p></header>${statementHtml}<section class="notes"><h2>Disclosures</h2>${disclosureHtml || "<p>No disclosure answers are included in this dependency manifest.</p>"}</section><footer class="document-footer"><p>Renderer ${ACCOUNTS_HTML_RENDERER_VERSION}</p><p>Accounts dependency hash: ${escapeHtml(input.accountsVersion.contentHash)}</p><p>Generated from immutable accounts version at ${escapeHtml(input.accountsVersion.generatedAt)}</p></footer></body></html>`;
}
