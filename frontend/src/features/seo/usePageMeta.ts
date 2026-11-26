import { useEffect } from 'react';
import { useLocation } from 'react-router';

import { useI18n } from '@/features/i18n/I18nContext';

export const SITE_URL = 'https://bepviet-vn.vercel.app';
export const DEFAULT_SHARE_IMAGE = '/images/brand/bep-viet-logo.png';
export const DEFAULT_DESCRIPTION =
  'Bếp Việt giúp gia đình chọn món, điều chỉnh khẩu phần và lên lịch nấu ăn theo lịch trình.';

export type PageMeta = {
  /** Tiêu đề trang, chưa gồm tên thương hiệu. Bỏ trống để lấy theo thẻ h1 đang hiển thị. */
  title?: string;
  description?: string;
  image?: string;
  noindex?: boolean;
};

// Trang con khai báo meta riêng; bố cục áp dụng lại mỗi khi đổi trang hoặc đổi ngôn ngữ.
let pageMeta: PageMeta | null = null;
let applyRouteMeta: (() => void) | null = null;

function setMetaTag(attribute: 'name' | 'property', key: string, content: string | null) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (content == null) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function setCanonical(href: string | null) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (href == null) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

function absoluteUrl(value: string) {
  try {
    return new URL(value, SITE_URL).href;
  } catch {
    return new URL(DEFAULT_SHARE_IMAGE, SITE_URL).href;
  }
}

/** URL chuẩn: tên miền production, bỏ query/hash và dấu `/` cuối. */
export function canonicalUrl(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return `${SITE_URL}${path}`;
}

/**
 * Dùng một lần trong bố cục công khai: cập nhật tiêu đề tab, description, Open Graph, Twitter
 * và canonical theo trang hiện tại; chạy lại ngay khi đổi ngôn ngữ.
 */
export function useRouteDocumentMeta() {
  const { pathname } = useLocation();
  const { language, t } = useI18n();

  useEffect(() => {
    const brand = t('Bếp Việt');
    const apply = () => {
      const meta = pageMeta ?? {};
      const heading =
        pathname === '/'
          ? ''
          : (document.querySelector('main h1')?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const name = meta.title ?? heading;
      const title = name ? `${name} · ${brand}` : brand;
      const description = meta.description?.trim() || t(DEFAULT_DESCRIPTION);
      const image = absoluteUrl(meta.image || DEFAULT_SHARE_IMAGE);
      const url = canonicalUrl(pathname);
      document.title = title;
      setMetaTag('name', 'description', description);
      setMetaTag('property', 'og:site_name', brand);
      setMetaTag('property', 'og:type', 'website');
      setMetaTag('property', 'og:locale', language === 'en' ? 'en_US' : 'vi_VN');
      setMetaTag('property', 'og:title', title);
      setMetaTag('property', 'og:description', description);
      setMetaTag('property', 'og:image', image);
      setMetaTag('property', 'og:url', url);
      setMetaTag('name', 'twitter:card', 'summary_large_image');
      setMetaTag('name', 'twitter:title', title);
      setMetaTag('name', 'twitter:description', description);
      setMetaTag('name', 'twitter:image', image);
      setMetaTag('name', 'robots', meta.noindex ? 'noindex' : null);
      setCanonical(meta.noindex ? null : url);
    };
    applyRouteMeta = apply;
    apply();
    // Trang tải dữ liệu chậm (bài viết) có tiêu đề muộn hơn.
    const timers = [window.setTimeout(apply, 400), window.setTimeout(apply, 1500)];
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      if (applyRouteMeta === apply) applyRouteMeta = null;
    };
  }, [language, pathname, t]);
}

/** Khai báo meta riêng của trang (món ăn, trang 404…). */
export function usePageMeta({ title, description, image, noindex = false }: PageMeta) {
  useEffect(() => {
    pageMeta = { title, description, image, noindex };
    // 404 không cần chờ bố cục: chặn lập chỉ mục ngay khi trang hiển thị.
    if (noindex) setMetaTag('name', 'robots', 'noindex');
    applyRouteMeta?.();
    return () => {
      pageMeta = null;
      if (noindex) setMetaTag('name', 'robots', null);
    };
  }, [description, image, noindex, title]);
}
