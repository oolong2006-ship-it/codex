import { BRAND } from '@/lib/brand';

type Tone = 'oasis' | 'night' | 'white';
// oasis: primary navy tile · night: lifted tile for dark surfaces (kit's reverse logo) · white: white tile
const TONES: Record<Tone, { tile: string; stroke: string }> = {
  oasis: { tile: BRAND.night, stroke: BRAND.white },
  night: { tile: '#24405B', stroke: BRAND.white },
  white: { tile: BRAND.white, stroke: BRAND.night },
};

/** The Shuoon app icon (Brand Kit v1.0): three dots for people over a connected path linking people, processes and data. */
export function LogoMark({ size = 32, tone = 'oasis', className }: { size?: number; tone?: Tone; className?: string }) {
  const { tile, stroke } = TONES[tone];
  return (
    <svg viewBox="0 0 220 220" width={size} height={size} className={className} aria-hidden>
      <rect width="220" height="220" rx="52" fill={tile} />
      <circle cx="65" cy="71" r="13" fill={BRAND.saffron} />
      <circle cx="110" cy="71" r="13" fill={BRAND.saffron} />
      <circle cx="155" cy="71" r="13" fill={BRAND.saffron} />
      <path d="M46 120C61 151 85 152 110 120C134 152 159 151 174 120" fill="none" stroke={stroke} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M60 158C79 178 140 178 160 158" fill="none" stroke={stroke} strokeWidth="10" strokeLinecap="round" opacity=".94" />
    </svg>
  );
}
