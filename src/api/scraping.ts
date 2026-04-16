import { apiFetch } from "@/api/client";

export type ScrapingTriggerResponse = {
  status: string;
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
