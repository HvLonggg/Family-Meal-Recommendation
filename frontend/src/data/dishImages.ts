import editedImages from '@/data/recipeImageAssets.json';

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
  if (edited) return { src: edited.src, srcSet: edited.srcSet, sizes, className: 'dish-cutout' };
  return { src: fallback ?? undefined, className: 'dish-cutout' };
}

export function hasEditedDishImage(slug: string | null | undefined) {
  return Boolean(slug && assets[slug]);
}
