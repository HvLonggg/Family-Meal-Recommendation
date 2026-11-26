import { getRecipe, replaceRecipeCatalog, type Recipe } from '@/data/recipes';
import editedImages from '@/data/recipeImageAssets.json';
import { apiRequest } from '@/lib/api/client';
import { UserFacingError } from '@/lib/errors';

interface CatalogContent {
  aliases?: string[];
  region?: string[];
  province?: string[];
  category?: string;
  passive_time?: number;
  finished_dish?: string;
  tips?: string[];
  serving_basis?: string;
  recipe_family?: string;
  suggested_pairings?: { id: string; name: string }[];
  scaling?: { targets: { servings: number; seasoning_start_factor: number }[] };
  ingredients?: {
    name: string;
    scaling_rule: 'linear' | 'taste_adjusted' | 'fixed_ratio' | 'vessel_dependent';
  }[];
  tags?: Record<string, string[] | string | number | boolean>;
  display_image?: { source: string; rights_status: string; page_url?: string; license?: string };
  media?: { source: string; page_url: string; rights_status: string; license?: string | null }[];
}

interface EditedCatalogImage {
  src: string;
  srcSet: string;
  master: string;
  alt: string;
}

export interface ApiRecipe {
  catalog_id: string | null;
  slug: string;
  name: string;
  excerpt: string;
  region: Recipe['region'];
  category: Recipe['category'];
  difficulty: Recipe['difficulty'];
  prep_minutes: number;
  cook_minutes: number;
  base_servings: number;
  image_path: string;
  image_alt: string;
  serving: string;
  tip: string;
  source_name: string;
  source_url: string;
  ingredients: {
    group_name: string;
    name: string;
    amount: string | null;
    unit: string;
    note: string | null;
    scalable: boolean;
  }[];
  steps: { step_type: string; content: string; position: number }[];
  content: CatalogContent;
}

export function adaptRecipe(item: ApiRecipe, idToSlug: Map<string, string>): Recipe {
  const content = item.content;
  const fallback = getRecipe(item.slug);
  const image = content.display_image ?? content.media?.[0];
  const catalogImage = (editedImages as Record<string, EditedCatalogImage>)[item.slug];
  const editedImage =
    fallback?.imageKind === 'project' && fallback.imageSrcSet
      ? fallback
      : // Món mới do quản trị viên thêm: ảnh tách nền lưu ở máy chủ (/recipes/{slug}/image).
        item.image_path.includes(`/recipes/${item.slug}/image`)
        ? {
            image: item.image_path,
            imageSrcSet: undefined,
            imageMaster: item.image_path,
            imageAlt: item.image_alt,
            imageCredit: 'Ảnh minh họa của Bếp Việt được biên tập bởi tác giả',
          }
        : catalogImage
          ? {
              image: catalogImage.src,
              imageSrcSet: catalogImage.srcSet,
              imageMaster: catalogImage.master,
              imageAlt: catalogImage.alt,
              imageCredit: 'Ảnh minh họa của Bếp Việt được biên tập bởi tác giả',
            }
          : undefined;
  const ingredients: Recipe['ingredients'] = [];
  for (const ingredient of item.ingredients) {
    let group = ingredients.find((entry) => entry.group === ingredient.group_name);
    if (!group) {
      group = { group: ingredient.group_name, items: [] };
      ingredients.push(group);
    }
    group.items.push({
      name: ingredient.name,
      amount: ingredient.amount == null ? null : Number(ingredient.amount),
      unit: ingredient.unit,
      note: ingredient.note ?? undefined,
      scalable: ingredient.scalable,
      scalingRule: content.ingredients?.find((entry) => entry.name === ingredient.name)
        ?.scaling_rule,
    });
  }
  return {
    slug: item.slug,
    catalogId: item.catalog_id ?? undefined,
    name: item.name,
    aliases: content.aliases ?? [],
    provinces: content.province ?? [],
    excerpt: item.excerpt,
    image: editedImage?.image ?? item.image_path,
    imageSrcSet: editedImage?.imageSrcSet,
    imageMaster: editedImage?.imageMaster,
    imageAlt: editedImage?.imageAlt ?? item.image_alt,
    imageKind: editedImage
      ? 'project'
      : image
        ? image.rights_status === 'project'
          ? 'project'
          : image.rights_status === 'licensed'
            ? 'licensed'
            : 'reference'
        : fallback?.imageKind,
    imageCredit: editedImage?.imageCredit ?? image?.source ?? fallback?.imageCredit,
    imageCreditUrl: editedImage ? undefined : (image?.page_url ?? fallback?.imageCreditUrl),
    imageLicense: editedImage ? undefined : (image?.license ?? fallback?.imageLicense),
    region: item.region,
    regions: content.region ?? [item.region],
    category: item.category,
    ingredientCategory: content.category,
    cookingMethods: Array.isArray(content.tags?.cooking_method) ? content.tags.cooking_method : [],
    difficulty: item.difficulty,
    familyFriendly:
      typeof content.tags?.suitable_for_family_meal === 'boolean'
        ? content.tags.suitable_for_family_meal
        : undefined,
    spicyLevel:
      typeof content.tags?.spicy_level === 'number' ? content.tags.spicy_level : undefined,
    prepMinutes: item.prep_minutes,
    cookMinutes: item.cook_minutes,
    passiveMinutes: content.passive_time ?? 0,
    servings: item.base_servings,
    servingBasis: content.serving_basis,
    ingredients,
    preparation: item.steps
      .filter((step) => step.step_type === 'so_che')
      .map((step) => step.content),
    cooking: item.steps
      .filter((step) => step.step_type === 'thuc_hien')
      .map((step) => step.content),
    serving: item.serving,
    finishedDish: content.finished_dish,
    tip: item.tip,
    tips: content.tips ?? [item.tip],
    tags: Array.isArray(content.tags)
      ? content.tags.filter((tag): tag is string => typeof tag === 'string')
      : [
          'dish_type',
          'cooking_method',
          'meal_type',
          'province',
          ...(!content.tags?.main_ingredient ? ['keywords'] : []),
        ].flatMap((key) => {
          const values = content.tags?.[key];
          return Array.isArray(values) ? values : [];
        }),
    sourceName: 'Bếp Việt',
    sourceUrl: item.source_url,
    pairingSlugs: (content.suggested_pairings ?? []).flatMap((pair) => idToSlug.get(pair.id) ?? []),
    scalingTargets: content.scaling?.targets,
    family: content.recipe_family,
  };
}

export type CatalogLoadProgress = (progress: number) => void;

const CATALOG_PAGE_SIZE = 100;
// Số món lần tải trước: lần sau gọi song song mọi trang ngay, khỏi chờ trang đầu báo tổng số.
const CATALOG_TOTAL_HINT_KEY = 'bep-viet.catalog-total';
const MAX_HINTED_PAGES = 30;
// Kho món lớn: máy chủ chậm vẫn kịp trả lời trước khi rơi về bản lưu sẵn.
const API_TIMEOUT_MS = 30_000;
// Chưa nhận được trang nào của API sau chừng này (máy chủ miễn phí đang khởi động lại): tải song song bản lưu sẵn
// trên CDN, bản nào xong trước thì dùng, để người dùng không phải chờ tới 30 giây.
const SNAPSHOT_HEDGE_MS = 4_000;
const SNAPSHOT_TIMEOUT_MS = 20_000;

interface CatalogPayload {
  data: ApiRecipe[];
  total: number;
}

/** Bản lưu sẵn trên CDN (cũng được service worker lưu cho lúc mất mạng); chỉ dùng khi API lỗi/chậm. */
async function readStaticCatalog(): Promise<CatalogPayload> {
  const response = await fetch('/data/recipe-catalog.json', {
    signal: AbortSignal.timeout(SNAPSHOT_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('Recipe snapshot unavailable.');
  const snapshot = (await response.json()) as CatalogPayload;
  if (!snapshot.data?.length || snapshot.data.length !== snapshot.total)
    throw new Error('Recipe snapshot incomplete.');
  return snapshot;
}

function readTotalHint() {
  try {
    const total = Number(localStorage.getItem(CATALOG_TOTAL_HINT_KEY));
    return Number.isInteger(total) && total > 0 ? total : 0;
  } catch {
    return 0;
  }
}

function storeTotalHint(total: number) {
  try {
    localStorage.setItem(CATALOG_TOTAL_HINT_KEY, String(total));
  } catch {
    // Bộ nhớ trình duyệt bị chặn: lần sau tải tuần tự trang đầu như cũ.
  }
}

/**
 * Nạp kho món một lần duy nhất từ API (nguồn chuẩn, có món quản trị viên vừa thêm/sửa).
 * Bản JSON tĩnh chỉ được tải khi API lỗi hoặc quá chậm, không tải kèm ở mỗi lần mở app.
 */
export async function loadRecipeCatalog(
  onProgress: CatalogLoadProgress = () => undefined,
): Promise<'online' | 'offline'> {
  onProgress(12);
  const api = new AbortController();
  const apiTimer = setTimeout(() => api.abort(new Error('Recipe API timed out.')), API_TIMEOUT_MS);
  let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
  let snapshotRequest: Promise<CatalogPayload> | null = null;
  const snapshot = () => (snapshotRequest ??= readStaticCatalog());
  // Sau khi đã chọn nguồn, các trang API bị hủy không được báo tiến độ lùi lại màn chờ.
  let settled = false;
  const reportApiProgress: CatalogLoadProgress = (progress) => {
    // Đã nhận ít nhất một trang: máy chủ đang thức, không cần tải song song bản lưu sẵn.
    if (progress > 20) clearTimeout(hedgeTimer);
    if (!settled) onProgress(progress);
  };
  try {
    const result = await new Promise<{ source: 'online' | 'offline'; payload: CatalogPayload }>(
      (resolve, reject) => {
        let apiFailed = false;
        let apiError: unknown;
        const trySnapshot = () =>
          snapshot().then(
            (payload) => resolve({ source: 'offline', payload }),
            () => {
              if (apiFailed)
                reject(apiError instanceof Error ? apiError : new Error(String(apiError)));
            },
          );
        hedgeTimer = setTimeout(() => void trySnapshot(), SNAPSHOT_HEDGE_MS);
        loadApiCatalog(api.signal, reportApiProgress).then(
          (data) => resolve({ source: 'online', payload: { data, total: data.length } }),
          (error: unknown) => {
            apiFailed = true;
            apiError = error;
            reportApiProgress(20);
            void trySnapshot();
          },
        );
      },
    );
    settled = true;
    if (result.source === 'offline') {
      // Đã dùng bản lưu sẵn: dừng tải các trang API còn lại để đỡ tốn mạng.
      api.abort();
      onProgress(84);
    }
    installCatalog(result.payload.data, result.payload.total);
    if (result.source === 'online') storeTotalHint(result.payload.total);
    onProgress(92);
    return result.source;
  } finally {
    settled = true;
    clearTimeout(apiTimer);
    clearTimeout(hedgeTimer);
  }
}

function installCatalog(catalog: ApiRecipe[], total: number) {
  if (
    !catalog.length ||
    catalog.length !== total ||
    new Set(catalog.map((item) => item.slug)).size !== total
  )
    throw new UserFacingError('Kho món chưa được tải đầy đủ.');
  const ids = new Map(
    catalog.flatMap((item) => (item.catalog_id ? [[item.catalog_id, item.slug] as const] : [])),
  );
  replaceRecipeCatalog(catalog.map((item) => adaptRecipe(item, ids)));
}

async function loadApiCatalog(signal: AbortSignal, onProgress: CatalogLoadProgress) {
  const hintedPages = Math.min(MAX_HINTED_PAGES, Math.ceil(readTotalHint() / CATALOG_PAGE_SIZE));
  let pageCount = Math.max(1, hintedPages);
  let loadedPages = 0;
  const fetchPage = (index: number) =>
    apiRequest<CatalogPayload>(
      // compact=1: máy chủ chỉ trả các trường adaptRecipe đọc (nhẹ khoảng một nửa).
      index
        ? `/recipes/catalog?limit=${CATALOG_PAGE_SIZE}&offset=${index * CATALOG_PAGE_SIZE}&compact=1`
        : `/recipes/catalog?limit=${CATALOG_PAGE_SIZE}&compact=1`,
      { signal },
    ).then((page) => {
      // Mỗi trang đều kèm tổng số món: cập nhật số trang trước khi báo tiến độ.
      pageCount = Math.max(1, Math.ceil(page.total / CATALOG_PAGE_SIZE));
      loadedPages += 1;
      onProgress(20 + Math.min(1, loadedPages / pageCount) * 70);
      return page;
    });
  const range = (from: number, to: number) =>
    Array.from({ length: Math.max(0, to - from) }, (_, index) => from + index);
  // Có gợi ý số món: gọi song song mọi trang ngay; chưa có thì chờ trang đầu báo tổng số.
  const pages = await Promise.all(range(0, pageCount).map(fetchPage));
  const total = pages[0]!.total;
  const needed = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  if (needed > pages.length) {
    pages.push(...(await Promise.all(range(pages.length, needed).map(fetchPage))));
  }
  return pages.slice(0, needed).flatMap((page) => page.data);
}
