/**
 * Generates a deterministic color based on a numerical ID.
 * Uses the Golden Ratio conjugate to ensure a good distribution of hues.
 */
export const getNodeColor = (id: number): string => {
  const goldenRatioConjugate = 0.618033988749895;
  const hue = ((id * goldenRatioConjugate) % 1) * 360;
  return `hsl(${Math.floor(hue)}, 70%, 50%)`;
};

/**
 * Gets the representative color for a route (based on the smallest node ID).
 */
export const getRouteColor = (customerIds: number[]): string => {
  if (!customerIds.length) return "hsl(0, 70%, 50%)";
  const representativeId = Math.min(...customerIds);
  return getNodeColor(representativeId);
};
