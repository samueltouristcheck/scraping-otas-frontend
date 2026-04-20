import { apiFetch } from "@/api/client";

export type ScrapingTriggerResponse = {
  status: string;
  total_steps: number;
};

export type ScrapingStatusResponse = {
  status: string;
  percent: number;
  phase: string;
  detail: string;
  error: string | null;
  updated_at: string | null;
};

export async function postScrapingTrigger(token: string, signal?: AbortSignal): Promise<ScrapingTriggerResponse> {
  return apiFetch<ScrapingTriggerResponse>(
    "/scraping/trigger",
    {
      method: "POST",
      headers: { "X-Scraping-Token": token },
      signal,
    },
    "No se pudo encolar el scraping",
  );
}

export async function getScrapingStatus(token: string, signal?: AbortSignal): Promise<ScrapingStatusResponse> {
  return apiFetch<ScrapingStatusResponse>(
    "/scraping/status",
    {
      method: "GET",
      headers: { "X-Scraping-Token": token },
      signal,
    },
    "No se pudo leer el estado del scraping",
  );
}
