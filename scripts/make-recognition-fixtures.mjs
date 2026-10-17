import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "pwa/public/recognition-samples");
const strokes = {
  A: [24, "M1 31 Q9 9 15 1 Q19 12 24 31 M6 21 L21 21"],
  D: [25, "M4 31 Q5 15 4 2 M4 2 C32 -3 33 32 4 31"],
  E: [22, "M21 2 L5 3 L4 31 L22 30 M5 16 L18 15"],
  F: [22, "M4 32 L5 3 L23 2 M5 16 L18 15"],
  N: [27, "M3 32 L4 2 Q14 14 25 31 L25 1"],
  a: [19, "M16 15 C4 7 -1 30 9 31 Q15 31 17 14 Q15 29 19 31"],
  b: [18, "M4 2 L3 30 M4 18 C22 1 24 34 5 30"],
  c: [18, "M17 15 C4 6 -3 33 16 30"],
  d: [20, "M16 16 C0 5 -2 33 11 30 Q17 26 18 2 L17 29 L20 31"],
  e: [18, "M3 23 Q22 21 14 13 C3 7 -4 37 18 29"],
  f: [14, "M4 41 Q4 -2 15 2 M1 16 L14 15"],
  g: [19, "M17 15 C4 8 -1 28 8 30 Q14 31 17 15 L16 37 C14 48 2 44 3 39"],
  h: [19, "M3 2 L3 31 Q4 14 12 13 Q21 12 17 31"],
  i: [8, "M4 14 L3 30 L7 31 M5 5 L5 6"],
  l: [9, "M5 2 Q1 27 4 30 L8 31"],
  m: [29, "M2 14 L2 31 Q4 12 12 14 Q17 14 15 31 Q17 10 24 15 Q28 18 27 31"],
  n: [20, "M3 14 L2 31 Q5 10 14 14 Q19 17 18 31"],
  o: [19, "M12 13 C0 9 -2 32 10 31 C24 29 19 12 12 13"],
  p: [20, "M4 14 L3 44 M4 19 C18 1 26 31 9 30 L4 29"],
  r: [15, "M3 14 L2 31 M3 21 Q9 9 15 15"],
  s: [17, "M16 14 C2 7 -1 21 10 23 C25 27 11 37 1 28"],
  t: [13, "M7 5 Q2 32 11 30 M1 15 L14 14"],
  u: [20, "M3 14 Q-1 34 10 30 Q17 27 17 14 Q15 29 20 31"],
  v: [19, "M1 14 Q5 28 8 31 Q14 24 18 13"],
  w: [27, "M1 14 L6 31 Q10 26 13 16 L18 31 Q23 23 26 13"],
  x: [19, "M2 14 L18 31 M18 14 L1 31"],
  y: [19, "M2 14 Q5 29 10 29 L18 14 M18 14 Q13 47 3 43"],
  '0': [21, "M12 2 C-2 0 -3 35 12 32 C25 30 23 0 12 2"],
  '1': [14, "M2 10 L9 2 L8 32 M2 32 L16 31"],
  '2': [22, "M2 9 C5 -4 26 0 19 13 Q13 22 1 32 L23 31"],
  '3': [22, "M2 4 C26 -4 24 15 10 16 C28 12 27 39 2 30"],
  '4': [23, "M17 1 L2 22 L24 21 M18 8 L17 33"],
  '5': [22, "M22 2 L5 3 L3 16 C25 9 29 37 2 30"],
  '6': [22, "M20 2 C2 0 -4 31 10 32 C27 33 25 10 7 17"],
  '7': [22, "M1 3 L23 2 Q13 16 9 32"],
  '8': [22, "M11 16 C-8 8 11 -8 20 6 C26 16 -4 17 2 28 C7 40 33 26 11 16"],
  '9': [22, "M18 17 C-2 26 -3 0 12 2 C27 2 18 27 8 33"],
  ':': [9, "M5 16 L5 17 M4 28 L4 29"],
  '-': [13, "M2 22 L12 21"],
  '/': [17, "M16 1 L1 35"],
  '?': [20, "M2 8 C6 -4 27 2 18 12 Q10 19 10 23 M9 31 L9 32"],
  ' ': [13, ""],
};
let state = 109;
function random() { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }
function penImage(lines, difficult = false) {
  let paths = "";
  for (let row = 0; row < lines.length; row++) {
    let x = 40;
    for (const letter of lines[row]) {
      const glyph = strokes[letter];
      if (!glyph) throw new Error(`Missing pen stroke for ${letter}`);
      const [width, d] = glyph;
      const y = 45 + row * 86 + (random() - 0.5) * (difficult ? 8 : 3);
      const stretch = 1 + (random() - 0.5) * 0.12;
      const angle = (random() - 0.5) * (difficult ? 13 : 5);
      if (d) paths += `<path d="${d}" transform="translate(${x} ${y}) rotate(${angle}) skewX(-7) scale(${stretch} 1)" stroke-width="${1.5 + random() * 0.6}"/>`;
      x += width + 3 + random() * 2;
    }
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="330" viewBox="0 0 900 270"><rect width="900" height="270" fill="#fffdf6"/><g fill="none" stroke="#233a64" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`);
}
const reference = "Appointment: 18 November 2026\nFollow-up: 25 November 2026\nDocument expires: 30 November 2026";
const cases = [
  { id: "pen-clear", kind: "synthetic-pen-strokes", reference },
  { id: "pen-difficult", kind: "synthetic-pen-strokes", reference, difficult: true },
  { id: "pen-rotated", kind: "synthetic-pen-strokes", reference, rotated: true },
  { id: "pen-numeric", kind: "synthetic-pen-strokes", reference: "Appointment: 18/11/2026\nFollow-up: 25-11-2026\nDocument expires: 2026-11-30" },
  { id: "pen-ambiguous", kind: "synthetic-pen-strokes", reference: "Document expires: 03/04/2027\nFollow-up: ?\nAppointment: ?" },
  { id: "pen-illegible", kind: "synthetic-pen-strokes", reference: "Document expires: ???\nFollow-up: ???\nAppointment: ???", difficult: true, illegible: true },
  { id: "printed-control", kind: "printed", reference },
];
await mkdir(output, { recursive: true });
for (const entry of cases) {
  let image;
  if (entry.kind === "printed") {
    image = sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="330"><rect width="1100" height="330" fill="white"/><g font-size="40" fill="black">${entry.reference.split("\n").map((line, i) => `<text x="40" y="${75 + i * 95}">${line}</text>`).join("")}</g></svg>`));
  } else {
    image = sharp(penImage(entry.reference.split("\n"), entry.difficult));
    if (entry.rotated) image = image.rotate(5, { background: "#d8d5c9" }).modulate({ brightness: 0.8 });
    if (entry.difficult) image = image.blur(entry.illegible ? 3.5 : 0.6);
  }
  await image.png().toFile(path.join(output, `${entry.id}.png`));
}
await writeFile(path.join(output, "dataset.json"), JSON.stringify({
  version: 1,
  provenance: "Synthetic pen trajectories authored for tests; not human handwriting, not a real family record. Printed control is explicitly separate. This narrow synthetic set does not validate natural handwriting accuracy.",
  cases: cases.map(({ id, kind, reference }) => ({ id, kind, image: `/recognition-samples/${id}.png`, reference })),
}, null, 2) + "\n");
console.log(`Wrote ${cases.length} synthetic recognition fixtures.`);
