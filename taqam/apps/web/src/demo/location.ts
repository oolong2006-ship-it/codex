/** Demo-only: let visitors far from the branches simulate being inside the branch geofence. */
const KEY = 'taqam.demo.simLocation';
const EVENT = 'taqam-demo-sim-location';

export function getSimulateLocation(): boolean {
  try { return window.localStorage.getItem(KEY) !== '0'; } catch { return true; }
}
export function setSimulateLocation(on: boolean) {
  try { window.localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT));
}
export function onSimulateLocationChange(fn: () => void) {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
