export type LineRange = { top: number; bottom: number };

export function findInkLines(data: Uint8ClampedArray, width: number, height: number): LineRange[] {
  const occupied: number[] = [];
  const threshold = Math.max(2, Math.floor(width * 0.004));
  for (let y = 0; y < height; y++) {
    let ink = 0;
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      if (data[at]! < 150 && data[at + 1]! < 150 && data[at + 2]! < 150 && data[at + 3]! > 128) ink++;
    }
    if (ink >= threshold) occupied.push(y);
  }
  const ranges: LineRange[] = [];
  const gap = Math.max(4, Math.round(height * 0.006));
  for (const y of occupied) {
    const previous = ranges[ranges.length - 1];
    if (previous && y - previous.bottom <= gap) previous.bottom = y;
    else ranges.push({ top: y, bottom: y });
  }
  return ranges.filter(({ top, bottom }) => bottom - top >= 3);
}

export async function prepareRecognitionImages(file: Blob, options: { handwriting: boolean; rotation: number }): Promise<Blob[]> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo or scanned image for reading. PDFs can still be saved unchanged.");
  if (file.size > 25 * 1024 * 1024) throw new Error("Choose an image smaller than 25 MB.");
  if (![0, 90, 180, 270].includes(options.rotation)) throw new Error("Choose one of the available rotations.");
  const image = await createImageBitmap(file);
  try {
    if (image.width * image.height > 40_000_000) throw new Error("This image is too large to read safely here. Choose a smaller copy.");
    const scale = Math.min(1, 2400 / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const sideways = options.rotation === 90 || options.rotation === 270;
    const canvas = document.createElement("canvas");
    canvas.width = sideways ? height : width;
    canvas.height = sideways ? width : height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser cannot prepare images for reading.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(options.rotation * Math.PI / 180);
    context.drawImage(image, -width / 2, -height / 2, width, height);
    context.restore();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const gray = pixels.data[i]! * 0.299 + pixels.data[i + 1]! * 0.587 + pixels.data[i + 2]! * 0.114;
      const value = Math.max(0, Math.min(255, (gray - 128) * 1.2 + 128));
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    }
    context.putImageData(pixels, 0, 0);
    if (!options.handwriting) return [await toPng(canvas)];
    const lines = findInkLines(pixels.data, canvas.width, canvas.height);
    if (!lines.length) throw new Error("No clear lines of handwriting were found. Try a closer, brighter photo or type the text yourself.");
    if (lines.length > 24) throw new Error("Choose a crop with up to 24 handwritten lines. Tables and crowded pages need smaller crops.");
    const output: Blob[] = [];
    for (const line of lines) {
      const padding = Math.max(6, Math.round((line.bottom - line.top) * 0.2));
      const top = Math.max(0, line.top - padding);
      const bottom = Math.min(canvas.height, line.bottom + padding + 1);
      const crop = document.createElement("canvas");
      crop.width = canvas.width;
      crop.height = bottom - top;
      crop.getContext("2d")!.drawImage(canvas, 0, top, canvas.width, crop.height, 0, 0, crop.width, crop.height);
      output.push(await toPng(crop));
    }
    return output;
  } finally {
    image.close();
  }
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error("The image could not be prepared. Your original is unchanged."));
  }, "image/png"));
}
