import { useId, type CSSProperties } from 'react';

import { VISEME_OPENNESS, type Viseme } from '@/components/assistant/lipSync';

export type { Viseme };

export type DragonMood =
  | 'idle'
  | 'happy'
  | 'thinking'
  | 'listening'
  | 'speaking'
  | 'waiting'
  | 'alarm'
  | 'celebrate'
  | 'confused';

interface DragonMascotProps {
  size?: number;
  mood?: DragonMood;
  /** "full": cả người cầm chảo; "face": chỉ phần mặt, dùng làm ảnh đại diện nhỏ. */
  variant?: 'full' | 'face';
  /** Tắt chuyển động. */
  still?: boolean;
  className?: string;
  title?: string;
  /**
   * Độ mở miệng 0–1 theo từng tiếng đang đọc (khẩu hình khớp lời nói). Bỏ trống thì miệng tự
   * mấp máy khi `mood="speaking"`.
   */
  talk?: number;
  /**
   * Khẩu hình theo âm tiết (từ `useLipSync`): đổi dáng môi tròn/bè/mím, hàm dưới hạ theo
   * `openness`. Ưu tiên hơn `talk`.
   */
  viseme?: Viseme;
  /** Độ mở miệng 0–1 đi kèm `viseme`; bỏ trống thì lấy mức mặc định của khẩu hình. */
  openness?: number;
}

const VIEWBOX = { full: '0 0 200 220', face: '20 -6 160 160' } as const;

/** Lật đối xứng một path qua trục dọc giữa hình (x = 100). */
const mirror = (path: string) =>
  path.replace(
    /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g,
    (_, x: string, y: string) => `${200 - Number(x)} ${y}`,
  );

const HORN = 'M66 66 C57 65 48 60 44 51 C42 47 46 45 49 48 C54 54 61 57 70 58 Z';
const HORN_SHINE = 'M47.5 50 C52 55 58 58 64 60';
const FIN =
  'M60 82 C51 74 40 71 31 75 C29 76 29 79 31 80 C35 83 35 86 33 89 C32 91 34 92 36 92 C43 91 50 94 58 100 Z';
const FIN_RIB = 'M37 88 C43 88 49 91 55 96';
const WING =
  'M74 150 L72 140 C60 130 40 122 26 126 C20 128 20 134 25 136 C23 145 32 150 39 143 C37 155 46 160 52 153 C51 165 59 170 64 165 Z';
const WING_BONE = 'M72 140 C60 130 40 122 26 126';
const WING_VEINS = 'M64 141 C56 140 46 140 39 143 M66 146 C61 148 56 150 52 153';
const WING_SHINE = 'M31 131 C41 128 52 131 60 137';
const WHISKER = 'M84 113 C78 111 72 111 69 114 C67 117 70 119 72 117';
const COAT =
  'M70 124 C61 131 58 150 59 174 L60 192 C70 198 84 199 100 199 C116 199 130 198 140 192 L141 174 C142 150 139 131 130 124 C120 131 80 131 70 124 Z';

export function DragonMascot({
  className = '',
  mood = 'idle',
  size = 64,
  still = false,
  talk,
  title,
  variant = 'full',
  viseme,
  openness,
}: DragonMascotProps) {
  const uid = useId().replace(/:/g, '');
  const id = (name: string) => `${name}-${uid}`;
  const url = (name: string) => `url(#${id(name)})`;
  const full = variant === 'full';
  // Độ mở miệng: viseme (kèm openness) ưu tiên, rồi tới talk kiểu cũ.
  const open = viseme === undefined ? talk : (openness ?? talk ?? VISEME_OPENNESS[viseme]);
  const lipClass =
    (open === undefined ? '' : ' is-lipsync') + (viseme === undefined ? '' : ` is-v-${viseme}`);
  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={`dragon-mascot is-${mood} is-${variant}${still ? ' is-still' : ''}${lipClass} ${className}`.trim()}
      height={full ? Math.round(size * 1.1) : size}
      role={title ? 'img' : undefined}
      style={
        open === undefined
          ? undefined
          : ({ '--dragon-talk': Math.max(0, Math.min(1, open)).toFixed(2) } as CSSProperties)
      }
      viewBox={VIEWBOX[variant]}
      width={size}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient cx="0.34" cy="0.28" id={id('skin')} r="0.85">
          <stop offset="0" stopColor="#ff9479" />
          <stop offset="0.42" stopColor="#e4563f" />
          <stop offset="0.78" stopColor="#b9321f" />
          <stop offset="1" stopColor="#8a2214" />
        </radialGradient>
        <linearGradient id={id('skinDeep')} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ec6249" />
          <stop offset="1" stopColor="#a1291a" />
        </linearGradient>
        <radialGradient cx="0.42" cy="0.3" id={id('snout')} r="0.8">
          <stop offset="0" stopColor="#ffc2a6" />
          <stop offset="1" stopColor="#ee8566" />
        </radialGradient>
        <linearGradient id={id('gold')} x1="0" x2="0.4" y1="0" y2="1">
          <stop offset="0" stopColor="#fff2bd" />
          <stop offset="0.45" stopColor="#f6c45a" />
          <stop offset="1" stopColor="#cf8420" />
        </linearGradient>
        <linearGradient id={id('fin')} x1="1" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffc985" />
          <stop offset="1" stopColor="#e5803a" />
        </linearGradient>
        <radialGradient cx="0.5" cy="0.42" id={id('wing')} r="0.72">
          <stop offset="0" stopColor="#ffdcc9" />
          <stop offset="0.6" stopColor="#ffa286" />
          <stop offset="1" stopColor="#ea654c" />
        </radialGradient>
        <linearGradient id={id('coat')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#f6f2ee" />
          <stop offset="1" stopColor="#e2d9d0" />
        </linearGradient>
        <radialGradient cx="0.4" cy="0.35" id={id('coatShade')} r="0.75">
          <stop offset="0.55" stopColor="#7a5a48" stopOpacity="0" />
          <stop offset="1" stopColor="#7a5a48" stopOpacity="0.28" />
        </radialGradient>
        <radialGradient cx="0.35" cy="0.3" id={id('hat')} r="0.85">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.7" stopColor="#f5f1ed" />
          <stop offset="1" stopColor="#dcd3ca" />
        </radialGradient>
        <linearGradient id={id('scarf')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ef5a45" />
          <stop offset="1" stopColor="#a8291c" />
        </linearGradient>
        <radialGradient cx="0.38" cy="0.32" id={id('iris')} r="0.75">
          <stop offset="0" stopColor="#f4ffd1" />
          <stop offset="0.42" stopColor="#55d0a1" />
          <stop offset="0.78" stopColor="#16876e" />
          <stop offset="1" stopColor="#075746" />
        </radialGradient>
        <radialGradient cx="0.5" cy="0.4" id={id('sclera')} r="0.7">
          <stop offset="0.7" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e8e2e6" />
        </radialGradient>
        <radialGradient cx="0.5" cy="0.5" id={id('gem')} r="0.5">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.34" stopColor="#c9ffe4" />
          <stop offset="0.72" stopColor="#39c98d" />
          <stop offset="1" stopColor="#08775c" />
        </radialGradient>
        <linearGradient id={id('wood')} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#efbd72" />
          <stop offset="0.38" stopColor="#c88945" />
          <stop offset="0.74" stopColor="#a4622e" />
          <stop offset="1" stopColor="#70401f" />
        </linearGradient>
        <radialGradient cx="0.45" cy="0.4" id={id('yolk')} r="0.6">
          <stop offset="0" stopColor="#ffeaa0" />
          <stop offset="1" stopColor="#f39c12" />
        </radialGradient>
        <filter height="140%" id={id('lift')} width="140%" x="-20%" y="-15%">
          <feDropShadow dx="0" dy="3" floodColor="#5c2a1c" floodOpacity="0.28" stdDeviation="3" />
        </filter>
        <filter height="300%" id={id('glow')} width="300%" x="-100%" y="-100%">
          <feGaussianBlur result="blur" stdDeviation="2.4" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {full ? (
        <ellipse
          className="dragon-mascot__shadow"
          cx="100"
          cy="211"
          fill="#5c2a1c"
          rx="42"
          ry="5"
        />
      ) : null}

      {full && mood === 'confused' ? (
        <text
          className="dragon-mascot__emote"
          fill="#b8402f"
          fontSize="30"
          fontWeight="800"
          x="150"
          y="44"
        >
          ?
        </text>
      ) : null}
      {full && mood === 'alarm' ? (
        <g className="dragon-mascot__emote dragon-mascot__emote--alarm" fill="#e0402c">
          <path d="M152 18 l6 -2 -2 24 -6 1 z" />
          <circle cx="152" cy="48" r="3.4" />
          <path d="M40 30 l5 3 -9 16 -4 -3 z" />
        </g>
      ) : null}
      {full && mood === 'celebrate' ? (
        <g className="dragon-mascot__emote dragon-mascot__emote--sparkle" fill="#f6c45a">
          <path d="M34 40 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" />
          <path d="M162 30 l2.4 6 6 2.4 -6 2.4 -2.4 6 -2.4 -6 -6 -2.4 6 -2.4 z" />
          <path d="M170 96 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" />
        </g>
      ) : null}
      <g className="dragon-mascot__float" filter={full ? url('lift') : undefined}>
        {full ? (
          <>
            {(['left', 'right'] as const).map((side) => {
              const d = (path: string) => (side === 'left' ? path : mirror(path));
              // Tách nhóm để animation cánh không ghi đè góc xoay.
              return (
                <g
                  key={side}
                  transform={side === 'left' ? 'rotate(-14 70 142)' : 'rotate(14 130 142)'}
                >
                  <g className={`dragon-mascot__wing dragon-mascot__wing--${side}`}>
                    <path
                      d={d(WING)}
                      fill={url('wing')}
                      stroke="#c94a33"
                      strokeLinejoin="round"
                      strokeWidth="1.3"
                    />
                    <path
                      d={d(WING_VEINS)}
                      fill="none"
                      opacity="0.5"
                      stroke="#d4553c"
                      strokeLinecap="round"
                      strokeWidth="1.1"
                    />
                    <path
                      d={d(WING_SHINE)}
                      fill="none"
                      opacity="0.6"
                      stroke="#fff"
                      strokeLinecap="round"
                      strokeWidth="1.8"
                    />
                    <path
                      d={d(WING_BONE)}
                      fill="none"
                      stroke={url('gold')}
                      strokeLinecap="round"
                      strokeWidth="3.4"
                    />
                    <circle
                      cx={side === 'left' ? 22.5 : 177.5}
                      cy="130"
                      fill={url('gold')}
                      r="2.8"
                    />
                  </g>
                </g>
              );
            })}

            {/* Đuôi cuộn phía sau, gai vàng */}
            <g className="dragon-mascot__tail">
              <path
                d="M136 190 C152 200 174 199 183 187 C189 178 184 170 177 174"
                fill="none"
                stroke={url('skinDeep')}
                strokeLinecap="round"
                strokeWidth="13"
              />
              <path
                d="M138 192 C153 201 173 200 182 189"
                fill="none"
                opacity="0.35"
                stroke="#ffb59c"
                strokeLinecap="round"
                strokeWidth="3"
              />
              <path d="M146 189 l4 -8 4 8 z M160 191 l5 -8 3 9 z" fill={url('gold')} />
              <path d="M174 176 L186 162 L189 179 Z" fill={url('gold')} />
            </g>

            {/* Chân: tách trái/phải để nhịp chân khi chờ, nhún khi chuông kêu, nhảy khi xong */}
            <g className="dragon-mascot__foot dragon-mascot__foot--left">
              <ellipse cx="82" cy="203" fill={url('skinDeep')} rx="14.5" ry="8" />
              <g fill="#fff3e2">
                <ellipse cx="73" cy="207" rx="2.4" ry="1.9" />
                <ellipse cx="81" cy="209" rx="2.4" ry="1.9" />
                <ellipse cx="89" cy="208" rx="2.4" ry="1.9" />
              </g>
            </g>
            <g className="dragon-mascot__foot dragon-mascot__foot--right">
              <ellipse cx="118" cy="203" fill={url('skinDeep')} rx="14.5" ry="8" />
              <g fill="#fff3e2">
                <ellipse cx="111" cy="208" rx="2.4" ry="1.9" />
                <ellipse cx="119" cy="209" rx="2.4" ry="1.9" />
                <ellipse cx="127" cy="207" rx="2.4" ry="1.9" />
              </g>
            </g>

            {/* Áo đầu bếp dáng thon */}
            <g className="dragon-mascot__coat">
              <path d={COAT} fill={url('coat')} stroke="#d6ccc2" strokeWidth="1.2" />
              <path d={COAT} fill={url('coatShade')} />
              <path
                d="M105 131 C108 150 108 176 106 198"
                fill="none"
                stroke="#d3c8bd"
                strokeWidth="1.6"
              />
              <path
                d="M107 132 C110 151 110 176 108 197"
                fill="none"
                opacity="0.8"
                stroke="#fff"
                strokeWidth="1"
              />
              <path
                d="M65 168 C69 175 69 184 66 193 M135 166 C131 174 131 184 134 193 M88 189 C93 192 102 192 106 189"
                fill="none"
                stroke="#e0d6cc"
                strokeLinecap="round"
                strokeWidth="1.4"
              />
              {[146, 161, 176].map((y) => (
                <g key={y}>
                  <circle
                    cx="94"
                    cy={y}
                    fill={url('gold')}
                    r="3.2"
                    stroke="#b9781c"
                    strokeWidth="0.6"
                  />
                  <circle
                    cx="118"
                    cy={y}
                    fill={url('gold')}
                    r="3.2"
                    stroke="#b9781c"
                    strokeWidth="0.6"
                  />
                  <circle cx="93" cy={y - 1.1} fill="#fff" opacity="0.8" r="1" />
                  <circle cx="117" cy={y - 1.1} fill="#fff" opacity="0.8" r="1" />
                </g>
              ))}
              {/* Huy hiệu Bếp Việt */}
              <circle
                cx="75"
                cy="150"
                fill="#fff6ea"
                r="7.6"
                stroke={url('gold')}
                strokeWidth="1.8"
              />
              <text
                fill="#a43d2d"
                fontFamily="Georgia, 'Times New Roman', serif"
                fontSize="7"
                fontWeight="700"
                textAnchor="middle"
                x="75"
                y="152.5"
              >
                BV
              </text>
            </g>

            {/* Khăn quàng đỏ */}
            <path
              d="M74 121 C86 130 114 130 126 121 L125 128 C113 137 87 137 75 128 Z"
              fill={url('scarf')}
            />
            <path d="M96 133 L87 151 L98 147 Z M104 133 L113 151 L102 147 Z" fill={url('scarf')} />
            <path d="M87 151 L98 147 M113 151 L102 147" stroke="#8a2015" strokeWidth="0.8" />
            <ellipse cx="100" cy="132" fill="#d8402f" rx="6.5" ry="5.2" />
            <ellipse cx="98.4" cy="130.4" fill="#ff8f7c" opacity="0.6" rx="2.4" ry="1.4" />

            {/* Tay vẫy chào */}
            <g className="dragon-mascot__arm-wave">
              <path
                d="M72 136 C60 138 49 133 42 120"
                fill="none"
                stroke="#d8cec4"
                strokeLinecap="round"
                strokeWidth="18"
              />
              <path
                d="M72 136 C60 138 49 133 42 120"
                fill="none"
                stroke={url('coat')}
                strokeLinecap="round"
                strokeWidth="15.5"
              />
              <path
                d="M45 125 L38 115"
                stroke={url('scarf')}
                strokeLinecap="round"
                strokeWidth="15"
              />
              <circle cx="36" cy="108" fill={url('skin')} r="8.5" />
              <g fill={url('skinDeep')}>
                <ellipse cx="29" cy="101" rx="2.8" ry="4.4" transform="rotate(-28 29 101)" />
                <ellipse cx="35" cy="98.4" rx="2.8" ry="4.6" />
                <ellipse cx="41" cy="100" rx="2.8" ry="4.4" transform="rotate(24 41 100)" />
              </g>
              <ellipse cx="33.5" cy="105.5" fill="#ffb9a3" opacity="0.55" rx="3" ry="2" />
            </g>

            {/* Tay cầm sạn gỗ */}
            <g className="dragon-mascot__arm-tool">
              <path
                d="M130 136 C141 142 146 146 149 146"
                fill="none"
                stroke="#d8cec4"
                strokeLinecap="round"
                strokeWidth="18"
              />
              <path
                d="M130 136 C141 142 146 146 149 146"
                fill="none"
                stroke={url('coat')}
                strokeLinecap="round"
                strokeWidth="15.5"
              />
              <path
                d="M141 141 L146 145"
                stroke={url('scarf')}
                strokeLinecap="round"
                strokeWidth="15"
              />
              <g className="dragon-mascot__spatula" filter={url('lift')}>
                <path
                  d="M149 146 C156 139 162 132 169 121"
                  fill="none"
                  stroke="#663615"
                  strokeLinecap="round"
                  strokeWidth="10"
                />
                <path
                  d="M149 145 C156 138 162 131 169 120"
                  fill="none"
                  opacity="0.84"
                  stroke={url('wood')}
                  strokeLinecap="round"
                  strokeWidth="7"
                />
                <path
                  d="M150 143 C156 137 162 130 168 121"
                  fill="none"
                  opacity="0.88"
                  stroke="#ffe0a1"
                  strokeLinecap="round"
                  strokeWidth="1.4"
                />
                {/* Đầu sạn bẹt, bo tròn và có khe thoát dầu như sạn gỗ chiên xào. */}
                <path
                  d="M160 124 C155 121 154 116 157 109 L172 78 C176 69 183 64 190 67 L193 69 C199 72 200 79 197 87 L184 119 C181 127 175 131 168 128 Z"
                  fill={url('wood')}
                  stroke="#663615"
                  strokeLinejoin="round"
                  strokeWidth="2.2"
                />
                <path
                  d="M161 119 C168 105 174 91 180 76 M170 125 C177 110 184 94 190 78 M178 123 C184 108 190 94 195 82"
                  fill="none"
                  opacity="0.62"
                  stroke="#f6d49e"
                  strokeLinecap="round"
                  strokeWidth="1.35"
                />
                {/* Ba khe xẻ dọc trên mặt sạn. */}
                <path
                  d="M163 113 C169 100 175 87 180 76 M169 116 C175 103 181 89 186 74 M175 117 C181 104 187 91 192 78"
                  fill="none"
                  stroke="#70401f"
                  strokeLinecap="round"
                  strokeWidth="2.4"
                />
                <path
                  d="M164 112 C170 99 175 87 180 77 M170 115 C176 102 181 89 186 75 M176 116 C182 103 187 91 192 79"
                  fill="none"
                  opacity="0.68"
                  stroke="#ffe0a1"
                  strokeLinecap="round"
                  strokeWidth="0.75"
                />
                <path
                  d="M177 72 C181 68 186 67 190 69"
                  fill="none"
                  opacity="0.8"
                  stroke="#fff0c8"
                  strokeLinecap="round"
                  strokeWidth="1.6"
                />
                <circle cx="154" cy="139" fill="#70421f" r="1.5" />
                <circle cx="153.5" cy="138.5" fill="#f7d99e" r="0.65" />
              </g>

              {/* Bàn tay nắm cán */}
              <circle cx="149" cy="146" fill={url('skin')} r="8.6" />
              <path
                d="M143.5 141.5 C147 140 151 141 153 143 M142.5 146 C146 144.6 150 145.4 152.6 147.6 M145 150 C147.5 148.8 150.5 149.4 152 151"
                fill="none"
                stroke="#9b2a1b"
                strokeLinecap="round"
                strokeWidth="1.3"
              />
            </g>
          </>
        ) : null}

        {/* Đầu */}
        <g className="dragon-mascot__head">
          {/* Nhóm gật nhẹ theo từng tiếng nói (tách khỏi animation lắc đầu của mood). */}
          <g className="dragon-mascot__head-talk">
            <path d={FIN} fill={url('fin')} />
            <path d={mirror(FIN)} fill={url('fin')} />
            <path d={FIN_RIB} fill="none" opacity="0.5" stroke="#c96a2a" strokeWidth="1" />
            <path d={mirror(FIN_RIB)} fill="none" opacity="0.5" stroke="#c96a2a" strokeWidth="1" />
            <path
              d="M38 78 Q47 79 55 88 M35 84 Q44 84 51 92"
              fill="none"
              opacity="0.6"
              stroke="#ffe0b3"
              strokeLinecap="round"
              strokeWidth="1.1"
            />
            <path
              d={mirror('M38 78 Q47 79 55 88 M35 84 Q44 84 51 92')}
              fill="none"
              opacity="0.6"
              stroke="#ffe0b3"
              strokeLinecap="round"
              strokeWidth="1.1"
            />
            <path d={HORN} fill={url('gold')} />
            <path d={mirror(HORN)} fill={url('gold')} />
            {[HORN_SHINE, mirror(HORN_SHINE)].map((d) => (
              <path
                d={d}
                fill="none"
                key={d}
                opacity="0.7"
                stroke="#fff6d6"
                strokeLinecap="round"
                strokeWidth="1.3"
              />
            ))}

            <ellipse cx="100" cy="89" fill="#702015" opacity="0.22" rx="45" ry="38" />
            <ellipse cx="100" cy="87" fill={url('skin')} rx="47" ry="41" />
            {/* Bóng mũ đổ xuống trán, viền sáng phải, điểm sáng trái tạo khối */}
            <ellipse cx="100" cy="60" fill="#6e1a10" opacity="0.28" rx="34" ry="6.5" />
            <path
              d="M137 70 C146 83 146 102 132 116"
              fill="none"
              opacity="0.45"
              stroke="#ffd4c4"
              strokeLinecap="round"
              strokeWidth="2.2"
            />
            <ellipse
              cx="72"
              cy="73"
              fill="#fff"
              opacity="0.3"
              rx="11"
              ry="6"
              transform="rotate(-28 72 73)"
            />
            <circle cx="63" cy="83" fill="#fff" opacity="0.4" r="1.8" />
            <g className="dragon-mascot__forehead-mark" filter={url('glow')}>
              <path d="M100 69 C96 73 96 76 100 79 C104 76 104 73 100 69 Z" fill={url('gold')} />
              <path d="M99 77 C94 72 91 74 93 78 C95 81 98 80 100 78 Z" fill={url('gold')} />
              <path d="M101 77 C106 72 109 74 107 78 C105 81 102 80 100 78 Z" fill={url('gold')} />
              <path
                d="M95 80 Q100 83 105 80"
                fill="none"
                stroke="#fff0c2"
                strokeLinecap="round"
                strokeWidth="1.2"
              />
            </g>

            {/* Má hồng phúng phính: nhích theo hàm khi nói, nhô lên khi cười bè miệng */}
            <g className="dragon-mascot__cheeks">
              <ellipse cx="64" cy="109" fill="#ff6f86" opacity="0.5" rx="8.6" ry="5.2" />
              <ellipse cx="136" cy="109" fill="#ff6f86" opacity="0.5" rx="8.6" ry="5.2" />
              <circle cx="61" cy="107" fill="#fff" opacity="0.7" r="1.3" />
              <circle cx="133" cy="107" fill="#fff" opacity="0.7" r="1.3" />
            </g>
            <g fill="#ffd0b4" opacity="0.78">
              <path d="M58 98 Q61 94 64 98 Q61 101 58 98 Z" />
              <path d="M62 94 Q65 90 68 94 Q65 97 62 94 Z" />
              <path d="M142 98 Q139 94 136 98 Q139 101 142 98 Z" />
              <path d="M138 94 Q135 90 132 94 Q135 97 138 94 Z" />
            </g>

            {/* Lông mày nhỏ, mắt to tròn long lanh kiểu em bé */}
            <path
              className="dragon-mascot__brow"
              d="M74 71 Q80 67.5 86 70.5 M114 70.5 Q120 67.5 126 71"
              fill="none"
              opacity="0.7"
              stroke="#7d1e12"
              strokeLinecap="round"
              strokeWidth="2.2"
            />
            <g className="dragon-mascot__eyes">
              <ellipse
                cx="80"
                cy="92"
                fill={url('sclera')}
                rx="13"
                ry="14.5"
                stroke="#7a1d12"
                strokeOpacity="0.25"
              />
              <ellipse
                cx="120"
                cy="92"
                fill={url('sclera')}
                rx="13"
                ry="14.5"
                stroke="#7a1d12"
                strokeOpacity="0.25"
              />
              <g className="dragon-mascot__pupils">
                <circle cx="81" cy="94" fill={url('iris')} r="10.6" />
                <circle cx="119" cy="94" fill={url('iris')} r="10.6" />
                <circle cx="81" cy="95" fill="#0b2233" r="6.2" />
                <circle cx="119" cy="95" fill="#0b2233" r="6.2" />
                <circle cx="85.4" cy="88.6" fill="#fff" r="3.9" />
                <circle cx="123.4" cy="88.6" fill="#fff" r="3.9" />
                <circle cx="77" cy="99" fill="#fff" opacity="0.85" r="1.7" />
                <circle cx="115" cy="99" fill="#fff" opacity="0.85" r="1.7" />
                <circle cx="86.4" cy="98" fill="#fff" opacity="0.55" r="1" />
                <circle cx="124.4" cy="98" fill="#fff" opacity="0.55" r="1" />
              </g>
              <path
                d="M67.3 89 Q80 67 92.7 89 M107.3 89 Q120 67 132.7 89 M68 85.6 L63.6 83 M132 85.6 L136.4 83"
                fill="none"
                opacity="0.85"
                stroke="#5c1a10"
                strokeLinecap="round"
                strokeWidth="2.2"
              />
            </g>

            {/* Mõm nhỏ, miệng cười xinh; cằm (hàm dưới) hạ xuống khi há miệng */}
            <ellipse
              className="dragon-mascot__jaw"
              cx="100"
              cy="119.5"
              fill={url('snout')}
              rx="12.5"
              ry="5"
            />
            <ellipse cx="100" cy="114" fill={url('snout')} rx="17" ry="10" />
            <ellipse cx="96" cy="108.6" fill="#fff" opacity="0.4" rx="6.5" ry="2.3" />
            <path
              d="M88 115 Q100 109 112 115"
              fill="none"
              opacity="0.28"
              stroke="#fff"
              strokeLinecap="round"
              strokeWidth="1.2"
            />
            <ellipse cx="95" cy="111" fill="#8f2516" rx="1.4" ry="1.1" />
            <ellipse cx="105" cy="111" fill="#8f2516" rx="1.4" ry="1.1" />
            <g className="dragon-mascot__mouth">
              {/* Miệng khép: nét cười; mờ dần khi há */}
              <g className="dragon-mascot__mouth-closed">
                <path d="M93 116.4 Q100 124.6 107 116.4 Q100 118.6 93 116.4 Z" fill="#6e1a12" />
                <path d="M96.6 120 Q100 123.2 103.4 120 Q100 121 96.6 120 Z" fill="#ff8f8f" />
              </g>
              {/* Môi mím (m/b/p): hai môi ép lại, hơi phồng */}
              <path
                className="dragon-mascot__lips-press"
                d="M93.4 116.8 Q100 119.4 106.6 116.8"
                fill="none"
                stroke="#8f2516"
                strokeLinecap="round"
                strokeWidth="2.2"
              />
              {/* Khoang miệng: giãn dọc theo độ mở, ngang theo khẩu hình (--dragon-talk) */}
              <g className="dragon-mascot__mouth-open">
                <path
                  className="dragon-mascot__cavity"
                  d="M92.6 116.4 Q100 115.4 107.4 116.4 C107.4 122.6 104.4 127 100 127 C95.6 127 92.6 122.6 92.6 116.4 Z"
                  fill="#5a120c"
                  stroke="#a3301f"
                  strokeLinejoin="round"
                  strokeWidth="1.1"
                />
                <ellipse cx="100" cy="117.6" fill="#3a0a06" opacity="0.6" rx="5.6" ry="1.6" />
                <ellipse
                  className="dragon-mascot__tongue"
                  cx="100"
                  cy="124.2"
                  fill="#ff8f8f"
                  rx="4.6"
                  ry="2.6"
                />
                <ellipse cx="98.6" cy="123.4" fill="#ffc4c4" opacity="0.7" rx="1.4" ry="0.7" />
              </g>
              {/* Răng trên: hiện khi há đủ rộng, không bị bóp dẹt theo độ mở */}
              <path
                className="dragon-mascot__teeth"
                d="M94.6 116.5 Q100 115.9 105.4 116.5 L104.8 118.3 L103.6 117.3 L102.4 118.4 L101.2 117.4 L100 118.5 L98.8 117.4 L97.6 118.4 L96.4 117.3 L95.2 118.3 Z"
                fill="#fffdf6"
              />
            </g>
            {/* Râu rồng cuộn ngắn */}
            <g className="dragon-mascot__whisker dragon-mascot__whisker--left">
              <path
                d={WHISKER}
                fill="none"
                stroke={url('gold')}
                strokeLinecap="round"
                strokeWidth="2"
              />
            </g>
            <g className="dragon-mascot__whisker dragon-mascot__whisker--right">
              <path
                d={mirror(WHISKER)}
                fill="none"
                stroke={url('gold')}
                strokeLinecap="round"
                strokeWidth="2"
              />
            </g>

            {/* Mũ đầu bếp và huy hiệu ngọc lục bảo */}
            <g className="dragon-mascot__hat">
              <path
                d="M62 52 C49 50 45 31 58 25 C58 11 76 5 86 13 C92 1 112 1 118 13 C128 5 146 11 144 27 C157 33 152 52 138 52 Z"
                fill={url('hat')}
                stroke="#ddd4cb"
                strokeWidth="1.2"
              />
              <path
                d="M86 15 C83 28 85 40 90 50 M118 15 C121 29 117 41 112 50 M58 27 C64 33 66 42 66 50 M144 29 C138 35 136 43 135 50"
                fill="none"
                stroke="#e4ddd5"
                strokeLinecap="round"
                strokeWidth="1.6"
              />
              <ellipse
                cx="80"
                cy="24"
                fill="#fff"
                opacity="0.95"
                rx="11"
                ry="6.4"
                transform="rotate(-12 80 24)"
              />
              <ellipse cx="110" cy="16" fill="#fff" opacity="0.8" rx="7" ry="3.6" />
              <path
                d="M63 46 C84 54 116 54 137 46 L137 60 C116 67 84 67 63 60 Z"
                fill={url('coat')}
                stroke="#d8cec4"
                strokeWidth="1.2"
              />
              <path
                d="M66 48 C85 55 115 55 134 48"
                fill="none"
                opacity="0.88"
                stroke={url('gold')}
                strokeLinecap="round"
                strokeWidth="1.5"
              />
              <path
                d="M73 51 v11 M83 53 v12 M93 54 v12 M107 54 v12 M117 53 v12 M127 51 v11"
                stroke="#e2d9d0"
                strokeWidth="1.2"
              />
              <circle
                cx="100"
                cy="59"
                fill="#fffaf0"
                r="6.4"
                stroke={url('gold')}
                strokeWidth="1.8"
              />
              <circle
                className="dragon-mascot__gem"
                cx="100"
                cy="59"
                fill={url('gem')}
                filter={url('glow')}
                r="4.4"
              />
              <path d="M98 58 L100 55.7 L102 58 L100 61.6 Z" fill="#ecfff5" opacity="0.76" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
