/** أدوات جغرافية نقية. الخادم يستخدم PostGIS للمسافة الموقّعة؛ هذه للحسابات بين نقطتين والاختبار. */
const EARTH_RADIUS_M = 6_371_008.8;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** المسافة الموقّعة لسياج دائري: distance(point, center) − radius (specs §B). */
export function circleSignedDistance(center: { lat: number; lng: number }, radiusM: number) {
  return (p: { lat: number; lng: number }) => haversineMeters(p.lat, p.lng, center.lat, center.lng) - radiusM;
}

export function isValidCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
}
