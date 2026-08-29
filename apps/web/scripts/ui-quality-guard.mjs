import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const allowedRadius = new Set(["0", "2px", "4px", "6px", "8px", "50%", "10000px"]);
const sourceExtensions = new Set([".css", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const nativeInteractiveElements = new Set(["a", "button", "details", "input", "select", "summary", "textarea"]);
const literalColorPattern = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\([^)]*\)/gi;
const statutorySelectorPattern = /\.(?:statutory-page|accounts-cover-page|reference-details-page|assurance-report-page|directors-report-page|accounting-policies-page|notes-page|detailed-income-page|fixed-asset-page|balance-sheet-page)\b/;

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(full)));
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function add(findings, rule, file, source, index, key, message) {
  findings.push({ rule, file, line: lineNumber(source, index), key, message });
}

function auditFile(relativeFile, source) {
  const findings = [];
  const extension = path.extname(relativeFile);
  const productionScript = !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relativeFile) && relativeFile !== "src/demo.ts";

  if (productionScript && /\.[cm]?[jt]sx?$/.test(relativeFile)) {
    const browserDialogPatterns = [
      { pattern: /\b(?:window|globalThis)\s*\.\s*(?:confirm|prompt)\s*\(/g },
      { pattern: /\b(?:window|globalThis)\s*\[\s*["'](?:confirm|prompt)["']\s*\]\s*\(/g },
      { pattern: /(?<![\w$.])(?:confirm|prompt)\s*\(/g, bare: true },
    ];
    for (const { pattern, bare = false } of browserDialogPatterns) {
      for (const match of source.matchAll(pattern)) {
        if (bare && /\bfunction\s*$/.test(source.slice(Math.max(0, match.index - 24), match.index))) continue;
        add(findings, "browser-dialog", relativeFile, source, match.index, match[0].replace(/\s+/g, ""), "Use a shared Fluent dialog instead of a browser confirm or prompt call");
      }
    }

    if (extension === ".tsx") {
      for (const match of source.matchAll(/<([a-z][\w-]*)\b[^>]*>/g)) {
        const tag = match[1];
        if (!nativeInteractiveElements.has(tag)) continue;
        const openingElement = match[0];
        const hiddenFileInput = tag === "input" && (
          /\bhidden(?:\s|=|\/?>)/.test(openingElement) ||
          /\btype\s*=\s*["']file["']/.test(openingElement)
        );
        if (hiddenFileInput) continue;
        add(findings, "native-interactive", relativeFile, source, match.index, tag, `Use the Fluent ${tag} primitive instead of a native <${tag}> control`);
      }
    }
  }

  if (extension === ".css") {
    for (const match of source.matchAll(/font-size\s*:\s*(-?(?:\d+\.?\d*|\.\d+))(px|rem)\b/gi)) {
      const pixels = Number(match[1]) * (match[2].toLowerCase() === "rem" ? 16 : 1);
      if (pixels < 12)
        add(findings, "small-font", relativeFile, source, match.index, `${match[1]}${match[2].toLowerCase()}`, `Font size resolves to ${pixels}px, below the 12px floor`);
    }

    for (const match of source.matchAll(/border(?:-(?:top|bottom)-(?:left|right))?-radius\s*:\s*([^;}\n]+)/gi)) {
      const value = match[1].trim().toLowerCase().replace(/\s*!important$/, "");
      const fluentToken = /^var\(--borderradius(?:none|small|medium|large|xlarge|circular)\)$/.test(value);
      if (!allowedRadius.has(value) && !fluentToken)
        add(findings, "off-ramp-radius", relativeFile, source, match.index, value, `Border radius ${value} is outside the Fluent radius ramp`);
    }

    for (const block of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = block[1].trim();
      if (statutorySelectorPattern.test(selector)) continue;
      const declarationBlock = block[2];
      for (const match of declarationBlock.matchAll(/font-size\s*:\s*([^;}\n]+)/gi)) {
        const value = match[1].trim().toLowerCase().replace(/\s*!important$/, "");
        const fluentToken = /^var\(--fontsizebase\d+\)$/.test(value) || /^var\(--fontsizehero\d+\)$/.test(value);
        if (value !== "inherit" && !fluentToken) {
          const index = block.index + block[0].indexOf(declarationBlock) + match.index;
          add(findings, "off-ramp-font-size", relativeFile, source, index, value, `Font size ${value} is outside the Fluent type ramp`);
        }
      }
    }

    for (const match of source.matchAll(/([^{}]+)\{/g)) {
      const selector = match[1].trim();
      for (const token of selector.matchAll(/\.fui-[\w-]+|\.___[\w-]+|\[class(?:\^|\*|~)?=[^\]]*fui-/g))
        add(findings, "private-fluent-selector", relativeFile, source, match.index + token.index, token[0], `Private Fluent selector ${token[0]} is not a stable styling contract`);
    }

    if (path.basename(relativeFile) !== "forced-colors.css") {
      for (const block of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = block[1].trim();
        if (statutorySelectorPattern.test(selector)) continue;
        const declarationBlock = block[2];
        for (const color of declarationBlock.matchAll(literalColorPattern)) {
          const index = block.index + block[0].indexOf(declarationBlock) + color.index;
          add(findings, "literal-color", relativeFile, source, index, color[0].toLowerCase(), `Use a Fluent semantic color token instead of ${color[0]}`);
        }
      }
    }
  }

  if (productionScript && extension === ".tsx") {
    const visiblePatterns = [
      />\s*[^<>{\n]*(?:sha(?:-?256)?|hash)[^<>{\n]*</gi,
      /(["'`])[^\n"'`]*\b(?:sha(?:-?256)?|content hash|payload hash|event hash|signature hash)\b[^\n"'`]*\1/gi,
      /title=\{[^}\n]*(?:content_hash|payload_hash|event_hash|signature_hash)\b[^}\n]*\}/gi,
      /\{[^}\n]*(?:content_hash|payload_hash|event_hash|signature_hash)\b[^}\n]*\}/gi,
    ];
    for (const pattern of visiblePatterns) {
      for (const match of source.matchAll(pattern)) {
        const normalized = match[0].replace(/\s+/g, " ").trim();
        if (/&&|\?|===|!==/.test(normalized)) continue;
        add(findings, "visible-hash", relativeFile, source, match.index, normalized, "Do not expose implementation hashes or SHA labels in the product UI");
      }
    }
  }
  return findings;
}

export async function auditSource(rootDirectory) {
  const sourceRoot = path.join(rootDirectory, "src");
  const findings = [];
  for (const file of await filesUnder(sourceRoot)) {
    const relative = path.relative(rootDirectory, file).replaceAll(path.sep, "/");
    findings.push(...auditFile(relative, await readFile(file, "utf8")));
  }
  return findings.sort((a, b) => a.rule.localeCompare(b.rule) || a.file.localeCompare(b.file) || a.line - b.line || a.key.localeCompare(b.key));
}

export function summarizeBaseline(findings) {
  const baseline = {};
  for (const finding of findings) {
    const key = `${finding.rule}|${finding.file}|${finding.key}`;
    baseline[key] = (baseline[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(baseline).sort(([a], [b]) => a.localeCompare(b)));
}

export function unexpectedFindings(findings, baseline) {
  const seen = {};
  return findings.filter((finding) => {
    const key = `${finding.rule}|${finding.file}|${finding.key}`;
    seen[key] = (seen[key] ?? 0) + 1;
    return seen[key] > (baseline[key] ?? 0);
  });
}

async function main() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDirectory, "..");
  const findings = await auditSource(root);
  if (process.argv.includes("--print-baseline")) {
    process.stdout.write(`${JSON.stringify(summarizeBaseline(findings), null, 2)}\n`);
    return;
  }
  const baseline = JSON.parse(await readFile(path.join(scriptDirectory, "ui-quality-baseline.json"), "utf8"));
  const unexpected = unexpectedFindings(findings, baseline);
  if (unexpected.length) {
    for (const finding of unexpected) console.error(`${finding.file}:${finding.line} [${finding.rule}] ${finding.message}`);
    console.error(`UI source quality guard found ${unexpected.length} new violation(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(`UI source quality guard passed (${findings.length} explicitly baselined legacy occurrence${findings.length === 1 ? "" : "s"})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
