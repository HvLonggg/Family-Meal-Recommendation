const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export class ImageProcessingError extends Error {}

interface ResizeOptions {
  /** Cạnh dài tối đa (hoặc cạnh của ảnh vuông khi `square`). */
  maxSize: number;
  /** Giới hạn dung lượng sau nén, tính theo byte. */
  maxBytes: number;
  square?: boolean;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageProcessingError('Không đọc được ảnh này.'));
    };
    image.src = url;
  });
}

function dataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((base64.length * 3) / 4);
}

/** Thu nhỏ và nén ảnh ngay trên trình duyệt để tải lên nhanh, tiết kiệm dữ liệu. */
export async function resizeImageFile(file: File, options: ResizeOptions) {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new ImageProcessingError('Vui lòng chọn ảnh JPG, PNG hoặc WebP.');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new ImageProcessingError('Ảnh quá lớn. Vui lòng chọn ảnh dưới 15 MB.');
  }
  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;
  let width: number;
  let height: number;
  if (options.square) {
    const side = Math.min(sourceWidth, sourceHeight);
    sx = (sourceWidth - side) / 2;
    sy = (sourceHeight - side) / 2;
    sw = side;
    sh = side;
    width = Math.min(options.maxSize, side);
    height = width;
  } else {
    const scale = Math.min(1, options.maxSize / Math.max(sourceWidth, sourceHeight));
    width = Math.round(sourceWidth * scale);
    height = Math.round(sourceHeight * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new ImageProcessingError('Trình duyệt chưa hỗ trợ xử lý ảnh.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);

  for (const quality of [0.86, 0.78, 0.68, 0.58, 0.48]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrlBytes(dataUrl) <= options.maxBytes) return dataUrl;
  }
  throw new ImageProcessingError('Ảnh vẫn quá lớn sau khi nén. Hãy chọn ảnh khác.');
}
