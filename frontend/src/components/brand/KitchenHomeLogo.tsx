interface KitchenHomeLogoProps {
  compact?: boolean;
}

export function KitchenHomeLogo({ compact = false }: KitchenHomeLogoProps) {
  return (
    <span className={`kitchen-logo${compact ? ' kitchen-logo--compact' : ''}`}>
      <img className="kitchen-logo__image" src="/images/brand/bep-viet-logo.png" alt="Bếp Việt" />
    </span>
  );
}
