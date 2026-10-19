import { useId } from 'react';

export type DragonMood = 'idle' | 'happy' | 'thinking' | 'listening' | 'speaking';

interface DragonMascotProps {
  size?: number;
  mood?: DragonMood;
  /** "full": cả người cầm chảo; "face": chỉ phần mặt, dùng làm ảnh đại diện nhỏ. */
  variant?: 'full' | 'face';
/** Tắt animation của linh vật. */
  still?: boolean;
  className?: string;
  title?: string;
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
  title,
  variant = 'full',
}: DragonMascotProps) {
  const uid = useId().replace(/:/g, '');
  const id = (name: string) => `${name}-${uid}`;
  const url = (name: string) => `url(#${id(name)})`;
  const full = variant === 'full';
  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={`dragon-mascot is-${mood} is-${variant}${still ? ' is-still' : ''} ${className}`.trim()}
      height={full ? Math.round(size * 1.1) : size}
      role={title ? 'img' : undefined}
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
          <stop offset="0" stopColor="#d9feff" />
          <stop offset="0.45" stopColor="#3fd2e6" />
          <stop offset="1" stopColor="#0d6f8c" />
        </radialGradient>
        <radialGradient cx="0.5" cy="0.4" id={id('sclera')} r="0.7">
          <stop offset="0.7" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e8e2e6" />
        </radialGradient>
        <radialGradient cx="0.5" cy="0.5" id={id('gem')} r="0.5">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#9af6ff" />
          <stop offset="1" stopColor="#13a3c4" />
        </radialGradient>
        <linearGradient id={id('metal')} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#2b2f35" />
          <stop offset="0.45" stopColor="#5d636c" />
          <stop offset="1" stopColor="#24272c" />
        </linearGradient>
        <radialGradient cx="0.45" cy="0.4" id={id('panIn')} r="0.7">
          <stop offset="0" stopColor="#4a4f57" />
          <stop offset="1" stopColor="#1f2226" />
        </radialGradient>
        <linearGradient id={id('wood')} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#c98a4f" />
          <stop offset="1" stopColor="#7a4520" />
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

            {/* Chân */}
            <ellipse cx="82" cy="203" fill={url('skinDeep')} rx="14.5" ry="8" />
            <ellipse cx="118" cy="203" fill={url('skinDeep')} rx="14.5" ry="8" />
            <g fill="#fff3e2">
              <ellipse cx="73" cy="207" rx="2.4" ry="1.9" />
              <ellipse cx="81" cy="209" rx="2.4" ry="1.9" />
              <ellipse cx="89" cy="208" rx="2.4" ry="1.9" />
              <ellipse cx="111" cy="208" rx="2.4" ry="1.9" />
              <ellipse cx="119" cy="209" rx="2.4" ry="1.9" />
              <ellipse cx="127" cy="207" rx="2.4" ry="1.9" />
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

            {/* Tay cầm chảo + món đang tung */}
            <g className="dragon-mascot__pan">
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
              <path
                d="M157.5 123 L154 132"
                stroke="#3a3e44"
                strokeLinecap="round"
                strokeWidth="4.6"
              />
              <path
                d="M154.5 131 L149.5 147"
                stroke={url('wood')}
                strokeLinecap="round"
                strokeWidth="8"
              />
              <path
                d="M153 133 L150 143"
                opacity="0.5"
                stroke="#f2c18e"
                strokeLinecap="round"
                strokeWidth="1.6"
              />
              <path d="M156.4 119 C158.6 132 193.4 132 195.6 119 Z" fill={url('metal')} />
              <ellipse cx="176" cy="118" fill="#9aa1aa" rx="20" ry="8" />
              <ellipse cx="176" cy="118.6" fill={url('panIn')} rx="17.4" ry="6.3" />
              <path
                d="M159 115.5 C164 111.5 172 110.6 180 110.8"
                fill="none"
                opacity="0.7"
                stroke="#fff"
                strokeLinecap="round"
                strokeWidth="1.4"
              />
              {/* Món xào trong chảo: rau cải, tôm, ớt chuông, thịt */}
              <path
                d="M163 119 C165 114 171 113 173 116 C170 119 167 121 163 119 Z"
                fill="#4caf50"
              />
              <path
                d="M178 114 C182 111 188 113 189 117 C185 119 181 118 178 114 Z"
                fill="#66bb6a"
              />
              <path
                d="M170 117 C171 113 177 112 179 115"
                fill="none"
                stroke="#ff8a4c"
                strokeLinecap="round"
                strokeWidth="3.4"
              />
              <ellipse
                cx="183"
                cy="120.5"
                fill="#e53b2e"
                rx="3.4"
                ry="1.8"
                transform="rotate(-18 183 120.5)"
              />
              <ellipse cx="174" cy="121" fill="#a0522d" rx="3.6" ry="2" />
              <ellipse cx="166.5" cy="122" fill="#f6c45a" rx="2.4" ry="1.4" />
              <ellipse cx="176" cy="116.5" fill="#fff" opacity="0.5" rx="1.4" ry="0.6" />
              {/* Bàn tay nắm cán */}
              <circle cx="149" cy="146" fill={url('skin')} r="8.6" />
              <path
                d="M143.5 141.5 C147 140 151 141 153 143 M142.5 146 C146 144.6 150 145.4 152.6 147.6"
                fill="none"
                stroke="#9b2a1b"
                strokeLinecap="round"
                strokeWidth="1.3"
              />
              {/* Tôm, lá rau, lát ớt đang bay khỏi chảo */}
              <g className="dragon-mascot__toss">
                <path
                  d="M163 99 C163 92 171 89 175 94 C178 98 175 103 171 101"
                  fill="none"
                  stroke="#ff8a4c"
                  strokeLinecap="round"
                  strokeWidth="4.6"
                />
                <path d="M171 101 l-3 4 4 -1 z" fill="#ff8a4c" />
                <path d="M184 92 C188 84 196 84 197 86 C196 92 190 96 184 92 Z" fill="#5cb85c" />
                <path d="M184 92 L195 87" stroke="#3d8b3d" strokeWidth="0.9" />
                <circle cx="191" cy="104" fill="none" r="3.2" stroke="#e53b2e" strokeWidth="2.2" />
              </g>
              <g
                className="dragon-mascot__steam"
                fill="none"
                stroke="#fff"
                strokeLinecap="round"
                strokeWidth="2"
              >
                <path d="M170 108 C167 104 172 101 169 96" />
                <path d="M182 107 C179 103 184 100 181 95" />
              </g>
            </g>
          </>
        ) : null}

        {/* Đầu */}
        <g className="dragon-mascot__head">
          <path d={FIN} fill={url('fin')} />
          <path d={mirror(FIN)} fill={url('fin')} />
          <path d={FIN_RIB} fill="none" opacity="0.5" stroke="#c96a2a" strokeWidth="1" />
          <path d={mirror(FIN_RIB)} fill="none" opacity="0.5" stroke="#c96a2a" strokeWidth="1" />
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

          <ellipse cx="100" cy="88" fill={url('skin')} rx="47" ry="41" />
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

          {/* Má hồng phúng phính */}
          <ellipse cx="64" cy="109" fill="#ff6f86" opacity="0.5" rx="8.6" ry="5.2" />
          <ellipse cx="136" cy="109" fill="#ff6f86" opacity="0.5" rx="8.6" ry="5.2" />
          <circle cx="61" cy="107" fill="#fff" opacity="0.7" r="1.3" />
          <circle cx="133" cy="107" fill="#fff" opacity="0.7" r="1.3" />

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

          {/* Mõm nhỏ, miệng cười xinh */}
          <ellipse cx="100" cy="114" fill={url('snout')} rx="17" ry="10" />
          <ellipse cx="96" cy="108.6" fill="#fff" opacity="0.4" rx="6.5" ry="2.3" />
          <ellipse cx="95" cy="111" fill="#8f2516" rx="1.4" ry="1.1" />
          <ellipse cx="105" cy="111" fill="#8f2516" rx="1.4" ry="1.1" />
          <g className="dragon-mascot__mouth">
            <path d="M93 116.4 Q100 124.6 107 116.4 Q100 118.6 93 116.4 Z" fill="#6e1a12" />
            <path d="M96.6 120 Q100 123.2 103.4 120 Q100 121 96.6 120 Z" fill="#ff8f8f" />
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

          {/* Mũ đầu bếp với lõi AI trên vành mũ */}
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
              d="M73 51 v11 M83 53 v12 M93 54 v12 M107 54 v12 M117 53 v12 M127 51 v11"
              stroke="#e2d9d0"
              strokeWidth="1.2"
            />
            <circle cx="100" cy="59" fill="none" r="5.8" stroke={url('gold')} strokeWidth="1.6" />
            <circle
              className="dragon-mascot__gem"
              cx="100"
              cy="59"
              fill={url('gem')}
              filter={url('glow')}
              r="4.1"
            />
          </g>
        </g>
      </g>
    </svg>
  );
}
