// Offline anime filter engine — pure canvas, no server.
// Pipeline: downscale → box-blur smoothing (bilateral-ish) → boosted saturation
// + color quantization (posterize) → Sobel edges composited as dark outlines.
// Produces a cartoon/anime look in ~2-4s on a modern phone.

export type AnimeStyle = "anime" | "warm" | "moody" | "bw";

interface Options {
  style?: AnimeStyle;
  strength?: number; // 0..1
  onProgress?: (pct: number, label: string) => void;
}

export async function animeFilter(srcUrl: string, opts: Options = {}): Promise<Blob> {
  const style = opts.style ?? "anime";
  const strength = clamp(opts.strength ?? 0.75, 0, 1);
  const progress = opts.onProgress ?? (() => {});

  progress(4, "Analyzing image");
  const img = await loadImage(srcUrl);
  await tick();

  // Downscale for speed; upscale back for final blob.
  const maxSide = 720;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0, w, h);

  progress(22, "Enhancing details");
  await tick();

  let base = ctx.getImageData(0, 0, w, h);
  base = boxBlur(base, 2);
  base = boxBlur(base, 2);

  progress(48, "Applying anime style");
  await tick();

  const edgeSrc = boxBlur(base, 1);
  const edges = sobelEdges(edgeSrc);

  progress(72, "Optimizing quality");
  await tick();

  const levels = style === "bw" ? 4 : 5;
  const satMul = style === "bw" ? 0 : style === "moody" ? 0.9 + 0.2 * strength : 1 + 0.7 * strength;
  const warmR = style === "warm" ? 14 : 0;
  const warmB = style === "warm" ? -10 : style === "moody" ? 8 : 0;
  const edgeIntensity = 0.55 + 0.4 * strength;

  const out = new ImageData(w, h);
  const bd = base.data;
  const od = out.data;
  for (let i = 0; i < bd.length; i += 4) {
    let r = bd[i];
    let g = bd[i + 1];
    let b = bd[i + 2];

    if (style === "bw") {
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = y;
    } else {
      [r, g, b] = adjustSat(r, g, b, satMul);
      r = clamp(r + warmR, 0, 255);
      b = clamp(b + warmB, 0, 255);
      if (style === "moody") {
        r *= 0.92;
        g *= 0.94;
        b *= 0.98;
      }
    }

    r = quantize(r, levels);
    g = quantize(g, levels);
    b = quantize(b, levels);

    const e = edges[i >> 2] * edgeIntensity;
    const k = 1 - e;
    od[i] = r * k;
    od[i + 1] = g * k;
    od[i + 2] = b * k;
    od[i + 3] = 255;
  }

  progress(90, "Finalizing magic");
  await tick();

  ctx.putImageData(out, 0, 0);

  // Upscale back to full resolution for a crisp result.
  const outCanvas = document.createElement("canvas");
  outCanvas.width = img.width;
  outCanvas.height = img.height;
  const octx = outCanvas.getContext("2d");
  if (!octx) throw new Error("Canvas unavailable");
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(c, 0, 0, img.width, img.height);

  const blob = await new Promise<Blob | null>((res) =>
    outCanvas.toBlob(res, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("Anime render failed");
  progress(100, "Done");
  return blob;
}

/** Returns a data URL preview for the anime pipeline at a small size. */
export async function animePreviewDataUrl(srcUrl: string, style: AnimeStyle, strength = 0.75) {
  const blob = await animeFilter(srcUrl, { style, strength });
  return await blobToDataUrl(blob);
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

function tick() {
  return new Promise((r) => setTimeout(r, 30));
}

function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
}

function quantize(v: number, levels: number) {
  const step = 255 / (levels - 1);
  return Math.round(v / step) * step;
}

function adjustSat(r: number, g: number, b: number, mul: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return [r, g, b];
  const l = (max + min) / 2;
  const d = max - min;
  let s = l > 127.5 ? d / (510 - max - min) : d / (max + min);
  s = clamp(s * mul, 0, 1);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  const ln = l / 255;
  const c = (1 - Math.abs(2 * ln - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = ln - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 1 / 6) [r1, g1, b1] = [c, x, 0];
  else if (h < 2 / 6) [r1, g1, b1] = [x, c, 0];
  else if (h < 3 / 6) [r1, g1, b1] = [0, c, x];
  else if (h < 4 / 6) [r1, g1, b1] = [0, x, c];
  else if (h < 5 / 6) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

function boxBlur(src: ImageData, radius: number): ImageData {
  const { width: w, height: h, data } = src;
  const size = 2 * radius + 1;
  const tmp = new Uint8ClampedArray(data.length);
  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let x = -radius; x <= radius; x++) {
        const xi = clamp(x, 0, w - 1);
        sum += data[(y * w + xi) * 4 + c];
      }
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 4 + c] = sum / size;
        const rem = clamp(x - radius, 0, w - 1);
        const add = clamp(x + radius + 1, 0, w - 1);
        sum += data[(y * w + add) * 4 + c] - data[(y * w + rem) * 4 + c];
      }
    }
  }
  // Vertical pass
  const out = new ImageData(w, h);
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) {
        const yi = clamp(y, 0, h - 1);
        sum += tmp[(yi * w + x) * 4 + c];
      }
      for (let y = 0; y < h; y++) {
        out.data[(y * w + x) * 4 + c] = sum / size;
        const rem = clamp(y - radius, 0, h - 1);
        const add = clamp(y + radius + 1, 0, h - 1);
        sum += tmp[(add * w + x) * 4 + c] - tmp[(rem * w + x) * 4 + c];
      }
    }
    for (let y = 0; y < h; y++) out.data[(y * w + x) * 4 + 3] = 255;
  }
  return out;
}

function sobelEdges(src: ImageData): Float32Array {
  const { width: w, height: h, data } = src;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  const edges = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] + gray[i - w + 1] +
        -2 * gray[i - 1] + 2 * gray[i + 1] +
        -gray[i + w - 1] + gray[i + w + 1];
      const gy =
        -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] +
        gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      const mag = Math.sqrt(gx * gx + gy * gy) / 360;
      edges[i] = mag > 0.18 ? Math.min(1, mag * 1.7) : 0;
    }
  }
  return edges;
}
