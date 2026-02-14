// src/lib/nav/polyline6.ts
// Minimal polyline6 decoder (Google encoded polyline, precision 1e6).
// Backend contract: geometry is Polyline6 string.

type LineString = {
  type: "LineString";
  coordinates: Array<[number, number]>;
};

export function decodePolyline6(polyline: string): Array<{ lat: number; lng: number }> {
  let index = 0;
  const len = polyline.length;
  let lat = 0;
  let lng = 0;
  const coordinates: Array<{ lat: number; lng: number }> = [];

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = polyline.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = polyline.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    coordinates.push({ lat: lat / 1e6, lng: lng / 1e6 });
  }

  return coordinates;
}

export function polyline6ToGeoJSONLine(polyline: string): LineString {
  const pts = decodePolyline6(polyline);
  return {
    type: "LineString",
    coordinates: pts.map((p) => [p.lng, p.lat]),
  };
}
