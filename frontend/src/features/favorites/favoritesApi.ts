export interface FavoriteRecipe {
  slug: string;
  created_at: string;
}

export const favoriteRecipesQueryKey = (userId: string | undefined) => [
  'favorite-recipes',
  userId ?? 'guest',
];
