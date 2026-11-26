import type { SyntheticEvent } from 'react';

import { hasEditedDishImage } from '@/data/dishImages';
import { fitDishCutout } from '@/lib/fitDishCutout';
import './dish-plate.css';

export type DishPlateKind = 'cutout' | 'photo';

/**
 * Đoán trước kiểu ảnh để tránh nháy khung: ảnh biên tập đã tách nền, ảnh JPEG là ảnh chụp có nền.
 * Sau khi ảnh tải xong, `fitDishPlate` đo kênh trong suốt để chỉnh lại nếu đoán sai.
 */
export function guessDishPlateKind(
  slug: string | null | undefined,
  src: string | null | undefined,
): DishPlateKind {
  if (hasEditedDishImage(slug)) return 'cutout';
  return src && /\.jpe?g(?:[?#]|$)/i.test(src) ? 'photo' : 'cutout';
}

function isSameOrigin(src: string) {
  try {
    return new URL(src, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Căn ảnh tách nền vào giữa đĩa; ảnh chụp không trong suốt chuyển sang kiểu cắt tròn để không
 * lộ nền vuông trắng trên mâm. Kết quả ghi vào `data-dish-kind` của phần tử `.dish-plate`.
 */
export function fitDishPlate(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  const plate = image.closest<HTMLElement>('.dish-plate');
  fitDishCutout(image);
  // Chỉ đo được ảnh cùng nguồn đang hiển thị; còn lại giữ kiểu đoán ban đầu.
  if (!plate || !image.clientWidth || !isSameOrigin(image.currentSrc || image.src)) return;
  const isCutout = image.style.getPropertyValue('--dish-content-scale') !== '';
  plate.dataset.dishKind = isCutout ? 'cutout' : 'photo';
}
