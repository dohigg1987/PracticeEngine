import {
  PDFDocument,
  StandardFonts,
  grayscale,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { AccountsHtmlInput } from "./artefacts.ts";

export const ACCOUNTS_PDF_RENDERER_VERSION = "accounts-pdf-v1";

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;

function safeText(value: unknown): string {
  return String(value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7e\u00a0-\u00ff]/g, "?");
}

function wrap(
  value: unknown,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const result: string[] = [];
  for (const paragraph of safeText(value).split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) result.push(line);
      if (font.widthOfTextAtSize(word, size) <= width) {
        line = word;
        continue;
      }
      let fragment = "";
      for (const character of word) {
        if (font.widthOfTextAtSize(fragment + character, size) > width) {
          if (fragment) result.push(fragment);
          fragment = character;
        } else fragment += character;
      }
      line = fragment;
    }
    result.push(line);
  }
  return result;
}

function money(value: string): string {
  const amount = Math.round(Number(value));
  if (!Number.isFinite(amount)) return "-";
  const formatted = Math.abs(amount).toLocaleString("en-GB");
  return amount < 0 ? `(${formatted})` : formatted;
}

function humanCode(value: unknown): string {
  const code = safeText(value).toUpperCase();
  const known: Record<string, string> = {
    FRS_101: "FRS 101",
    FRS_102: "FRS 102",
    FRS_102_1A: "FRS 102 Section 1A",
    FRS_105: "FRS 105",
    CHARITIES_SORP_2026: "Charities SORP 2026",
    "CHARITIES-SORP-2026": "Charities SORP 2026",
    ACADEMIES_2025_26: "Academies Accounts Direction 2025/26",
    LLP_SORP_2026: "LLP SORP 2026",
    NONE: "General",
  };
  return known[code] ?? safeText(value).replaceAll("_", " ");
}

function humanDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return safeText(value);
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function humanTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return safeText(value);
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date)} UTC`;
}

function isTotalLine(code: string, caption: string): boolean {
  return (
    /(^|_)(TOTAL|NET|SURPLUS|DEFICIT|CLOSING|FUNDS)(_|$)/i.test(code) ||
    /^(total|net |surplus|deficit|funds at|cash and cash equivalents)/i.test(
      caption,
    )
  );
}

function disclosureLabel(value: string): string {
  let spaced = value
    .replaceAll("_", " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  if (spaced === spaced.toUpperCase()) spaced = spaced.toLowerCase();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : "Value";
}

function humanLabel(value: unknown): string {
  const label = safeText(value).replaceAll("_", " ").trim().toLowerCase();
  return label ? label[0].toUpperCase() + label.slice(1) : "";
}

function disclosureTitle(value: string): string {
  const match = /^NOTE[_ -]?(\d+)[_ -]?(.*)$/i.exec(value);
  if (match)
    return `${match[1]}. ${disclosureLabel(match[2] || "Note")}`;
  return disclosureLabel(value);
}

function disclosureRows(
  value: unknown,
  prefix = "",
): Array<{ label: string; value: string }> {
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || typeof item !== "object")) {
      return [{ label: prefix || "Value", value: value.map(String).join(", ") }];
    }
    return value.flatMap((item, index) =>
      disclosureRows(item, `${prefix || "Item"} ${index + 1}`),
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, item]) =>
        disclosureRows(item, prefix ? `${prefix} - ${key}` : key),
      );
  }
  return [
    {
      label: prefix || "Value",
      value:
        value === null || value === undefined || value === ""
          ? "Not supplied"
          : /(?:income|restricted|unrestricted|wages|pension|security|cost|closing|amount)/i.test(
                prefix,
              ) && /^-?\d+(?:\.\d+)?$/.test(String(value))
            ? `£${money(String(value))}`
            : String(value),
    },
  ];
}

function footer(
  page: PDFPage,
  font: PDFFont,
  pageNumber: number,
  contentHash: string,
): void {
  page.drawLine({
    start: { x: MARGIN, y: 34 },
    end: { x: A4[0] - MARGIN, y: 34 },
    thickness: 0.5,
    color: grayscale(0.75),
  });
  page.drawText(`Page ${pageNumber}`, {
    x: MARGIN,
    y: 20,
    size: 7,
    font,
    color: grayscale(0.4),
  });
  const label = `Accounts evidence ID ${contentHash.slice(0, 12)}`;
  page.drawText(label, {
    x: A4[0] - MARGIN - font.widthOfTextAtSize(label, 7),
    y: 20,
    size: 7,
    font,
    color: grayscale(0.4),
  });
}

export async function renderAccountsPdf(
  input: AccountsHtmlInput,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.TimesRoman);
  const bold = await document.embedFont(StandardFonts.TimesRomanBold);
  const metadata = await document.embedFont(StandardFonts.Helvetica);
  const metadataBold = await document.embedFont(StandardFonts.HelveticaBold);
  const generatedAt = new Date(input.accountsVersion.generatedAt);
  document.setTitle(safeText(`${input.organisation.legalName} accounts`));
  document.setAuthor("UK Accounts Production");
  document.setSubject(
    safeText(
      `${input.engagement.framework} accounts version ${input.accountsVersion.version}`,
    ),
  );
  document.setCreator(ACCOUNTS_PDF_RENDERER_VERSION);
  document.setProducer(ACCOUNTS_PDF_RENDERER_VERSION);
  document.setCreationDate(generatedAt);
  document.setModificationDate(generatedAt);
  document.setLanguage("en-GB");

  const pages: PDFPage[] = [];
  const addPage = () => {
    const page = document.addPage(A4);
    pages.push(page);
    return page;
  };
  const contents: Array<{ title: string; page: number }> = [];
  const reviewBlock = (
    target: PDFPage,
    title: string,
    message: string,
    blockY: number,
  ) => {
    target.drawRectangle({
      x: MARGIN,
      y: blockY - 54,
      width: 499,
      height: 64,
      color: grayscale(0.96),
      borderColor: grayscale(0.42),
      borderWidth: 0.75,
    });
    target.drawText(safeText(`REVIEW REQUIRED - ${title}`), {
      x: MARGIN + 12,
      y: blockY - 10,
      size: 8.5,
      font: metadataBold,
      color: grayscale(0.15),
    });
    wrap(message, regular, 9, 475)
      .slice(0, 3)
      .forEach((line, index) =>
        target.drawText(line, {
          x: MARGIN + 12,
          y: blockY - 27 - index * 10,
          size: 9,
          font: regular,
        }),
      );
  };
  const drawNarrative = (
    title: string,
    sections: Array<{ title: string; paragraphs: string[] }>,
    missingMessage: string,
  ) => {
    let target = addPage();
    contents.push({ title, page: pages.length });
    let narrativeY = 770;
    target.drawText(safeText(title), {
      x: MARGIN,
      y: narrativeY,
      size: 19,
      font: bold,
      color: grayscale(0.08),
    });
    narrativeY -= 36;
    if (!sections.length) {
      reviewBlock(target, title, missingMessage, narrativeY);
      return;
    }
    for (const section of sections) {
      if (narrativeY < 120) {
        target = addPage();
        narrativeY = 770;
      }
      target.drawText(safeText(section.title), {
        x: MARGIN,
        y: narrativeY,
        size: 12,
        font: bold,
      });
      narrativeY -= 18;
      for (const paragraph of section.paragraphs) {
        const lines = wrap(paragraph, regular, 10.5, 499);
        if (narrativeY - lines.length * 12 < 55) {
          target = addPage();
          narrativeY = 770;
        }
        for (const line of lines) {
          target.drawText(line, {
            x: MARGIN,
            y: narrativeY,
            size: 10.5,
            font: regular,
          });
          narrativeY -= 12;
        }
        narrativeY -= 8;
      }
    }
  };
  let page = addPage();
  page.drawRectangle({
    x: MARGIN,
    y: A4[1] - 72,
    width: A4[0] - MARGIN * 2,
    height: 2,
    color: grayscale(0.16),
  });
  const draft = !["FINAL", "FILED"].includes(input.accountsVersion.status);
  const baseline = input.pack.certificationStatus !== "REGULATOR_CERTIFIED";
  if (draft) {
    const draftLabel = "DRAFT - NOT FOR ISSUE";
    page.drawText(draftLabel, {
      x: A4[0] - MARGIN - metadataBold.widthOfTextAtSize(draftLabel, 8.5),
      y: 784,
      size: 8.5,
      font: metadataBold,
      color: grayscale(0.2),
    });
  }
  page.drawText("ANNUAL REPORT AND FINANCIAL STATEMENTS", {
    x: MARGIN,
    y: 720,
    size: 9,
    font: metadataBold,
    color: grayscale(0.28),
  });
  let y = 670;
  for (const line of wrap(input.organisation.legalName, bold, 27, 499)) {
    page.drawText(line, { x: MARGIN, y, size: 27, font: bold });
    y -= 34;
  }
  page.drawText(
    `For the year ended ${humanDate(input.engagement.periodEnd)}`,
    { x: MARGIN, y: y - 8, size: 13, font: regular },
  );
  const coverMetadata = [
    ["Legal form", input.organisation.legalForm],
    ["Jurisdiction", input.organisation.jurisdiction],
    ["Reporting framework", humanCode(input.engagement.framework)],
    ["Applicable requirements", humanCode(input.engagement.sectorProfile)],
    [
      "Accounts version",
      `${input.accountsVersion.version} - ${input.accountsVersion.status}`,
    ],
    ["Framework pack", `${humanCode(input.pack.code)} (version ${input.pack.version})`],
  ];
  y -= 72;
  page.drawLine({
    start: { x: MARGIN, y: y + 20 },
    end: { x: A4[0] - MARGIN, y: y + 20 },
    thickness: 0.5,
    color: grayscale(0.65),
  });
  for (const [label, value] of coverMetadata) {
    page.drawText(safeText(label), {
      x: MARGIN,
      y,
      size: 8.5,
      font: metadata,
      color: grayscale(0.4),
    });
    page.drawText(safeText(value), { x: 190, y, size: 10.5, font: regular });
    y -= 23;
  }
  page.drawRectangle({
    x: MARGIN,
    y: 96,
    width: 499,
    height: 64,
    borderWidth: 0.8,
    borderColor: grayscale(0.35),
    color: grayscale(0.97),
  });
  const certification =
    input.pack.certificationStatus === "REGULATOR_CERTIFIED"
      ? "Regulator certified"
      : "Repository baseline - not regulator certified";
  page.drawText(certification, {
    x: MARGIN + 12,
    y: 135,
    size: 9,
    font: metadataBold,
  });
  wrap(`${input.pack.title} - ${humanLabel(input.pack.provenanceLabel)}`, regular, 8, 475)
    .slice(0, 2)
    .forEach((line, index) =>
      page.drawText(line, {
        x: MARGIN + 12,
        y: 116 - index * 11,
        size: 8.5,
        font: regular,
      }),
    );

  const contentsPage = addPage();
  contentsPage.drawText("Contents", {
    x: MARGIN,
    y: 770,
    size: 20,
    font: bold,
    color: grayscale(0.08),
  });

  page = addPage();
  contents.push({ title: "Entity and legal information", page: pages.length });
  page.drawText("Entity and legal information", {
    x: MARGIN,
    y: 770,
    size: 20,
    font: bold,
    color: grayscale(0.08),
  });
  const legalRows: Array<[string, string | undefined]> = [
    ["Legal name", input.organisation.legalName],
    ["Legal form", input.organisation.legalForm],
    ["Jurisdiction", input.organisation.jurisdiction],
    ["Company registration number", input.entityDetails?.registrationNumber],
    ["Charity registration number", input.entityDetails?.charityNumber],
    ["Registered office", input.entityDetails?.registeredOffice],
    ["Governing document", input.entityDetails?.governingDocument],
    [
      "Directors / trustees",
      input.entityDetails?.directorsOrTrustees?.join(", "),
    ],
  ];
  let legalY = 720;
  for (const [label, value] of legalRows) {
    page.drawText(label, {
      x: MARGIN,
      y: legalY,
      size: 8.5,
      font: metadata,
      color: grayscale(0.4),
    });
    const display = value ? safeText(value) : "Not supplied in versioned data";
    const lines = wrap(display, value ? regular : bold, 10, 315);
    lines.forEach((line, index) =>
      page.drawText(line, {
        x: 225,
        y: legalY - index * 11,
        size: 10,
        font: value ? regular : bold,
        color: value ? grayscale(0.1) : grayscale(0.28),
      }),
    );
    legalY -= Math.max(34, lines.length * 11 + 14);
  }
  if (
    !input.entityDetails?.registrationNumber &&
    !input.entityDetails?.charityNumber
  )
    reviewBlock(
      page,
      "registration details",
      "No registration identifier is present in the versioned accounts data. Confirm the applicable statutory identifier before issue.",
      170,
    );

  drawNarrative(
    input.organisation.legalForm.toUpperCase().includes("CHARIT")
      ? "Trustees' report"
      : "Directors' report",
    (input.reports ?? []).map((report) => ({
      title: report.title,
      paragraphs: report.paragraphs,
    })),
    "No approved report narrative is present in this accounts version. Add versioned report content and obtain the required review before issue.",
  );

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
  for (const [, statement] of [...statements.entries()].sort(
    (a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]),
  )) {
    page = addPage();
    contents.push({ title: statement.caption, page: pages.length });
    y = 770;
    const fundNames = [
      ...new Set(
        statement.lines.flatMap((line) =>
          (line.fundBalances ?? []).map((fund) => fund.fund),
        ),
      ),
    ].sort();
    const hasComparative = statement.lines.some(
      (line) => line.comparativeBalance !== undefined,
    );
    const columns = [
      ...fundNames.map((fund) => ({ kind: "fund" as const, label: fund })),
      {
        kind: "current" as const,
        label: fundNames.length
          ? "Total"
          : input.engagement.periodEnd.slice(0, 4),
      },
      ...(hasComparative
        ? [
            {
              kind: "comparative" as const,
              label: String(Number(input.engagement.periodEnd.slice(0, 4)) - 1),
            },
          ]
        : []),
    ];
    const columnWidth =
        columns.length <= 2 ? 96 : Math.min(82, 328 / columns.length),
      captionWidth = 499 - columnWidth * columns.length - 12,
      columnStart = A4[0] - MARGIN - columnWidth * columns.length;
    const heading = () => {
      page.drawText(safeText(statement.caption), {
        x: MARGIN,
        y,
        size: 20,
        font: bold,
        color: grayscale(0.08),
      });
      y -= 38;
      columns.forEach((column, index) => {
        const label = safeText(column.label),
          right = columnStart + columnWidth * (index + 1);
        page.drawText(label, {
          x: right - metadataBold.widthOfTextAtSize(label, 8.5),
          y,
          size: 8.5,
          font: metadataBold,
        });
        page.drawText("£", {
          x: right - metadata.widthOfTextAtSize("£", 8),
          y: y - 12,
          size: 8,
          font: metadata,
        });
      });
      y -= 20;
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: A4[0] - MARGIN, y },
        thickness: 1,
        color: grayscale(0.18),
      });
    };
    heading();
    for (const line of statement.lines) {
      const captions = wrap(line.caption, regular, 10.5, captionWidth);
      const height = Math.max(27, captions.length * 12 + 12);
      if (y - height < 55) {
        page = addPage();
        y = 770;
        heading();
      }
      const total = isTotalLine(line.lineCode, line.caption);
      if (total)
        page.drawLine({
          start: { x: MARGIN, y },
          end: { x: A4[0] - MARGIN, y },
          thickness: 0.8,
          color: grayscale(0.28),
        });
      captions.forEach((caption, index) =>
        page.drawText(caption, {
          x: MARGIN,
          y: y - 14 - index * 11,
          size: 10.5,
          font: total ? bold : regular,
        }),
      );
      columns.forEach((column, index) => {
        const raw =
          column.kind === "fund"
            ? line.fundBalances?.find((fund) => fund.fund === column.label)
                ?.balance
            : column.kind === "comparative"
              ? line.comparativeBalance
              : line.balance;
        const amount = raw === undefined ? "-" : money(raw),
          right = columnStart + columnWidth * (index + 1);
        page.drawText(amount, {
          x: right - (total ? bold : regular).widthOfTextAtSize(amount, 10),
          y: y - 14,
          size: 10,
          font: total ? bold : regular,
        });
      });
      if (total) {
        page.drawLine({
          start: { x: columnStart, y: y - height + 7 },
          end: { x: A4[0] - MARGIN, y: y - height + 7 },
          thickness: 0.7,
          color: grayscale(0.22),
        });
        page.drawLine({
          start: { x: columnStart, y: y - height + 4 },
          end: { x: A4[0] - MARGIN, y: y - height + 4 },
          thickness: 0.35,
          color: grayscale(0.22),
        });
      }
      y -= height;
    }
    if (/balance sheet/i.test(statement.caption) && y > 180)
      reviewBlock(
        page,
        "approval and signature",
        "No versioned approval statement or signatory block is available to this renderer. Confirm the statutory approval date and authorised signatory before issue.",
        y - 32,
      );
  }

  drawNarrative(
    "Accounting policies",
    (input.policies ?? []).map((policy) => ({
      title: policy.title,
      paragraphs: policy.paragraphs,
    })),
    "No approved accounting-policy narrative is present in this accounts version. Confirm the applicable policies and add them as versioned content before issue.",
  );

  page = addPage();
  contents.push({ title: "Notes to the accounts", page: pages.length });
  y = 770;
  page.drawText("Notes to the accounts", {
    x: MARGIN,
    y,
    size: 20,
    font: bold,
    color: grayscale(0.08),
  });
  y -= 32;
  const disclosures = [...input.disclosures].sort((a, b) =>
    a.code.localeCompare(b.code),
  );
  if (!disclosures.length)
    reviewBlock(
      page,
      "notes and disclosures",
      "No disclosure answers are included in this dependency manifest. Confirm whether statutory notes are required before issue.",
      y,
    );
  for (const disclosure of disclosures) {
    if (y < 130) {
      page = addPage();
      y = 770;
    }
    page.drawText(safeText(disclosureTitle(disclosure.code)), {
      x: MARGIN,
      y,
      size: 12,
      font: bold,
    });
    const tag = safeText(disclosure.applicability);
    page.drawText(tag, {
      x: A4[0] - MARGIN - regular.widthOfTextAtSize(tag, 7),
      y,
      size: 7.5,
      font: metadata,
      color: grayscale(0.4),
    });
    y -= 16;
    for (const row of disclosureRows(disclosure.answer)) {
      const label = disclosureLabel(row.label);
      const valueLines = wrap(row.value, regular, 9.5, 365);
      const rowHeight = Math.max(21, valueLines.length * 11 + 7);
      if (y - rowHeight < 55) {
        page = addPage();
        y = 770;
      }
      page.drawLine({
        start: { x: MARGIN, y: y + 4 },
        end: { x: A4[0] - MARGIN, y: y + 4 },
        thickness: 0.3,
        color: grayscale(0.86),
      });
      page.drawText(safeText(label), {
        x: MARGIN,
        y: y - 8,
        size: 8.5,
        font: metadataBold,
        color: grayscale(0.35),
      });
      valueLines.forEach((answerLine, index) =>
        page.drawText(answerLine, {
          x: MARGIN + 134,
          y: y - 8 - index * 10,
          size: 9.5,
          font: regular,
        }),
      );
      y -= rowHeight;
    }
    y -= 18;
  }

  page = addPage();
  contents.push({ title: "Document provenance", page: pages.length });
  page.drawText("Document provenance", {
    x: MARGIN,
    y: 770,
    size: 20,
    font: bold,
    color: grayscale(0.08),
  });
  const provenanceRows = [
    ["Renderer", "Accounts PDF renderer v1"],
    ["Evidence ID", input.accountsVersion.contentHash.slice(0, 16)],
    ["Framework pack", `${humanCode(input.pack.code)} (version ${input.pack.version})`],
    [
      "Release status",
      input.pack.certificationStatus === "REGULATOR_CERTIFIED"
        ? "Regulator certified"
        : "Repository baseline - not regulator certified",
    ],
    [
      "Applicable period",
      `${humanDate(input.engagement.periodStart)} to ${humanDate(input.engagement.periodEnd)}`,
    ],
    ["Generated from", `Immutable accounts version ${input.accountsVersion.version}`],
    ["Generated at", humanTimestamp(input.accountsVersion.generatedAt)],
  ];
  provenanceRows.forEach(([label, value], index) => {
    const rowY = 720 - index * 28;
    page.drawText(label!, {
      x: MARGIN,
      y: rowY,
      size: 8.5,
      font: metadata,
      color: grayscale(0.42),
    });
    page.drawText(safeText(value), {
      x: 175,
      y: rowY,
      size: 10,
      font: regular,
    });
  });
  let contentsY = 720;
  for (const entry of contents) {
    if (contentsY < 70) break;
    contentsPage.drawText(safeText(entry.title), {
      x: MARGIN,
      y: contentsY,
      size: 9,
      font: regular,
    });
    const pageLabel = String(entry.page);
    contentsPage.drawText(pageLabel, {
      x: A4[0] - MARGIN - regular.widthOfTextAtSize(pageLabel, 9),
      y: contentsY,
      size: 9,
      font: regular,
    });
    contentsPage.drawLine({
      start: { x: 220, y: contentsY + 2 },
      end: { x: A4[0] - MARGIN - 22, y: contentsY + 2 },
      thickness: 0.3,
      dashArray: [1, 2],
      color: grayscale(0.72),
    });
    contentsY -= 23;
  }
  pages.forEach((item, index) => {
    if (index > 0) {
      item.drawText(safeText(input.organisation.legalName), {
        x: MARGIN,
        y: 814,
        size: 7.5,
        font: metadataBold,
        color: grayscale(0.32),
      });
      const period = `Year ended ${humanDate(input.engagement.periodEnd)}`;
      item.drawText(period, {
        x: A4[0] - MARGIN - metadata.widthOfTextAtSize(period, 7.5),
        y: 814,
        size: 7.5,
        font: metadata,
        color: grayscale(0.32),
      });
      item.drawLine({
        start: { x: MARGIN, y: 804 },
        end: { x: A4[0] - MARGIN, y: 804 },
        thickness: 0.5,
        color: grayscale(0.72),
      });
      if (draft || baseline)
        item.drawText(
          [
            draft ? "DRAFT - NOT FOR ISSUE" : "",
            baseline ? "REPOSITORY BASELINE - NOT CERTIFIED" : "",
          ]
            .filter(Boolean)
            .join("  |  "),
          {
            x: MARGIN,
            y: 792,
            size: 7,
            font: metadataBold,
            color: grayscale(0.28),
          },
        );
    }
    footer(item, metadata, index + 1, input.accountsVersion.contentHash);
  });
  return document.save({ useObjectStreams: false, addDefaultPage: false });
}
