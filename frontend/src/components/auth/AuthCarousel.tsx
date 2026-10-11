import { useEffect, useState } from 'react';

import bunChaImage from '@/assets/auth/bun-cha-pho-hoi.webp';
import familyMealImage from '@/assets/auth/mam-com-nha.webp';
import phoImage from '@/assets/auth/pho-bep-nha.webp';
import { KitchenHomeLogo } from '@/components/brand/KitchenHomeLogo';
import { useI18n } from '@/features/i18n/I18nContext';

const slides = [
  {
    badge: 'Bữa cơm Việt',
    description: 'Gợi ý món ngon mỗi ngày, để căn bếp luôn ấm và bữa cơm luôn có điều để nhớ.',
    image: familyMealImage,
    title: 'Cùng Quyên, trọn vị cơm nhà',
  },
  {
    badge: 'Khám phá ba miền',
    description: 'Từ hương vị thân quen đến những món mới, Bếp Việt giúp bạn chọn đúng món hợp gu.',
    image: bunChaImage,
    title: 'Món Việt phong phú, cảm hứng mỗi ngày',
  },
  {
    badge: 'Căn bếp của bạn',
    description:
      'Lưu món yêu thích, lên kế hoạch nhẹ nhàng và dành nhiều thời gian hơn cho người thương.',
    image: phoImage,
    title: 'Nấu bằng yêu thương, ngon từ ký ức',
  },
] as const;

export function AuthCarousel() {
  const [activeSlide, setActiveSlide] = useState(0);
  const { t } = useI18n();
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return undefined;
    const interval = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 5500);
    return () => window.clearInterval(interval);
  }, [isPaused]);

  const showPrevious = () => {
    setActiveSlide((current) => (current - 1 + slides.length) % slides.length);
  };

  const showNext = () => {
    setActiveSlide((current) => (current + 1) % slides.length);
  };

  return (
    <section
      className="auth-story"
      aria-label={t('Câu chuyện Bếp Việt')}
      aria-roledescription="carousel"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="auth-carousel" aria-live="polite">
        {slides.map((slide, index) => (
          <article
            className={`auth-carousel__slide ${index === activeSlide ? 'is-active' : ''}`}
            aria-hidden={index !== activeSlide}
            key={slide.title}
          >
            <img
              alt=""
              className="auth-carousel__image"
              decoding="async"
              loading={index === 0 ? 'eager' : 'lazy'}
              src={slide.image}
            />
            <div className="auth-carousel__veil" />
            <div className="auth-carousel__content">
              <span className="auth-carousel__badge">{t(slide.badge)}</span>
              <h1>{t(slide.title)}</h1>
              <p>{t(slide.description)}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="auth-story__brand" aria-label="Bếp Việt">
        <KitchenHomeLogo />
      </div>

      <div className="auth-carousel__controls">
        <div className="auth-carousel__dots" aria-label={t('Chọn nội dung giới thiệu')}>
          {slides.map((slide, index) => (
            <button
              className={index === activeSlide ? 'is-active' : ''}
              aria-label={t('Xem nội dung {index}: {title}', {
                index: index + 1,
                title: t(slide.badge),
              })}
              aria-current={index === activeSlide ? 'true' : undefined}
              key={slide.badge}
              onClick={() => setActiveSlide(index)}
              type="button"
            />
          ))}
        </div>
        <div className="auth-carousel__arrows">
          <button aria-label={t('Nội dung trước')} onClick={showPrevious} type="button">
            <span aria-hidden="true">←</span>
          </button>
          <button aria-label={t('Nội dung tiếp theo')} onClick={showNext} type="button">
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
