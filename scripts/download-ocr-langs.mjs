#!/usr/bin/env node
/**
 * Downloads tesseract traineddata files into OCR_LANG_PATH so the app can
 * perform OCR with no network access at runtime.
 *
 *   npm run ocr:download-langs            # languages from .env / default "eng"
 *   npm run ocr:download-langs -- eng+urd # explicit list
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const CDN = "https://cdn.jsdelivr.net/npm/@tesseract.js-data";
const VERSION = "4.0.0";

function readEnvFile(file) {
  try {
    const text = readFileSync(file, "utf8");
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      out[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const dotenv = readEnvFile(path.resolve(process.cwd(), ".env"));

const requested =
  process.argv[2] || dotenv.OCR_LANGUAGES || process.env.OCR_LANGUAGES || "eng";

const languages = requested
  .split(/[+,\s]+/)
  .map((l) => l.trim())
  .filter(Boolean);

const targetDir = path.resolve(
  process.cwd(),
  dotenv.OCR_LANG_PATH || process.env.OCR_LANG_PATH || "./storage/ocr-lang",
);

async function exists(file) {
  try {
    const info = await stat(file);
    return info.isFile();
  } catch {
    return false;
  }
}

async function download(language) {
  const target = path.join(targetDir, `${language}.traineddata.gz`);

  if (await exists(target)) {
    console.log(`  = ${language}: already present (${(await stat(target)).size} bytes)`);
    return true;
  }

  const url = `${CDN}/${language}/${VERSION}/${language}.traineddata.gz`;
  process.stdout.write(`  ↓ ${language}: ${url}\n`);

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    console.error(`  ✗ ${language}: HTTP ${response.status}`);
    return false;
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024) {
    console.error(`  ✗ ${language}: response too small (${bytes.length} bytes), likely an error page`);
    return false;
  }

  await writeFile(target, bytes);
  console.log(`  ✓ ${language}: ${(bytes.length / 1048576).toFixed(1)} MB`);
  return true;
}

console.log(`Writing OCR language data to ${targetDir}`);
console.log(`Languages: ${languages.join(", ")}\n`);

await mkdir(targetDir, { recursive: true });

let failures = 0;
for (const language of languages) {
  try {
    if (!(await download(language))) failures++;
  } catch (error) {
    console.error(`  ✗ ${language}: ${error.message}`);
    failures++;
  }
}

console.log(
  failures === 0
    ? "\nDone. OCR can now run without network access."
    : `\n${failures} language(s) failed. tesseract.js will fall back to its CDN at runtime.`,
);

process.exit(failures === 0 ? 0 : 1);
