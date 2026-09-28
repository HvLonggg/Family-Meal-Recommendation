import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import type { Recipe } from '@/data/recipes';

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <article className="recipe-card">
      <Link className="recipe-card__media" to={`/mon-an/${recipe.slug}`}>
        <img alt={recipe.imageAlt} loading="lazy" src={recipe.image} />
        <span className="recipe-card__region">{recipe.region}</span>
        <button
          aria-label={`Lưu món ${recipe.name}`}
          className="icon-button recipe-card__save"
          type="button"
          onClick={(event) => event.preventDefault()}
        >
          <AppIcon name="heart" size={18} />
        </button>
      </Link>
      <div className="recipe-card__body">
        <div className="recipe-card__meta">
          <span>
            <AppIcon name="clock" size={16} /> {recipe.prepMinutes + recipe.cookMinutes} phút
          </span>
          <span>
            <AppIcon name="chef" size={16} /> {recipe.difficulty}
          </span>
        </div>
        <h3>
          <Link to={`/mon-an/${recipe.slug}`}>{recipe.name}</Link>
        </h3>
        <p>{recipe.excerpt}</p>
        <Link className="text-link" to={`/mon-an/${recipe.slug}`}>
          Xem công thức <AppIcon name="arrow" size={16} />
        </Link>
      </div>
    </article>
  );
}
