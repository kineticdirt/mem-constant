import sharp from "sharp";

/**
 * Deterministic map enhance — Lanczos resize + optional contrast/sharpen (no AI).
 * Order: resize → percentile normalize → linear contrast → unsharp mask.
 */
export async function processMapImage(input, output, opts = {}) {
  const scale = opts.scale ?? 1;
  const contrast = opts.contrast ?? 1;
  const sharpenSigma = opts.sharpen ?? 0;
  const saturation = opts.saturation ?? 1;
  const normLow = opts.normalizeLow;
  const normHigh = opts.normalizeHigh;

  const meta = await sharp(input).metadata();
  const outW = scale === 1 ? meta.width : Math.round(meta.width * scale);
  const outH = scale === 1 ? meta.height : Math.round(meta.height * scale);

  let pipe = sharp(input);
  if (scale !== 1) {
    pipe = pipe.resize(outW, outH, { kernel: sharp.kernel.lanczos3, withoutEnlargement: false });
  }
  if (normLow != null && normHigh != null) {
    pipe = pipe.normalize({ lower: normLow, upper: normHigh });
  }
  if (contrast !== 1) {
    const offset = 128 * (1 - contrast);
    pipe = pipe.linear(contrast, offset);
  }
  if (saturation !== 1) {
    pipe = pipe.modulate({ saturation });
  }
  if (sharpenSigma > 0) {
    pipe = pipe.sharpen({ sigma: sharpenSigma, m1: 0.6, m2: 0.4 });
  }

  await pipe.png({ compressionLevel: 6 }).toFile(output);
  return { inW: meta.width, inH: meta.height, outW, outH };
}

/** Per-panel: upscale only — NO normalize/contrast (prevents seam + washout). */
export const PANEL_PRESETS = {
  "upscale-only": { scale: 2, contrast: 1, sharpen: 0.12, saturation: 1 },
};

/** Full-image pass after stitch — one consistent grade across the map. */
export const GLOBAL_PRESETS = {
  "map-default": { scale: 1, contrast: 1.06, sharpen: 0.38, saturation: 1.08 },
  "map-gentle": { scale: 1, contrast: 1.04, sharpen: 0.28, saturation: 1.05 },
  "minimal": { scale: 1, contrast: 1.03, sharpen: 0.22, saturation: 1.03 },
};

/** Legacy single-pass presets (whole image, no panel split). */
export const PRESETS = {
  "map-default": { scale: 2, contrast: 1.08, sharpen: 0.4, saturation: 1.06 },
  "map-gentle": { scale: 1.5, contrast: 1.05, sharpen: 0.3, saturation: 1.04 },
  "contrast-only": { scale: 1, contrast: 1.08, sharpen: 0.35, saturation: 1.05 },
};
