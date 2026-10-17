import assert from "node:assert/strict";
import { test } from "node:test";
import { findInkLines } from "../../pwa/src/recognition/preprocess";

test("line segmentation separates ink bands and ignores isolated specks", () => {
  const width = 100, height = 100;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [top, bottom] of [[10, 20], [40, 50], [70, 80]]) {
    for (let y = top!; y <= bottom!; y++) {
      for (let x = 20; x < 80; x++) {
        const at = (y * width + x) * 4;
        pixels[at] = pixels[at + 1] = pixels[at + 2] = 20;
      }
    }
  }
  pixels[0] = pixels[1] = pixels[2] = 0;
  assert.deepEqual(findInkLines(pixels, width, height), [
    { top: 10, bottom: 20 }, { top: 40, bottom: 50 }, { top: 70, bottom: 80 },
  ]);
});

test("blank and transparent images produce no invented lines", () => {
  assert.deepEqual(findInkLines(new Uint8ClampedArray(400).fill(255), 10, 10), []);
  assert.deepEqual(findInkLines(new Uint8ClampedArray(400), 10, 10), []);
});
