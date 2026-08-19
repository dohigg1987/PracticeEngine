import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { AccountsHtmlInput } from "./artefacts.ts";

export const ACCOUNTS_DOCX_RENDERER_VERSION = "accounts-docx-v1";

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const disclosureText = (answer: Record<string, unknown>) => {
  for (const key of ["narrative", "policy", "answer", "value"])
    if (typeof answer[key] === "string") return String(answer[key]);
  return JSON.stringify(answer);
};
const figure = (value: string) => {
  const amount = Math.round(Number(value));
  if (!Number.isFinite(amount)) return "–";
  const text = Math.abs(amount).toLocaleString("en-GB");
  return amount < 0 ? `(${text})` : text;
};

export async function renderAccountsDocx(input: AccountsHtmlInput): Promise<Uint8Array> {
  const watermark = input.accountsVersion.status === "FINAL" || input.accountsVersion.status === "FILED"
    ? "FINAL COPY"
    : input.accountsVersion.status === "REVIEWED" || input.accountsVersion.status === "APPROVED"
      ? "REVIEW COPY"
      : "DRAFT";
  const header = new Header({ children: [new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text: watermark, bold: true, color: "666666", size: 22 })],
  })] });
  const footer = new Footer({ children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: `${input.organisation.legalName} · `, size: 16, color: "666666" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "666666" })],
  })] });
  const children: Array<Paragraph | Table> = [
    new Paragraph({ spacing: { before: 2600 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: input.organisation.legalName, bold: true, size: 34 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 420 }, children: [new TextRun({ text: "Annual report and financial statements", size: 30 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 180 }, children: [new TextRun({ text: `For the year ended ${input.engagement.periodEnd}`, size: 22 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 720 }, children: [new TextRun({ text: watermark, bold: true, color: "666666", size: 26 })] }),
  ];
  if (input.entityDetails) {
    children.push(new Paragraph({ children: [new PageBreak()] }), new Paragraph({ text: "Reference and administrative details", heading: HeadingLevel.HEADING_1 }));
    const details = [
      ["Legal name", input.organisation.legalName],
      ["Legal form", input.organisation.legalForm],
      ["Jurisdiction", input.organisation.jurisdiction],
      ["Registration number", input.entityDetails.registrationNumber || "[registration number]"],
      ["Charity number", input.entityDetails.charityNumber || "[charity number]"],
      ["Registered office", input.entityDetails.registeredOffice || "[registered office]"],
      ["Trustees or directors", input.entityDetails.directorsOrTrustees?.join("; ") || "[trustee or director names]"],
    ];
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: details.map(([name, value]) => new TableRow({ children: [new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: name!, bold: true })] })] }), new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, children: [new Paragraph(value!)] })] })) }));
  }
  for (const report of input.reports || []) {
    children.push(new Paragraph({ children: [new PageBreak()] }), new Paragraph({ text: report.title, heading: HeadingLevel.HEADING_1 }));
    for (const paragraph of report.paragraphs) children.push(new Paragraph({ text: paragraph, spacing: { after: 160 } }));
  }
  const statements = new Map<string, AccountsHtmlInput["lines"]>();
  for (const line of input.lines) statements.set(line.statementCaption, [...(statements.get(line.statementCaption) || []), line]);
  for (const [caption, lines] of statements) {
    children.push(new Paragraph({ children: [new PageBreak()] }), new Paragraph({ text: caption, heading: HeadingLevel.HEADING_1 }));
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ tableHeader: true, children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Description", bold: true })] })] }), new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "£", bold: true })] })] })] }), ...lines.map((line) => new TableRow({ children: [new TableCell({ children: [new Paragraph(line.caption)] }), new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, text: figure(line.balance) })] })] }))],
      borders: { top: { style: BorderStyle.SINGLE, size: 1, color: "333333" }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "333333" }, left: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL }, insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "D9D9D9" }, insideVertical: { style: BorderStyle.NIL } },
    }));
  }
  children.push(new Paragraph({ children: [new PageBreak()] }), new Paragraph({ text: "Notes to the financial statements", heading: HeadingLevel.HEADING_1 }));
  for (const disclosure of input.disclosures.filter((item) => !["NOT_APPLICABLE", "PROHIBITED"].includes(item.applicability))) {
    children.push(new Paragraph({ text: label(disclosure.code), heading: HeadingLevel.HEADING_2 }), new Paragraph(disclosureText(disclosure.answer)));
  }
  const doc = new Document({
    creator: "Ledgerly",
    title: `${input.organisation.legalName} accounts`,
    description: `${watermark} generated from immutable accounts version ${input.accountsVersion.version}`,
    sections: [{ headers: { default: header }, footers: { default: footer }, properties: { page: { margin: { top: 1000, right: 1100, bottom: 1000, left: 1100 } } }, children }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
