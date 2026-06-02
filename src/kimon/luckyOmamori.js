import kyuseiData from '../../data/kyusei_shoui.json';

const POOL_BY_PALACE = Object.fromEntries(
  kyuseiData.kyusei
    .filter((item) => item.palace_key && item.omamori?.length)
    .map((item) => [item.palace_key, item.omamori]),
);
const CLOSINGS = kyuseiData.closing_messages || [];

function hashStr(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Return one stable omamori message for the palace and displayed board slot.
 */
export function getOmamori(bestPalaceKey, seed) {
  const pool = POOL_BY_PALACE[bestPalaceKey];
  if (!pool?.length) return null;
  return pool[hashStr(`${bestPalaceKey}:${seed}`) % pool.length];
}

/**
 * Return one stable closing message for the displayed board slot.
 */
export function getClosing(seed) {
  if (!CLOSINGS.length) return null;
  return CLOSINGS[hashStr(`closing:${seed}`) % CLOSINGS.length];
}
