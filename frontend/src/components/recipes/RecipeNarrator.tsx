import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { AppIcon } from '@/components/common/AppIcon';
import { useI18n } from '@/features/i18n/I18nContext';
import { NARRATION_RATES } from '@/features/narration/narrationController';
import {
  narrationSectionLabels,
  type NarrationSection,
  type NarrationSegment,
} from '@/features/narration/recipeScript';
import type { Narration } from '@/features/narration/useNarration';

type Props = { narration: Narration; segments: NarrationSegment[] };

/** Nút nghe và thanh điều khiển thuyết minh công thức. */
export function RecipeNarrator({ narration, segments }: Props) {
  const { formatNumber, t } = useI18n();
  const { controller, current, missingVoices, state } = narration;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const lastVolume = useRef(state.volume || 1);
  const isOpen = open || state.status !== 'idle';

  const sections = useMemo(() => {
    const starts = new Map<NarrationSection, number>();
    segments.forEach((segment, index) => {
      if (!starts.has(segment.section)) starts.set(segment.section, index);
    });
    return [...starts];
  }, [segments]);

  // Cuộn tới đoạn đang đọc.
  const anchor = current?.anchor;
  const playing = state.status === 'playing';
  useEffect(() => {
    if (!anchor || !playing) return;
    const element = document.querySelector<HTMLElement>(`[data-narration="${anchor}"]`);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const visibleTop = 80; // chừa chỗ cho header dính đầu trang
    const visibleBottom = window.innerHeight - (barRef.current?.offsetHeight ?? 0);
    if (rect.top >= visibleTop && rect.bottom <= visibleBottom) return;
    // Căn trong vùng phía trên thanh phát.
    const offset =
      rect.top - visibleTop - Math.max(0, (visibleBottom - visibleTop - rect.height) / 2);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo?.({
      top: window.scrollY + offset,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [anchor, playing]);

  // Chừa chỗ ở cuối trang để thanh điều khiển không che nội dung.
  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('has-narrator');
    return () => document.body.classList.remove('has-narrator');
  }, [isOpen]);

  if (!controller) {
    return (
      <button
        className="button button--outline"
        disabled
        title={t('Trình duyệt này chưa hỗ trợ đọc thành tiếng.')}
        type="button"
      >
        <AppIcon name="headphones" size={18} /> {t('Nghe hướng dẫn')}
      </button>
    );
  }

  const togglePlayback = () => {
    if (state.status === 'playing') controller.pause();
    else if (state.status === 'paused') controller.resume();
    else controller.play(0);
  };

  const close = () => {
    controller.stop();
    setOpen(false);
    triggerRef.current?.focus();
  };

  const setVolume = (volume: number, apply = true) => {
    if (volume > 0) lastVolume.current = volume;
    controller.setVolume(volume, apply);
  };

  const formatRate = (rate: number) => `${formatNumber(rate, { maximumFractionDigits: 2 })}x`;
  const progress = segments.length ? ((state.index + 1) / segments.length) * 100 : 0;
  const playLabel =
    state.status === 'playing'
      ? t('Tạm dừng')
      : state.status === 'paused'
        ? t('Nghe tiếp')
        : t('Nghe hướng dẫn');

  return (
    <>
      <button
        aria-expanded={isOpen}
        className="button button--outline"
        onClick={() => {
          setOpen(true);
          togglePlayback();
        }}
        ref={triggerRef}
        type="button"
      >
        <AppIcon name={state.status === 'playing' ? 'pause' : 'headphones'} size={18} /> {playLabel}
      </button>
      {isOpen
        ? createPortal(
            <section aria-label={t('Trình phát thuyết minh')} className="narrator-bar" ref={barRef}>
              <div className="narrator-bar__inner">
                <div className="narrator-bar__head">
                  <span className="narrator-bar__badge">
                    <AppIcon name="headphones" size={16} />
                    {current
                      ? t(narrationSectionLabels[current.section])
                      : t('Thuyết minh công thức')}
                  </span>
                  <span className="narrator-bar__count">
                    {state.status === 'idle' ? segments.length : state.index + 1}/{segments.length}
                  </span>
                  <button
                    aria-label={t('Đóng trình phát')}
                    className="narrator-bar__icon"
                    onClick={close}
                    type="button"
                  >
                    <AppIcon name="close" size={18} />
                  </button>
                </div>
                <div aria-hidden="true" className="narrator-bar__progress">
                  <span style={{ width: `${state.status === 'idle' ? 0 : progress}%` }} />
                </div>
                <p className="narrator-bar__text">
                  {current?.text ??
                    t('Bấm phát để nghe giới thiệu, nguyên liệu, các bước nấu và mẹo của món.')}
                </p>
                {state.error ? (
                  <p className="narrator-bar__note" role="alert">
                    {t('Không phát được âm thanh. Hãy kiểm tra loa rồi bấm phát lại.')}
                  </p>
                ) : missingVoices.length ? (
                  <p className="narrator-bar__note">
                    {missingVoices.includes('vi-VN')
                      ? t(
                          'Thiết bị chưa có giọng đọc tiếng Việt nên phát âm có thể chưa chuẩn. Bạn có thể cài thêm giọng tiếng Việt trong cài đặt ngôn ngữ của máy.',
                        )
                      : t(
                          'Thiết bị chưa có giọng đọc tiếng Anh nên phát âm có thể chưa chuẩn. Bạn có thể cài thêm giọng tiếng Anh trong cài đặt ngôn ngữ của máy.',
                        )}
                  </p>
                ) : null}
                <nav aria-label={t('Chọn phần muốn nghe')} className="narrator-bar__sections">
                  {sections.map(([section, start]) => (
                    <button
                      aria-current={current?.section === section ? 'step' : undefined}
                      key={section}
                      onClick={() => controller.play(start)}
                      type="button"
                    >
                      {t(narrationSectionLabels[section])}
                    </button>
                  ))}
                </nav>
                <div className="narrator-bar__controls">
                  <div className="narrator-bar__transport">
                    <button
                      aria-label={t('Đoạn trước')}
                      className="narrator-bar__icon"
                      disabled={state.index === 0}
                      onClick={() => controller.previous()}
                      type="button"
                    >
                      <AppIcon name="skipBack" size={18} />
                    </button>
                    <button
                      aria-label={playLabel}
                      className="narrator-bar__play"
                      onClick={togglePlayback}
                      type="button"
                    >
                      <AppIcon name={state.status === 'playing' ? 'pause' : 'play'} size={22} />
                    </button>
                    <button
                      aria-label={t('Dừng lại')}
                      className="narrator-bar__icon"
                      disabled={state.status === 'idle'}
                      onClick={() => controller.stop()}
                      type="button"
                    >
                      <AppIcon name="stop" size={18} />
                    </button>
                    <button
                      aria-label={t('Đoạn tiếp theo')}
                      className="narrator-bar__icon"
                      disabled={state.index >= segments.length - 1}
                      onClick={() => controller.next()}
                      type="button"
                    >
                      <AppIcon name="skipForward" size={18} />
                    </button>
                  </div>
                  <div aria-label={t('Tốc độ đọc')} className="narrator-bar__rates" role="group">
                    {NARRATION_RATES.map((rate) => (
                      <button
                        aria-pressed={state.rate === rate}
                        key={rate}
                        onClick={() => controller.setRate(rate)}
                        type="button"
                      >
                        {formatRate(rate)}
                      </button>
                    ))}
                  </div>
                  <div className="narrator-bar__volume">
                    <button
                      aria-label={state.volume === 0 ? t('Bật tiếng') : t('Tắt tiếng')}
                      className="narrator-bar__icon"
                      onClick={() => setVolume(state.volume === 0 ? lastVolume.current : 0)}
                      type="button"
                    >
                      <AppIcon name={state.volume === 0 ? 'volumeOff' : 'volume'} size={18} />
                    </button>
                    <input
                      aria-label={t('Âm lượng')}
                      aria-valuetext={`${Math.round(state.volume * 100)}%`}
                      max={100}
                      min={0}
                      onChange={(event) => setVolume(Number(event.target.value) / 100, false)}
                      onKeyUp={() => controller.applySettings()}
                      onPointerUp={() => controller.applySettings()}
                      step={5}
                      type="range"
                      value={Math.round(state.volume * 100)}
                    />
                    <span>{Math.round(state.volume * 100)}%</span>
                  </div>
                </div>
              </div>
            </section>,
            document.body,
          )
        : null}
    </>
  );
}
