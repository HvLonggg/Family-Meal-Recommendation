import type { SyntheticEvent } from 'react';

import editedImages from '@/data/recipeImageAssets.json';
import { fitDishCutout } from '@/lib/fitDishCutout';

interface EditedImage {
  src: string;
  srcSet: string;
  master: string;
  alt: string;
}

const assets = editedImages as Record<string, EditedImage>;

export interface DishImageProps {
  src?: string;
  srcSet?: string;
  sizes?: string;
  className: string;
  onLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
}

/**
 * Ảnh món luôn dùng bản đã tách nền: bộ ảnh biên tập của kho món, hoặc ảnh tách nền
 * quản trị viên tải lên cho món mới (đã được máy chủ kiểm tra nền trong suốt).
 * Trả về thuộc tính để rải thẳng vào thẻ `<img>`.
 */
export function dishImage(
  slug: string | null | undefined,
  fallback?: string | null,
  sizes = '160px',
): DishImageProps {
  const edited = slug ? assets[slug] : undefined;
  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => fitDishCutout(event.currentTarget);
  if (edited)
    return { src: edited.src, srcSet: edited.srcSet, sizes, className: 'dish-cutout', onLoad };
  return { src: fallback ?? undefined, className: 'dish-cutout', onLoad };
}

export function hasEditedDishImage(slug: string | null | undefined) {
  return Boolean(slug && assets[slug]);
}
