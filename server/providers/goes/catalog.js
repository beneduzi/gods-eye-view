export const GOES_SATELLITES = Object.freeze([
  Object.freeze({ id: 'GOES-19', starCode: 'GOES19', role: 'east', lon0: -75.2 }),
  Object.freeze({ id: 'GOES-18', starCode: 'GOES18', role: 'west', lon0: -137.0 }),
]);
export const GOES_STAR_PRODUCT = 'GEOCOLOR';

/** Return the current STAR CDN image URL for a satellite. */
export function starImageUrl(satellite, { size = 1808, product = GOES_STAR_PRODUCT } = {}) {
  return `https://cdn.star.nesdis.noaa.gov/${satellite.starCode}/ABI/FD/${product}/${size}x${size}.jpg`;
}
