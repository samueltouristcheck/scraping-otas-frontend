import { useEffect, useMemo, useState } from "react";

import type { AvailabilityPointResponse, PricePointResponse, SourceResponse } from "@/types/market";
import { formatCurrency, parseDecimalToNumber } from "@/utils/number";

export function truncateWords(text: string, maxChars: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function buildSnapshotKey(params: {
  targetDate: string;
  optionName: string | null;
  slotTime: string | null;
  otaName: string | null;
  otaSourceId?: string | null;
}): string {
  return [
    params.targetDate,
    params.optionName ?? "",
    params.slotTime ?? "",
    params.otaName ?? "",
    params.otaSourceId ?? "",
  ].join("|");
}

function getPriceValue(item: PricePointResponse): number | null {
  return parseDecimalToNumber(item.final_price ?? item.list_price);
}

export type ProductOptionRow = {
  groupKey: string;
  otaSourceId: string;
  otaName: string | null;
  optionName: string | null;
  detailTourName: string | null;
  /** URL pública del tour (p. ej. GYG), si viene en el scrape. */
  detailPageUrl: string | null;
  languageCode: string | null;
  slotTime: string | null;
  avgPrice: number | null;
  currencyCode: string;
  daysCovered: number;
  availabilityRate: number | null;
  popularityCountYesterday: number | null;
  orderedPrices: Array<{ targetDate: string; value: number }>;
  priceTooltip: string;
};

export function useProductOptionsTable(
  filteredLatestPrices: PricePointResponse[],
  filteredLatestAvailability: AvailabilityPointResponse[],
  sources: SourceResponse[] | undefined,
  selectedTourCode: string | null,
) {
  const [expandedPriceRows, setExpandedPriceRows] = useState<string[]>([]);
  const [showAllTours, setShowAllTours] = useState(false);
  const [tourSearchTerm, setTourSearchTerm] = useState("");

  useEffect(() => {
    setExpandedPriceRows([]);
    setShowAllTours(false);
    setTourSearchTerm("");
  }, [selectedTourCode]);

  const groupedPriceRows = useMemo((): ProductOptionRow[] => {
    const availabilityByKey = new Map(
      filteredLatestAvailability.map((item) => [
        buildSnapshotKey({
          targetDate: item.target_date,
          optionName: item.option_name,
          slotTime: item.slot_time,
          otaName: item.ota_name,
          otaSourceId: item.ota_source_id,
        }),
        item,
      ]),
    );

    const grouped = new Map<
      string,
      {
        groupKey: string;
        otaSourceId: string;
        otaName: string | null;
        optionName: string | null;
        detailTourName: string | null;
        languageCode: string | null;
        slotTime: string | null;
        currencyCode: string;
        detailPageUrl: string | null;
        prices: Array<{ targetDate: string; value: number }>;
        availabilityItems: AvailabilityPointResponse[];
        popularityCountYesterday: number | null;
      }
    >();

    [...filteredLatestPrices]
      .sort((a, b) => {
        const priceA = getPriceValue(a);
        const priceB = getPriceValue(b);

        if (priceA !== null && priceB !== null && priceA !== priceB) {
          return priceA - priceB;
        }

        if (a.target_date !== b.target_date) {
          return a.target_date.localeCompare(b.target_date);
        }

        return (a.option_name ?? "").localeCompare(b.option_name ?? "");
      })
      .forEach((priceItem) => {
        const groupKey = [
          priceItem.ota_source_id,
          (priceItem.detail_tour_name ?? "").trim(),
          priceItem.option_name ?? "",
          priceItem.slot_time ?? "",
          priceItem.language_code ?? "",
        ].join("|");

        const group = grouped.get(groupKey) ?? {
          groupKey,
          otaSourceId: priceItem.ota_source_id,
          otaName: priceItem.ota_name,
          optionName: priceItem.option_name,
          detailTourName: priceItem.detail_tour_name ?? null,
          languageCode: priceItem.language_code ?? null,
          slotTime: priceItem.slot_time ?? null,
          currencyCode: priceItem.currency_code,
          detailPageUrl: priceItem.detail_page_url ?? null,
          prices: [],
          availabilityItems: [],
          popularityCountYesterday: null,
        };

        if (priceItem.detail_page_url && !group.detailPageUrl) {
          group.detailPageUrl = priceItem.detail_page_url;
        }

        const numericPrice = getPriceValue(priceItem);
        if (numericPrice !== null) {
          group.prices.push({ targetDate: priceItem.target_date, value: numericPrice });
        }

        const key = buildSnapshotKey({
          targetDate: priceItem.target_date,
          optionName: priceItem.option_name,
          slotTime: priceItem.slot_time,
          otaName: priceItem.ota_name,
          otaSourceId: priceItem.ota_source_id,
        });

        const availability = availabilityByKey.get(key);
        if (availability) {
          group.availabilityItems.push(availability);
        }

        if (typeof priceItem.popularity_count_yesterday === "number") {
          group.popularityCountYesterday =
            group.popularityCountYesterday === null
              ? priceItem.popularity_count_yesterday
              : Math.max(group.popularityCountYesterday, priceItem.popularity_count_yesterday);
        }

        grouped.set(groupKey, group);
      });

    return [...grouped.values()]
      .map((group) => {
        const avgPrice =
          group.prices.length > 0
            ? group.prices.reduce((acc, item) => acc + item.value, 0) / group.prices.length
            : null;

        const availabilityRate =
          group.availabilityItems.length > 0
            ? group.availabilityItems.filter((item) => item.is_available).length / group.availabilityItems.length
            : null;

        const orderedPrices = [...group.prices].sort((a, b) => a.targetDate.localeCompare(b.targetDate));

        return {
          groupKey: group.groupKey,
          otaSourceId: group.otaSourceId,
          otaName: group.otaName,
          optionName: group.optionName,
          detailTourName: group.detailTourName,
          detailPageUrl: group.detailPageUrl,
          languageCode: group.languageCode,
          slotTime: group.slotTime,
          avgPrice,
          currencyCode: group.currencyCode,
          daysCovered: orderedPrices.length,
          availabilityRate,
          popularityCountYesterday: group.popularityCountYesterday,
          orderedPrices,
        };
      })
      .sort((a, b) => {
        const byDetail = (a.detailTourName ?? "").localeCompare(b.detailTourName ?? "");
        if (byDetail !== 0) return byDetail;

        if (a.avgPrice !== null && b.avgPrice !== null && a.avgPrice !== b.avgPrice) {
          return a.avgPrice - b.avgPrice;
        }

        if (a.otaName !== b.otaName) {
          return (a.otaName ?? "").localeCompare(b.otaName ?? "");
        }

        return (a.optionName ?? "").localeCompare(b.optionName ?? "");
      })
      .map((group) => {
        const priceTooltip =
          group.orderedPrices.length > 0
            ? group.orderedPrices
                .map((item) => `${item.targetDate}: ${formatCurrency(item.value, group.currencyCode)}`)
                .join("\n")
            : "Sin precios";

        return {
          ...group,
          priceTooltip,
        };
      });
  }, [filteredLatestAvailability, filteredLatestPrices]);

  const normalizedTourSearchTerm = useMemo(() => tourSearchTerm.trim().toLowerCase(), [tourSearchTerm]);

  const sourceProductById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sources ?? []) {
      m.set(s.id, s.external_product_id);
    }
    return m;
  }, [sources]);

  const sourceProductUrlById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sources ?? []) {
      if (s.product_url) m.set(s.id, s.product_url);
    }
    return m;
  }, [sources]);

  const searchFilteredGroupedRows = useMemo(() => {
    if (!normalizedTourSearchTerm) return groupedPriceRows;

    return groupedPriceRows.filter((row) => {
      const pid = sourceProductById.get(row.otaSourceId) ?? "";
      const hay = [
        row.optionName ?? "",
        row.detailTourName ?? "",
        pid,
        row.languageCode ?? "",
        row.slotTime ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(normalizedTourSearchTerm);
    });
  }, [groupedPriceRows, normalizedTourSearchTerm, sourceProductById]);

  const popularPriceRows = useMemo(
    () => searchFilteredGroupedRows.filter((row) => row.popularityCountYesterday !== null),
    [searchFilteredGroupedRows],
  );

  const priceRows = useMemo(() => {
    const all = searchFilteredGroupedRows.slice(0, 30);
    const popular = popularPriceRows.slice(0, 30);
    let rows: typeof all;
    if (showAllTours) rows = all;
    else if (popular.length === 0 && all.length > 0) rows = all;
    else rows = popular;

    return [...rows].sort((a, b) => {
      const aRanked = a.popularityCountYesterday !== null ? 1 : 0;
      const bRanked = b.popularityCountYesterday !== null ? 1 : 0;
      if (aRanked !== bRanked) return bRanked - aRanked;
      if (a.avgPrice !== null && b.avgPrice !== null && a.avgPrice !== b.avgPrice) {
        return a.avgPrice - b.avgPrice;
      }
      if (a.otaName !== b.otaName) return (a.otaName ?? "").localeCompare(b.otaName ?? "");
      return (a.optionName ?? "").localeCompare(b.optionName ?? "");
    });
  }, [popularPriceRows, searchFilteredGroupedRows, showAllTours]);

  return {
    groupedPriceRows,
    priceRows,
    sourceProductById,
    sourceProductUrlById,
    expandedPriceRows,
    setExpandedPriceRows,
    showAllTours,
    setShowAllTours,
    tourSearchTerm,
    setTourSearchTerm,
  };
}
