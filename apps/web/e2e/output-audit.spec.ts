import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

test("showcase PDF is the current multi-page grayscale accounts output", async ({
  request,
}) => {
  const response = await request.get("/northstar-charity-accounts.pdf");
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"]).toContain("application/pdf");
  const bytes = await response.body();
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(10_000);
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(8);

  const source = bytes.toString("latin1");
  expect(source).not.toMatch(/\/DeviceRGB|\brg\b|\bRG\b/);
});

test("showcase Word output is a real Office Open XML package", async ({
  request,
}) => {
  const response = await request.get("/northstar-charity-accounts.docx");
  expect(response.ok()).toBeTruthy();
  const bytes = await response.body();
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  expect(bytes.length).toBeGreaterThan(8_000);
});
