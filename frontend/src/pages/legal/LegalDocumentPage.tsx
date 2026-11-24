import { useEffect, type MouseEvent } from 'react';
import { Link } from 'react-router';

import { useI18n } from '@/features/i18n/I18nContext';
import { KitchenHomeLogo } from '@/components/brand/KitchenHomeLogo';
import { contactInfo } from '@/config/contact';
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSION,
  type LegalBlock,
  type LegalDocumentContent,
} from '@/pages/legal/legalTypes';
import { privacyEn, privacyVi } from '@/pages/legal/privacyContent';
import { termsEn, termsVi } from '@/pages/legal/termsContent';
import '@/pages/legal/legal.css';

type LegalKind = 'privacy' | 'terms';

const documents: Record<LegalKind, Record<'vi' | 'en', LegalDocumentContent>> = {
  privacy: { vi: privacyVi, en: privacyEn },
  terms: { vi: termsVi, en: termsEn },
};

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === 'string') return <p>{block}</p>;
  return (
    <ul>
      {block.list.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** Trang văn bản pháp lý công khai (không cần đăng nhập) với mục lục neo. */
function LegalDocumentPage({ kind }: { kind: LegalKind }) {
  const { language, t } = useI18n();
  const lang = language === 'en' ? 'en' : 'vi';
  const content = documents[kind][lang];

  useEffect(() => {
    document.title = `${content.title} · ${t('Bếp Việt')}`;
  }, [content.title, t]);

  // Chuyển focus tới tiêu đề mục để người dùng bàn phím/trình đọc màn hình đọc tiếp đúng chỗ.
  const jumpTo = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView?.({ block: 'start' });
    target.focus({ preventScroll: true });
    window.history.replaceState(null, '', `#${id}`);
  };

  return (
    <div className="legal-shell">
      <a className="skip-link" href="#legal-content">
        {t('Bỏ qua đến nội dung chính')}
      </a>
      <header className="legal-topbar">
        <Link className="legal-topbar__brand" to="/">
          <KitchenHomeLogo compact />
          {t('Bếp Việt')}
        </Link>
        <nav aria-label={t('Văn bản pháp lý')} className="legal-topbar__nav">
          <Link aria-current={kind === 'terms' ? 'page' : undefined} to="/terms">
            {t('Điều khoản sử dụng')}
          </Link>
          <Link aria-current={kind === 'privacy' ? 'page' : undefined} to="/privacy">
            {t('Chính sách quyền riêng tư')}
          </Link>
        </nav>
      </header>
      <main className="legal-page" id="legal-content" tabIndex={-1}>
        <header className="legal-page__header">
          <p className="legal-page__eyebrow">
            {lang === 'vi' ? 'BẾP VIỆT · MINH BẠCH & TIN CẬY' : 'BEP VIET · TRANSPARENCY & TRUST'}
          </p>
          <h1>{content.title}</h1>
          <p className="legal-page__meta">
            <span>
              {content.effectiveLabel}: {LEGAL_EFFECTIVE_DATE[lang]}
            </span>
            <span>
              {content.versionLabel}: {LEGAL_VERSION}
            </span>
          </p>
          <p className="legal-page__summary">{content.summary}</p>
        </header>
        <div className="legal-page__layout">
          <nav aria-labelledby={`${kind}-toc`} className="legal-toc">
            <h2 id={`${kind}-toc`}>{content.tocLabel}</h2>
            <ol>
              {content.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} onClick={(event) => jumpTo(event, section.id)}>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="legal-body">
            {content.sections.map((section) => (
              <section aria-labelledby={section.id} key={section.id}>
                <h2 id={section.id} tabIndex={-1}>
                  {section.title}
                </h2>
                {section.blocks.map((block, index) => (
                  <Block block={block} key={index} />
                ))}
              </section>
            ))}
          </article>
        </div>
        <aside className="legal-contact">
          <div>
            <h2>{lang === 'vi' ? 'Cần giải đáp thêm?' : 'Need clarification?'}</h2>
            <p>
              {lang === 'vi'
                ? 'Gửi yêu cầu về tài khoản, nội dung hoặc quyền riêng tư. Bếp Việt phản hồi trong vòng 24 giờ làm việc; thời hạn giải quyết tùy nội dung và quy định áp dụng.'
                : 'Contact us about your account, content or privacy. We respond within 24 working hours; resolution depends on the request and applicable requirements.'}
            </p>
          </div>
          <a href={`mailto:${contactInfo.email}`}>{contactInfo.email} ↗</a>
        </aside>
        <p className="legal-page__back">
          <Link to="/">{t('Về trang chủ Bếp Việt')}</Link>
        </p>
      </main>
    </div>
  );
}

export function PrivacyPage() {
  return <LegalDocumentPage kind="privacy" />;
}

export function TermsPage() {
  return <LegalDocumentPage kind="terms" />;
}
