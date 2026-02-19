export type LatLng = {
  lat: number;
  lng: number;
};

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Calculates great-circle distance between two points
 * using the Haversine formula.
 *
 * @returns distance in kilometers
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371; // Earth's radius in km

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));

  return R * c;
}
