interface KitchenHomeLogoProps {
  compact?: boolean;
}

export function KitchenHomeLogo({ compact = false }: KitchenHomeLogoProps) {
  return (
    <span className={`kitchen-logo${compact ? ' kitchen-logo--compact' : ''}`}>
      <span className="kitchen-logo__mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" role="img">
          <path d="M7 21.5 24 7l17 14.5v18a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3v-18Z" />
          <path d="M16 29h16v5.5A5.5 5.5 0 0 1 26.5 40h-5A5.5 5.5 0 0 1 16 34.5V29Z" />
          <path d="M14 26h20M19 24c0-2 2-2 2-4s-2-2-2-4m8 8c0-2 2-2 2-4s-2-2-2-4" />
        </svg>
      </span>
      <span className="kitchen-logo__text">
        <strong>Bếp Việt</strong>
        {!compact ? <small>Bữa nhà trọn vị</small> : null}
      </span>
    </span>
  );
}
