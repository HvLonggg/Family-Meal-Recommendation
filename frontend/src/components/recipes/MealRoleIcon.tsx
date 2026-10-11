import { useId } from 'react';

import type { MealRole } from '@/data/randomMeals';

export function MealRoleIcon({ role }: { role: MealRole }) {
  const id = useId();
  const warm = `url(#${id}-warm)`;
  const green = `url(#${id}-green)`;
  const cream = `url(#${id}-cream)`;

  return (
    <svg aria-hidden="true" className="meal-role-icon" fill="none" viewBox="0 0 72 72">
      <defs>
        <linearGradient
          id={`${id}-warm`}
          x1="16"
          y1="18"
          x2="54"
          y2="60"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F2B96E" />
          <stop offset="1" stopColor="#BD5E38" />
        </linearGradient>
        <linearGradient
          id={`${id}-green`}
          x1="20"
          y1="14"
          x2="52"
          y2="57"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#A7C96C" />
          <stop offset="1" stopColor="#48754B" />
        </linearGradient>
        <linearGradient
          id={`${id}-cream`}
          x1="20"
          y1="18"
          x2="48"
          y2="62"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E9DCC5" />
        </linearGradient>
      </defs>
      <ellipse cx="36" cy="61" rx="23" ry="4" fill="#583724" opacity=".12" />
      {role === 'main' && (
        <>
          <ellipse
            cx="36"
            cy="39"
            rx="29"
            ry="22"
            fill={cream}
            stroke="#D9C7AA"
            strokeWidth="1.5"
          />
          <ellipse cx="36" cy="39" rx="23" ry="16" fill="#F7EDDB" stroke="#E4D2B5" />
          <path
            d="M19 39c8-14 26-16 34-1-7 14-25 15-34 1Z"
            fill={warm}
            stroke="#A9643B"
            strokeWidth="1.5"
          />
          <path d="m20 39-9-7v14l9-7Z" fill="#CA8651" />
          <path
            d="m29 30 4 16m5-19 4 17"
            stroke="#FFF1CB"
            strokeLinecap="round"
            strokeWidth="2.5"
          />
          <circle cx="47" cy="36" r="1.8" fill="#663D2D" />
          <path d="M47 52c-2-6 1-10 9-10-1 7-4 10-9 10Z" fill={green} />
          <path d="m48 52 6-8" stroke="#436C43" strokeLinecap="round" />
        </>
      )}
      {role === 'soup' && (
        <>
          <path
            d="M25 10c-7 7 7 9 0 16m11-19c-7 7 7 9 0 16m11-13c-7 7 7 9 0 16"
            stroke="#B4A393"
            strokeLinecap="round"
            strokeWidth="2.5"
          />
          <path
            d="M10 34c2 18 11 26 26 26s24-8 26-26"
            fill={cream}
            stroke="#D7C5AA"
            strokeWidth="1.5"
          />
          <ellipse
            cx="36"
            cy="34"
            rx="26"
            ry="10"
            fill="#F8D38C"
            stroke="#E9BD73"
            strokeWidth="2"
          />
          <ellipse cx="36" cy="34" rx="21" ry="6" fill="#EAB965" />
          <path
            d="m25 31 7 3-4 4m14-8 7 3-5 4"
            stroke="#FFF5CC"
            strokeLinecap="round"
            strokeWidth="4"
          />
          <path
            d="m20 34 5 1m13-4 4 2m7 3 5-1"
            stroke="#618A4E"
            strokeLinecap="round"
            strokeWidth="3"
          />
          <path d="M25 58h22" stroke="#CBB697" strokeLinecap="round" strokeWidth="3" />
        </>
      )}
      {role === 'vegetable' && (
        <>
          <path
            d="M34 55C12 52 8 31 17 20c16-2 25 16 17 35Z"
            fill={green}
            stroke="#608349"
            strokeWidth="1.5"
          />
          <path
            d="M37 54C26 35 33 12 49 10c14 10 12 35-12 44Z"
            fill={green}
            stroke="#608349"
            strokeWidth="1.5"
          />
          <path
            d="M39 54c-1-19 12-29 24-24 4 15-8 27-24 24Z"
            fill="#A5C66C"
            stroke="#608349"
            strokeWidth="1.5"
          />
          <path
            d="m20 28 17 33m11-41L37 61m18-24L37 61m-13-22 8 1m10-6 8-3m-7 14 9-2"
            stroke="#E0EDB4"
            strokeLinecap="round"
            strokeWidth="2"
          />
          <path d="M32 60h11" stroke="#597D40" strokeLinecap="round" strokeWidth="3" />
        </>
      )}
      {role === 'vegetarian' && (
        <>
          <path
            d="M12 39c4 16 12 23 24 23s20-7 24-23"
            fill={cream}
            stroke="#D6C5AA"
            strokeWidth="1.5"
          />
          <ellipse cx="36" cy="39" rx="24" ry="8" fill="#E8D9B8" />
          <path
            d="m18 33 12-3 4 11-13 3-3-11Zm22-1 12 2-2 11-12-3 2-10Z"
            fill="#FFF6D7"
            stroke="#D5BC83"
            strokeWidth="1.5"
          />
          <path
            d="M35 37V20m0 8c-12-1-17-8-14-15 10 0 16 7 14 15Zm1-5c-1-10 6-16 16-14 0 10-6 16-16 14Z"
            fill={green}
            stroke="#608349"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </>
      )}
      {role === 'side' && (
        <>
          <path d="m50 28 13-13" stroke="#856654" strokeLinecap="round" strokeWidth="8" />
          <path d="m54 24 9-9" stroke="#B69A7F" strokeLinecap="round" strokeWidth="3" />
          <ellipse
            cx="31"
            cy="40"
            rx="24"
            ry="21"
            fill="#6E7972"
            stroke="#4B5B54"
            strokeWidth="2"
          />
          <ellipse cx="31" cy="40" rx="20" ry="17" fill="#87958B" />
          <path
            d="M18 33c2-8 10-11 16-6 10-2 17 9 11 15 3 10-10 15-16 10-10 3-17-9-11-19Z"
            fill={cream}
          />
          <circle cx="31" cy="39" r="8" fill="#F2BD50" stroke="#E3A335" strokeWidth="1.5" />
          <path d="M28 35a5 5 0 0 1 5-1" stroke="#FFE59A" strokeLinecap="round" strokeWidth="2" />
          <path d="m16 45 3 1m19-17 2 2" stroke="#699461" strokeLinecap="round" strokeWidth="2" />
        </>
      )}
      {role === 'dessert' && (
        <>
          <path d="M10 28h52a26 26 0 0 1-52 0Z" fill={green} stroke="#527D4D" strokeWidth="1.5" />
          <path d="M14 28h44a22 22 0 0 1-44 0Z" fill="#E7ECAE" />
          <path d="M18 28h36a18 18 0 0 1-36 0Z" fill="#E97865" />
          <path
            d="m25 34 1 3m10-4v4m10-3-1 3m-10 6v3"
            stroke="#764639"
            strokeLinecap="round"
            strokeWidth="2.5"
          />
          <path d="M42 21c1-8 7-11 15-8-3 7-8 10-15 8Z" fill={green} />
          <circle cx="20" cy="19" r="8" fill="#F4BE61" stroke="#E2A449" strokeWidth="1.5" />
          <path d="M17 16a4 4 0 0 1 5 0" stroke="#FFE0A0" strokeLinecap="round" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}
