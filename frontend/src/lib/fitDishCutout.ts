const SAMPLE_SIZE = 48;
const ALPHA_THRESHOLD = 28;
const TARGET_OCCUPANCY = 0.84;
const MAX_SCALE = 1.32;

let sampleCanvas: HTMLCanvasElement | undefined;

export function fitDishCutout(image: HTMLImageElement) {
  if (!image.complete || !image.naturalWidth || !image.naturalHeight) return;

  const frame = image.parentElement?.getBoundingClientRect();
  if (!frame?.width || !frame.height) return;

  sampleCanvas ??= document.createElement('canvas');
  sampleCanvas.width = SAMPLE_SIZE;
  sampleCanvas.height = SAMPLE_SIZE;

  const context = sampleCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;

  try {
    context.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
    let minX = SAMPLE_SIZE;
    let minY = SAMPLE_SIZE;
    let maxX = -1;
    let maxY = -1;
    let transparent = 0;

    for (let y = 0; y < SAMPLE_SIZE; y += 1) {
      for (let x = 0; x < SAMPLE_SIZE; x += 1) {
        const alpha = pixels[(y * SAMPLE_SIZE + x) * 4 + 3] ?? 0;
        if (alpha < 248) transparent += 1;
        if (alpha <= ALPHA_THRESHOLD) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (transparent < SAMPLE_SIZE * SAMPLE_SIZE * 0.02 || maxX < minX || maxY < minY) return;

    const frameRatio = frame.width / frame.height;
    const imageRatio = image.naturalWidth / image.naturalHeight;
    const renderedWidth = Math.min(1, frameRatio / imageRatio);
    const renderedHeight = Math.min(1, imageRatio / frameRatio);
    const contentWidth = ((maxX - minX + 1) / SAMPLE_SIZE) * renderedWidth;
    const contentHeight = ((maxY - minY + 1) / SAMPLE_SIZE) * renderedHeight;
    const occupancy = Math.max(contentWidth, contentHeight);
    if (!occupancy) return;

    const scale = Math.min(MAX_SCALE, TARGET_OCCUPANCY / occupancy, 0.94 / occupancy);
    image.style.setProperty('--dish-content-scale', scale.toFixed(3));
  } catch {
    image.style.removeProperty('--dish-content-scale');
  }
}
