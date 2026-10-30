import { SVGProps } from 'react';

export type IconName =
  | 'dashboard'
  | 'crowd'
  | 'queue'
  | 'alert'
  | 'incident'
  | 'simulation'
  | 'logout'
  | 'check'
  | 'shield'
  | 'clock'
  | 'trendUp'
  | 'trendDown'
  | 'dot'
  | 'gauge'
  | 'bolt'
  | 'map'
  | 'arrowLeft'
  | 'menu'
  | 'sun'
  | 'moon'
  | 'globe';

const PATHS: Record<IconName, JSX.Element> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.6" />
      <rect x="14" y="3" width="7" height="5" rx="1.6" />
      <rect x="14" y="11" width="7" height="10" rx="1.6" />
      <rect x="3" y="15" width="7" height="6" rx="1.6" />
    </>
  ),
  crowd: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.2" />
      <path d="M4 19c0-3 2.4-5 5-5s5 2 5 5" />
      <path d="M15 19c0-2 1.4-3.4 3-3.4" />
    </>
  ),
  queue: <path d="M6 4h12M8 4v5l4 3-4 3v5M16 4v5l-4 3 4 3v5" />,
  alert: (
    <>
      <path d="M12 3.5 21 19H3z" />
      <path d="M12 10v4M12 17v.5" />
    </>
  ),
  incident: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M12 9v4M12 16v.3" />
    </>
  ),
  simulation: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2" />
    </>
  ),
  logout: <path d="M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5M14 5h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3" />,
  check: <path d="M4 12.5 9 17.5 20 6.5" />,
  shield: <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  trendUp: <path d="M4 16l5-5 3.5 3.5L20 7m0 0h-5m5 0v5" />,
  trendDown: <path d="M4 8l5 5 3.5-3.5L20 17m0 0h-5m5 0v-5" />,
  dot: <circle cx="12" cy="12" r="5" />,
  gauge: (
    <>
      <path d="M4 16a8 8 0 1 1 16 0" />
      <path d="M12 16l4-5" />
    </>
  ),
  bolt: <path d="M13 3 5 13h6l-1 8 8-10h-6z" />,
  map: (
    <>
      <path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  arrowLeft: <path d="M15 5l-7 7 7 7" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.5 2.5 14.5 0 17M12 3.5c-2.5 2.5-2.5 14.5 0 17" />
    </>
  ),
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
