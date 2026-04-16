import type { TourResponse } from "@/types/market";

/** Tour mostrado por defecto al cargar la app si existe en la lista de la API. */
export const PREFERRED_DEFAULT_TOUR_CODE = "SAGRADA_REGULAR_LARGE";

export function pickDefaultTourCode(tours: TourResponse[]): string {
  if (tours.length === 0) return "";
  const preferred = tours.find((t) => t.internal_code === PREFERRED_DEFAULT_TOUR_CODE);
  return preferred?.internal_code ?? tours[0].internal_code;
}

/** Lista de tours con el preferido el primero (mismo orden relativo en el resto). */
export function sortToursWithPreferredFirst(tours: TourResponse[]): TourResponse[] {
  const preferred = tours.find((t) => t.internal_code === PREFERRED_DEFAULT_TOUR_CODE);
  if (!preferred) return [...tours];
  const rest = tours.filter((t) => t.internal_code !== PREFERRED_DEFAULT_TOUR_CODE);
  return [preferred, ...rest];
}
