// src/lib/types/geo.ts

export type NavCoord = {
  lat: number;
  lng: number;
};

export type BBox4 = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export type GeoJSON = Record<string, any>;
