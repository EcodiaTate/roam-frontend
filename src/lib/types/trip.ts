// src/lib/types/trip.ts

export type TripStopType = "start" | "poi" | "via" | "end";

export type TripStop = {
  id?: string | null;
  type?: TripStopType; // backend default "poi"
  name?: string | null;
  lat: number;
  lng: number;
};
