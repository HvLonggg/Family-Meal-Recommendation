import { getRecipe, replaceRecipeCatalog, type Recipe } from '@/data/recipes';
import { apiRequest } from '@/lib/api/client';

interface CatalogContent {
  aliases?: string[];
  region?: string[];
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
  const editedImage =
    fallback?.imageKind === 'project' && fallback.imageSrcSet ? fallback : undefined;
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
    difficulty: item.difficulty,
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
    tags: [
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

export async function loadRecipeCatalog(onProgress: CatalogLoadProgress = () => undefined) {
  onProgress(12);
  try {
    await loadApiCatalog(onProgress);
    return 'online' as const;
  } catch (error) {
    try {
      onProgress(20);
      const response = await fetch('/data/recipe-catalog.json', {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw error;
      const snapshot = (await response.json()) as { data: ApiRecipe[]; total: number };
      onProgress(84);
      installCatalog(snapshot.data, snapshot.total);
      onProgress(92);
      return 'offline' as const;
    } catch {
      throw error;
    }
  }
}

function installCatalog(catalog: ApiRecipe[], total: number) {
  if (
    !catalog.length ||
    catalog.length !== total ||
    new Set(catalog.map((item) => item.slug)).size !== total
  )
    throw new Error('Kho món chưa được tải đầy đủ.');
  const ids = new Map(
    catalog.flatMap((item) => (item.catalog_id ? [[item.catalog_id, item.slug] as const] : [])),
  );
  replaceRecipeCatalog(catalog.map((item) => adaptRecipe(item, ids)));
}

async function loadApiCatalog(onProgress: CatalogLoadProgress) {
  const signal = AbortSignal.timeout(12000);
  const first = await apiRequest<{ data: ApiRecipe[]; total: number }>(
    '/recipes/catalog?limit=100',
    { signal },
  );
  const pageCount = Math.max(1, Math.ceil(first.total / 100));
  let loadedPages = 1;
  const reportPageProgress = () => onProgress(20 + (loadedPages / pageCount) * 70);
  reportPageProgress();
  const pages = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      apiRequest<{ data: ApiRecipe[] }>(`/recipes/catalog?limit=100&offset=${(index + 1) * 100}`, {
        signal,
      }).then((page) => {
        loadedPages += 1;
        reportPageProgress();
        return page;
      }),
    ),
  );
  const catalog = [...first.data, ...pages.flatMap((page) => page.data)];
  installCatalog(catalog, first.total);
  onProgress(92);
}
