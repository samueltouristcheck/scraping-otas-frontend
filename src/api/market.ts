import { apiFetch } from "@/api/client";
import type {
  AvailabilityDayDetailResponse,
  AvailabilityHeatmapResponse,
  LatestAvailabilityResponse,
  LatestPricesResponse,
  PriceTimeseriesResponse,
  SourceResponse,
  TourResponse,
  ViatorTourCard,
} from "@/types/market";

export interface SnapshotQueryParams {
  tourCode: string;
  horizonDays?: number;
  rangeDays?: number;
  otaName?: string;
  limit?: number;
  signal?: AbortSignal;
}

export interface PriceTimeseriesQueryParams extends SnapshotQueryParams {
  fromDate?: string;
  toDate?: string;
}

export interface AvailabilityHeatmapQueryParams {
  tourCode: string;
  otaName?: string;
  rangeDays?: number;
  fromDate?: string;
  toDate?: string;
  signal?: AbortSignal;
}

export interface AvailabilityDayDetailQueryParams {
  tourCode: string;
  targetDate: string;
  otaName?: string;
  signal?: AbortSignal;
}

export async function getTours(signal?: AbortSignal): Promise<TourResponse[]> {
  return apiFetch<TourResponse[]>("/tours", { signal }, "Error al cargar tours");
}

export async function getSources(tourCode: string, signal?: AbortSignal): Promise<SourceResponse[]> {
  const params = new URLSearchParams({ tour_code: tourCode });

  return apiFetch<SourceResponse[]>(
    `/sources?${params.toString()}`,
    { signal },
    "Error al cargar fuentes OTA",
  );
}

export async function getLatestPrices({
  tourCode,
  horizonDays,
  rangeDays,
  otaName,
  limit,
  signal,
}: SnapshotQueryParams): Promise<LatestPricesResponse> {
  const params = new URLSearchParams({ tour_code: tourCode });

  if (rangeDays !== undefined) {
    params.set("range_days", String(rangeDays));
  } else if (horizonDays !== undefined) {
    params.set("horizon_days", String(horizonDays));
  }
  if (otaName !== undefined) params.set("ota_name", otaName);
  if (limit !== undefined) params.set("limit", String(limit));

  return apiFetch<LatestPricesResponse>(
    `/prices/latest?${params.toString()}`,
    { signal },
    "Error al cargar precios",
  );
}

export async function getLatestAvailability({
  tourCode,
  horizonDays,
  rangeDays,
  otaName,
  limit,
  signal,
}: SnapshotQueryParams): Promise<LatestAvailabilityResponse> {
  const params = new URLSearchParams({ tour_code: tourCode });

  if (rangeDays !== undefined) {
    params.set("range_days", String(rangeDays));
  } else if (horizonDays !== undefined) {
    params.set("horizon_days", String(horizonDays));
  }
  if (otaName !== undefined) params.set("ota_name", otaName);
  if (limit !== undefined) params.set("limit", String(limit));

  return apiFetch<LatestAvailabilityResponse>(
    `/availability/latest?${params.toString()}`,
    { signal },
    "Error al cargar disponibilidad",
  );
}

export async function getPriceTimeseries({
  tourCode,
  horizonDays,
  fromDate,
  toDate,
  limit,
  signal,
}: PriceTimeseriesQueryParams): Promise<PriceTimeseriesResponse> {
  const params = new URLSearchParams({ tour_code: tourCode });

  if (horizonDays !== undefined) params.set("horizon_days", String(horizonDays));
  if (fromDate !== undefined) params.set("from_date", fromDate);
  if (toDate !== undefined) params.set("to_date", toDate);
  if (limit !== undefined) params.set("limit", String(limit));

  return apiFetch<PriceTimeseriesResponse>(
    `/prices/timeseries?${params.toString()}`,
    { signal },
    "Error al cargar serie de precios",
  );
}

export async function getAvailabilityHeatmap({
  tourCode,
  otaName,
  rangeDays,
  fromDate,
  toDate,
  signal,
}: AvailabilityHeatmapQueryParams): Promise<AvailabilityHeatmapResponse> {
  const params = new URLSearchParams({ tour_code: tourCode });

  if (otaName !== undefined) params.set("ota_name", otaName);
  if (rangeDays !== undefined) params.set("range_days", String(rangeDays));
  if (fromDate !== undefined) params.set("from_date", fromDate);
  if (toDate !== undefined) params.set("to_date", toDate);

  return apiFetch<AvailabilityHeatmapResponse>(
    `/availability/heatmap?${params.toString()}`,
    { signal },
    "Error al cargar mapa de disponibilidad",
  );
}

export async function getAvailabilityDayDetail({
  tourCode,
  targetDate,
  otaName,
  signal,
}: AvailabilityDayDetailQueryParams): Promise<AvailabilityDayDetailResponse> {
  const params = new URLSearchParams({
    tour_code: tourCode,
    target_date: targetDate,
  });

  if (otaName !== undefined) params.set("ota_name", otaName);

  return apiFetch<AvailabilityDayDetailResponse>(
    `/availability/day-detail?${params.toString()}`,
    { signal },
    "Error al cargar detalle del día",
  );
}

/**
 * Fetches the Viator listing snapshot produced by `scraping/viator/listing_scraper.py`.
 * Served by the thin endpoint `GET /viator/listing` (api/routers/viator_static.py).
 */
export async function getViatorListing(signal?: AbortSignal): Promise<ViatorTourCard[]> {
  return apiFetch<ViatorTourCard[]>("/viator/listing", { signal }, "Error al cargar listado Viator");
}
