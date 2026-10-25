import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { DragonMascot, type DragonMood, type Viseme } from '@/components/assistant/DragonMascot';

const MOODS: DragonMood[] = [
  'idle',
  'happy',
  'thinking',
  'listening',
  'speaking',
  'waiting',
  'alarm',
  'celebrate',
  'confused',
];

function renderSvg(ui: ReactElement) {
  const { container } = render(ui);
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('Không render được thẻ svg');
  return svg;
}

afterEach(() => {
  cleanup();
});

describe('DragonMascot', () => {
  it.each(MOODS)('gắn class is-%s lên svg gốc', (mood) => {
    const svg = renderSvg(<DragonMascot mood={mood} />);
    expect(svg).toHaveClass('dragon-mascot', `is-${mood}`);
    for (const other of MOODS.filter((m) => m !== mood)) {
      expect(svg).not.toHaveClass(`is-${other}`);
    }
  });

  it('mặc định là mood idle, variant full, size 64', () => {
    const svg = renderSvg(<DragonMascot />);
    expect(svg).toHaveClass('is-idle', 'is-full');
    expect(svg.getAttribute('width')).toBe('64');
    expect(svg.getAttribute('height')).toBe(String(Math.round(64 * 1.1)));
  });

  it('variant full: viewBox cả người và chiều cao = round(size * 1.1)', () => {
    const svg = renderSvg(<DragonMascot size={45} variant="full" />);
    expect(svg).toHaveClass('is-full');
    expect(svg).not.toHaveClass('is-face');
    expect(svg.getAttribute('viewBox')).toBe('0 0 200 220');
    expect(svg.getAttribute('width')).toBe('45');
    expect(svg.getAttribute('height')).toBe(String(Math.round(45 * 1.1)));
  });

  it('variant face: viewBox chỉ phần mặt, khung vuông, không có thân', () => {
    const svg = renderSvg(<DragonMascot size={45} variant="face" />);
    expect(svg).toHaveClass('is-face');
    expect(svg).not.toHaveClass('is-full');
    expect(svg.getAttribute('viewBox')).toBe('20 -6 160 160');
    expect(svg.getAttribute('width')).toBe('45');
    expect(svg.getAttribute('height')).toBe('45');
    expect(svg.querySelector('.dragon-mascot__foot')).toBeNull();
    expect(svg.querySelector('.dragon-mascot__coat')).toBeNull();
    expect(svg.querySelector('.dragon-mascot__shadow')).toBeNull();
    // Phần đầu (và miệng) vẫn có ở bản face.
    expect(svg.querySelector('.dragon-mascot__head')).not.toBeNull();
    expect(svg.querySelector('.dragon-mascot__mouth-open')).not.toBeNull();
  });

  describe('prop talk (khẩu hình)', () => {
    it.each([
      [1.7, '1.00'],
      [-1, '0.00'],
      [0.456, '0.46'],
      [0, '0.00'],
      [1, '1.00'],
      [0.5, '0.50'],
    ])('talk=%s → is-lipsync và --dragon-talk="%s"', (talk, expected) => {
      const svg = renderSvg(<DragonMascot mood="speaking" talk={talk} />);
      expect(svg).toHaveClass('is-lipsync');
      expect(svg.style.getPropertyValue('--dragon-talk')).toBe(expected);
    });

    it('không truyền talk thì không có is-lipsync và không có biến style', () => {
      const svg = renderSvg(<DragonMascot mood="speaking" />);
      expect(svg).not.toHaveClass('is-lipsync');
      expect(svg.style.getPropertyValue('--dragon-talk')).toBe('');
      expect(svg.getAttribute('style')).toBeNull();
    });
  });

  describe('prop viseme (khẩu hình theo âm tiết)', () => {
    it.each<[Viseme, string]>([
      ['rest', '0.00'],
      ['mbp', '0.00'],
      ['small', '0.30'],
      ['wide', '0.45'],
      ['round', '0.55'],
      ['open', '0.95'],
    ])('viseme=%s → is-v-%s, độ mở mặc định %s', (viseme, expected) => {
      const svg = renderSvg(<DragonMascot mood="speaking" viseme={viseme} />);
      expect(svg).toHaveClass('is-lipsync', `is-v-${viseme}`);
      expect(svg.style.getPropertyValue('--dragon-talk')).toBe(expected);
    });

    it('openness ghi đè mức mặc định và bị kẹp 0..1; ưu tiên hơn talk', () => {
      expect(
        renderSvg(<DragonMascot openness={0.62} viseme="round" />).style.getPropertyValue(
          '--dragon-talk',
        ),
      ).toBe('0.62');
      cleanup();
      expect(
        renderSvg(<DragonMascot openness={3} talk={0.1} viseme="open" />).style.getPropertyValue(
          '--dragon-talk',
        ),
      ).toBe('1.00');
    });

    it('chỉ có talk (kiểu cũ) thì không gắn class is-v-*', () => {
      const svg = renderSvg(<DragonMascot talk={0.4} />);
      expect(svg.getAttribute('class')).not.toMatch(/is-v-/);
    });

    it('vẽ đủ bộ phận miệng: hàm dưới, răng, lưỡi, môi mím, má, nhóm gật đầu', () => {
      for (const variant of ['full', 'face'] as const) {
        const svg = renderSvg(<DragonMascot variant={variant} viseme="open" />);
        for (const part of [
          'jaw',
          'teeth',
          'tongue',
          'cavity',
          'lips-press',
          'mouth-closed',
          'cheeks',
          'head-talk',
        ]) {
          expect(svg.querySelectorAll(`.dragon-mascot__${part}`)).toHaveLength(1);
        }
        expect(
          svg.querySelector('.dragon-mascot__mouth-open .dragon-mascot__tongue'),
        ).not.toBeNull();
        expect(svg.querySelector('.dragon-mascot__head .dragon-mascot__head-talk')).not.toBeNull();
        cleanup();
      }
    });
  });

  it('bản full có nhóm miệng há và hai nhóm chân trái/phải', () => {
    const svg = renderSvg(<DragonMascot />);
    expect(svg.querySelectorAll('.dragon-mascot__mouth-open')).toHaveLength(1);
    expect(svg.querySelector('.dragon-mascot__mouth .dragon-mascot__mouth-open')).not.toBeNull();
    expect(svg.querySelectorAll('.dragon-mascot__foot--left')).toHaveLength(1);
    expect(svg.querySelectorAll('.dragon-mascot__foot--right')).toHaveLength(1);
    expect(svg.querySelectorAll('.dragon-mascot__foot')).toHaveLength(2);
  });

  describe('ký hiệu cảm xúc', () => {
    it('confused hiện dấu "?"', () => {
      const svg = renderSvg(<DragonMascot mood="confused" />);
      const emotes = svg.querySelectorAll('.dragon-mascot__emote');
      expect(emotes).toHaveLength(1);
      expect(emotes[0]?.tagName.toLowerCase()).toBe('text');
      expect(emotes[0]?.textContent).toBe('?');
    });

    it('alarm có nhóm dragon-mascot__emote--alarm', () => {
      const svg = renderSvg(<DragonMascot mood="alarm" />);
      const emotes = svg.querySelectorAll('.dragon-mascot__emote');
      expect(emotes).toHaveLength(1);
      expect(emotes[0]).toHaveClass('dragon-mascot__emote--alarm');
    });

    it('celebrate có nhóm dragon-mascot__emote--sparkle', () => {
      const svg = renderSvg(<DragonMascot mood="celebrate" />);
      const emotes = svg.querySelectorAll('.dragon-mascot__emote');
      expect(emotes).toHaveLength(1);
      expect(emotes[0]).toHaveClass('dragon-mascot__emote--sparkle');
    });

    it.each(MOODS.filter((m) => !['confused', 'alarm', 'celebrate'].includes(m)))(
      'mood %s không có emote',
      (mood) => {
        const svg = renderSvg(<DragonMascot mood={mood} />);
        expect(svg.querySelector('.dragon-mascot__emote')).toBeNull();
      },
    );

    it.each(['confused', 'alarm', 'celebrate'] as const)(
      'variant face với mood %s không có emote',
      (mood) => {
        const svg = renderSvg(<DragonMascot mood={mood} variant="face" />);
        expect(svg.querySelector('.dragon-mascot__emote')).toBeNull();
      },
    );
  });

  describe('trợ năng', () => {
    it('có title → role="img" và thẻ <title>', () => {
      const svg = renderSvg(<DragonMascot title="Chú Rồng đầu bếp" />);
      expect(svg.getAttribute('role')).toBe('img');
      expect(svg.getAttribute('aria-hidden')).toBeNull();
      expect(svg.querySelector('title')?.textContent).toBe('Chú Rồng đầu bếp');
    });

    it('không có title → aria-hidden="true", không role, không <title>', () => {
      const svg = renderSvg(<DragonMascot />);
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('role')).toBeNull();
      expect(svg.querySelector('title')).toBeNull();
    });
  });

  it('still → class is-still; mặc định không có', () => {
    expect(renderSvg(<DragonMascot still />)).toHaveClass('is-still');
    cleanup();
    expect(renderSvg(<DragonMascot />)).not.toHaveClass('is-still');
  });

  it('nối className bổ sung và không để khoảng trắng thừa', () => {
    const svg = renderSvg(<DragonMascot className="extra" mood="happy" />);
    expect(svg.getAttribute('class')).toBe('dragon-mascot is-happy is-full extra');
    cleanup();
    const plain = renderSvg(<DragonMascot mood="happy" />);
    expect(plain.getAttribute('class')).toBe('dragon-mascot is-happy is-full');
  });

  it('hai instance render cùng lúc không trùng id gradient/filter', () => {
    const { container } = render(
      <>
        <DragonMascot />
        <DragonMascot variant="face" />
      </>,
    );
    const svgs = Array.from(container.querySelectorAll('svg'));
    expect(svgs).toHaveLength(2);
    const [first, second] = svgs as [SVGSVGElement, SVGSVGElement];

    const allIds = Array.from(container.querySelectorAll('[id]'), (el) => el.id);
    expect(allIds.length).toBeGreaterThan(0);
    expect(new Set(allIds).size).toBe(allIds.length);

    const firstIds = new Set(Array.from(first.querySelectorAll('[id]'), (el) => el.id));
    for (const el of Array.from(second.querySelectorAll('[id]'))) {
      expect(firstIds.has(el.id)).toBe(false);
    }

    // id hợp lệ cho url(#...): không chứa dấu ":" (useId được làm sạch).
    for (const id of allIds) expect(id).not.toMatch(/:/);

    // Mọi tham chiếu url(#...) trong mỗi svg đều trỏ tới id thuộc chính svg đó.
    for (const svg of svgs) {
      const ownIds = new Set(Array.from(svg.querySelectorAll('[id]'), (el) => el.id));
      const refs = Array.from(svg.querySelectorAll('*')).flatMap((el) =>
        ['fill', 'stroke', 'filter']
          .map((attr) => el.getAttribute(attr))
          .filter((v): v is string => v?.startsWith('url(#') ?? false)
          .map((v) => v.slice(5, -1)),
      );
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) expect(ownIds.has(ref)).toBe(true);
    }
  });
});
