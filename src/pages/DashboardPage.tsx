import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getScrapingStatus, postScrapingTrigger } from "@/api/scraping";
import { HORIZON_OPTIONS, KNOWN_OTA_NAMES, otaColor, otaLabel } from "@/features/dashboard/constants";
import { useHorizonSelection } from "@/features/dashboard/HorizonSelectionContext";
import {
  useLatestAvailabilityQuery,
  useLatestPricesQuery,
  usePriceTimeseriesQuery,
  usePriceTrendTimeseriesQuery,
  useSourcesQuery,
} from "@/features/dashboard/useDashboardQueries";
import { OtaListingsSection } from "@/features/dashboard/OtaListingsSection";
import { useProductOptionsTable } from "@/features/dashboard/productOptionsTable";
import { pickDefaultTourCode, sortToursWithPreferredFirst } from "@/features/tours/defaultTour";
import { toursQueryKeys } from "@/features/tours/queryKeys";
import { useTourSelection } from "@/features/tours/TourSelectionContext";
import { useToursQuery } from "@/features/tours/useToursQuery";
import type { PricePointResponse } from "@/types/market";
import { formatUtcToLocal, utcIsoToLocalDateKey } from "@/utils/datetime";
import { formatCurrency, parseDecimalToNumber } from "@/utils/number";

type PriceLevel = "low" | "medium" | "high" | "none";

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * Filtra por ventana de visita [todayIso, toDate]. Viator (listado, horizon_days=0) guarda target_date = día del scrape
 * en el servidor; con UTC/husos puede quedar 1–2 días “atrás” respecto al hoy del navegador y desaparecía del panel.
 */
function isTargetDateInDashboardHorizon(
  targetDate: string,
  otaName: string | null | undefined,
  horizonDays: number | undefined,
  todayIso: string,
  toDate: string,
): boolean {
  if (targetDate >= todayIso && targetDate <= toDate) return true;
  const ota = (otaName ?? "").toLowerCase();
  if (ota === "viator" && horizonDays === 0) {
    const graceStart = formatDateLocal(addDays(new Date(`${todayIso}T12:00:00`), -3));
    return targetDate >= graceStart && targetDate <= toDate;
  }
  return false;
}

function otaSelectedMatchesFilter(otaName: string | null | undefined, selected: string[]): boolean {
  if (!otaName || selected.length === 0) return true;
  return selected.some((s) => s.toLowerCase() === otaName.toLowerCase());
}

function getPriceValue(item: PricePointResponse): number | null {
  return parseDecimalToNumber(item.final_price ?? item.list_price);
}

function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("es-ES", {
    month: "short",
    day: "numeric",
  });
}

/** Primer y último día del mes `YYYY-MM`. */
function firstLastOfMonthKey(monthKey: string): { from: string; to: string } {
  const parts = monthKey.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  if (!y || !m || m < 1 || m > 12) {
    const t = new Date();
    return {
      from: formatDateLocal(new Date(t.getFullYear(), t.getMonth(), 1)),
      to: formatDateLocal(new Date(t.getFullYear(), t.getMonth() + 1, 0)),
    };
  }
  return {
    from: formatDateLocal(new Date(y, m - 1, 1)),
    to: formatDateLocal(new Date(y, m, 0)),
  };
}

function formatMonthTitleEs(d: Date): string {
  const raw = d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatIsoDateShortEs(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatHorizonRangeLabel(fromIso: string, toIso: string): string {
  return `${formatIsoDateShortEs(fromIso)} – ${formatIsoDateShortEs(toIso)}`;
}

type TrendChartRow = {
  date: string;
  label: string;
  getyourguide: number | null;
  viator: number | null;
};

const HEATMAP_GRADIENT =
  "linear-gradient(to right, #22c55e 0%, #22c55e 34%, #fbbf24 34%, #fbbf24 67%, #ef4444 67%, #ef4444 100%)";

type HeatmapScaleForLegend = {
  horizonFrom: string;
  horizonTo: string;
  minPrice: number;
  maxPrice: number;
  isFlat: boolean;
  t1: number;
  t2: number;
};

function HeatmapPriceScaleLegend({ scale, currencyCode }: { scale: HeatmapScaleForLegend; currencyCode: string }) {
  const fmt = (n: number) => formatCurrency(n, currencyCode);
  const range = formatHorizonRangeLabel(scale.horizonFrom, scale.horizonTo);

  if (scale.isFlat) {
    return (
      <aside
        className="w-full max-w-[200px] shrink-0 rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-sm lg:sticky lg:top-4"
        aria-label={`Escala de precios: ${range}, un solo nivel ${fmt(scale.minPrice)}`}
      >
        <p className="text-center text-[11px] font-medium leading-tight text-slate-500">{range}</p>
        <div
          className="mt-3 h-10 w-full rounded-lg shadow-inner ring-1 ring-black/5"
          style={{ backgroundColor: "#fbbf24" }}
        />
        <p className="mt-2 text-center text-base font-bold tabular-nums tracking-tight text-slate-900">{fmt(scale.minPrice)}</p>
        <div className="mt-3 flex justify-center border-t border-slate-100 pt-3">
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 ring-1 ring-slate-200/80"
            title="Sin precio"
          >
            <span className="h-3 w-3 rounded-sm bg-slate-200" />
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="w-full max-w-[220px] shrink-0 rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-sm lg:sticky lg:top-4"
      aria-label={`Escala del horizonte ${range}: de ${fmt(scale.minPrice)} a ${fmt(scale.maxPrice)}`}
    >
      <p className="text-center text-[11px] font-medium leading-tight text-slate-500">{range}</p>

      <div className="relative mt-3 pb-5">
        <div
          className="h-10 w-full rounded-lg shadow-inner ring-1 ring-black/5"
          style={{ background: HEATMAP_GRADIENT }}
        />
        <span className="absolute bottom-0 left-0 max-w-[42%] truncate text-[10px] font-semibold tabular-nums text-slate-800">
          {fmt(scale.minPrice)}
        </span>
        <span className="absolute bottom-0 left-[34%] -translate-x-1/2 text-[10px] font-semibold tabular-nums text-slate-800">
          {fmt(scale.t1)}
        </span>
        <span className="absolute bottom-0 left-[67%] -translate-x-1/2 text-[10px] font-semibold tabular-nums text-slate-800">
          {fmt(scale.t2)}
        </span>
        <span className="absolute bottom-0 right-0 max-w-[42%] truncate text-right text-[10px] font-semibold tabular-nums text-slate-800">
          {fmt(scale.maxPrice)}
        </span>
      </div>

      <div className="mt-2 flex justify-center">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 ring-1 ring-slate-200/80"
          title="Sin precio"
        >
          <span className="h-3 w-3 rounded-sm bg-slate-200" />
        </span>
      </div>
    </aside>
  );
}

/** Meses naturales `YYYY-MM` que cubren el rango inclusive `[startIso, endIso]` (p. ej. +30 días → dos meses). */
function listMonthKeysBetweenInclusive(startIso: string, endIso: string): string[] {
  if (startIso > endIso) return [];
  const [sy, sm] = startIso.split("-").map(Number);
  const [ey, em] = endIso.split("-").map(Number);
  if (!sy || !sm || !ey || !em) return [];
  const keys: string[] = [];
  let y = sy;
  let m = sm;
  const endKey = `${ey}-${String(em).padStart(2, "0")}`;
  for (;;) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    keys.push(k);
    if (k === endKey) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

/** Meses 1–12 con nombre en castellano (para desplegable). */
const CAL_ES_MONTH_OPTIONS: ReadonlyArray<{ value: number; label: string }> = Array.from({ length: 12 }, (_, idx) => {
  const raw = new Date(2000, idx, 1).toLocaleDateString("es-ES", { month: "long" });
  return { value: idx + 1, label: raw.charAt(0).toUpperCase() + raw.slice(1) };
});

export function DashboardPage() {
  const queryClient = useQueryClient();
  const { selectedTourCode, setSelectedTourCode } = useTourSelection();
  const { selectedHorizon, setSelectedHorizon } = useHorizonSelection();
  const scrapingToken = (import.meta.env.VITE_SCRAPING_TRIGGER_TOKEN as string | undefined)?.trim() ?? "";
  const [panelSyncBusy, setPanelSyncBusy] = useState(false);
  const [scrapePercent, setScrapePercent] = useState(0);
  const [scrapePhase, setScrapePhase] = useState("");
  const [scrapeDetail, setScrapeDetail] = useState("");
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const scrapePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (scrapePollRef.current) {
        clearInterval(scrapePollRef.current);
        scrapePollRef.current = null;
      }
    };
  }, []);

  const { data: tours, isLoading: isToursLoading, isError: isToursError, refetch: refetchTours } = useToursQuery();
  const { data: sources } = useSourcesQuery(selectedTourCode);
  const [selectedOtas, setSelectedOtas] = useState<string[]>([]);
  const singleSelectedOta = selectedOtas.length === 1 ? selectedOtas[0] : undefined;

  const todayDate = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  /** Solo fechas de visita >= hoy (no mostrar ni agregar pasado). */
  const todayIso = useMemo(() => formatDateLocal(todayDate), [todayDate]);

  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth() + 1);

  const priceCalendarMonthKey = useMemo(
    () => `${calendarYear}-${String(calendarMonth).padStart(2, "0")}`,
    [calendarYear, calendarMonth],
  );

  const dashboardCalendarYearOptions = useMemo(() => {
    const center = todayDate.getFullYear();
    const list = Array.from({ length: 12 }, (_, i) => center - 4 + i);
    if (!list.includes(calendarYear)) list.push(calendarYear);
    return [...new Set(list)].sort((a, b) => a - b);
  }, [todayDate, calendarYear]);

  /** Rango de API alineado al horizonte elegido (p. ej. +7 días → solo 7 días de visita), sin ampliar al mes del calendario. */
  const rangeDaysForSnapshots = useMemo(() => {
    if (selectedHorizon <= 0) return 1;
    return Math.min(800, selectedHorizon);
  }, [selectedHorizon]);

  const fromDate = useMemo(() => formatDateLocal(todayDate), [todayDate]);
  const toDate = useMemo(() => formatDateLocal(addDays(todayDate, selectedHorizon)), [todayDate, selectedHorizon]);

  const {
    data: latestPrices,
    isLoading: isPricesLoading,
    isError: isPricesError,
    refetch: refetchPrices,
  } = useLatestPricesQuery(selectedTourCode, selectedHorizon, rangeDaysForSnapshots, singleSelectedOta);
  const {
    data: latestAvailability,
    isLoading: isAvailabilityLoading,
    isError: isAvailabilityError,
    refetch: refetchAvailability,
  } = useLatestAvailabilityQuery(selectedTourCode, selectedHorizon, rangeDaysForSnapshots, singleSelectedOta);

  /** Misma ventana que el horizonte (+N días desde hoy) para que el calendario térmico tenga datos en todos los meses tocados. */
  const timeseriesHorizonBounds = useMemo(() => ({ from: fromDate, to: toDate }), [fromDate, toDate]);

  const { data: priceTimeseries } = usePriceTimeseriesQuery(
    selectedTourCode,
    selectedHorizon,
    timeseriesHorizonBounds.from,
    timeseriesHorizonBounds.to,
  );

  const trendMonthBounds = useMemo(() => firstLastOfMonthKey(priceCalendarMonthKey), [priceCalendarMonthKey]);

  const {
    data: priceTrendTimeseries,
    isLoading: isTrendTimeseriesLoading,
    isError: isTrendTimeseriesError,
    refetch: refetchTrendTimeseries,
  } = usePriceTrendTimeseriesQuery(selectedTourCode, trendMonthBounds.from, trendMonthBounds.to);

  useEffect(() => {
    if (!tours || tours.length === 0) return;

    const isSelectionValid = selectedTourCode
      ? tours.some((tour) => tour.internal_code === selectedTourCode)
      : false;

    if (!isSelectionValid) {
      setSelectedTourCode(pickDefaultTourCode(tours));
    }
  }, [selectedTourCode, setSelectedTourCode, tours]);

  const otaOptions = useMemo(() => {
    // Always include all registered OTAs (GYG + Viator + …) so they appear in the
    // filter immediately, even before any data has been scraped for them.
    const set = new Set<string>(KNOWN_OTA_NAMES);

    for (const source of sources ?? []) {
      if (source.ota_name) set.add(source.ota_name);
    }

    for (const item of latestPrices?.items ?? []) {
      if (item.ota_name) set.add(item.ota_name);
    }

    for (const item of latestAvailability?.items ?? []) {
      if (item.ota_name) set.add(item.ota_name);
    }

    for (const item of priceTimeseries?.items ?? []) {
      if (item.ota_name) set.add(item.ota_name);
    }

    for (const item of priceTrendTimeseries?.items ?? []) {
      if (item.ota_name) set.add(item.ota_name);
    }

    return [...set].sort((a, b) => {
      // Registered OTAs come first in their configured order.
      const aIndex = KNOWN_OTA_NAMES.indexOf(a);
      const bIndex = KNOWN_OTA_NAMES.indexOf(b);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [latestAvailability?.items, latestPrices?.items, priceTimeseries?.items, priceTrendTimeseries?.items, sources]);

  useEffect(() => {
    if (otaOptions.length === 0) {
      setSelectedOtas([]);
      return;
    }

    setSelectedOtas((previous) => {
      if (previous.length === 0) return otaOptions;

      const filtered = previous.filter((ota) => otaOptions.includes(ota));
      return filtered.length === 0 ? otaOptions : filtered;
    });
  }, [otaOptions]);

  const filteredLatestPrices = useMemo(() => {
    const items = latestPrices?.items ?? [];
    const futureOnly = items.filter((item) =>
      isTargetDateInDashboardHorizon(item.target_date, item.ota_name, item.horizon_days, todayIso, toDate),
    );
    if (selectedOtas.length === 0) return futureOnly;
    return futureOnly.filter((item) => otaSelectedMatchesFilter(item.ota_name, selectedOtas));
  }, [latestPrices?.items, selectedOtas, todayIso, toDate]);

  const filteredLatestAvailability = useMemo(() => {
    const items = latestAvailability?.items ?? [];
    const futureOnly = items.filter((item) =>
      isTargetDateInDashboardHorizon(item.target_date, item.ota_name, item.horizon_days, todayIso, toDate),
    );
    if (selectedOtas.length === 0) return futureOnly;
    return futureOnly.filter((item) => otaSelectedMatchesFilter(item.ota_name, selectedOtas));
  }, [latestAvailability?.items, selectedOtas, todayIso, toDate]);

  const filteredTimeseries = useMemo(() => {
    const items = priceTimeseries?.items ?? [];
    const futureOnly = items.filter((item) =>
      isTargetDateInDashboardHorizon(item.target_date, item.ota_name, item.horizon_days, todayIso, toDate),
    );
    if (selectedOtas.length === 0) return futureOnly;
    return futureOnly.filter((item) => otaSelectedMatchesFilter(item.ota_name, selectedOtas));
  }, [priceTimeseries?.items, selectedOtas, todayIso, toDate]);

  const avgPriceValue = useMemo(() => {
    const values = filteredLatestPrices
      .map((item) => getPriceValue(item))
      .filter((value): value is number => value !== null);

    if (values.length === 0) return null;

    return values.reduce((acc, value) => acc + value, 0) / values.length;
  }, [filteredLatestPrices]);

  const primaryCurrency = useMemo(() => {
    return filteredLatestPrices[0]?.currency_code ?? latestPrices?.items[0]?.currency_code ?? "EUR";
  }, [filteredLatestPrices, latestPrices?.items]);

  const availabilityRate = useMemo(() => {
    if (filteredLatestAvailability.length === 0) return null;

    const available = filteredLatestAvailability.filter((item) => item.is_available).length;
    return (available / filteredLatestAvailability.length) * 100;
  }, [filteredLatestAvailability]);

  const activeListings = useMemo(() => {
    const uniqueSources = new Set(filteredLatestPrices.map((item) => item.ota_source_id));
    return uniqueSources.size;
  }, [filteredLatestPrices]);

  const {
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
  } = useProductOptionsTable(filteredLatestPrices, filteredLatestAvailability, sources, selectedTourCode);

  const priceStats = useMemo(() => {
    const values = groupedPriceRows
      .map((row) => row.avgPrice)
      .filter((value): value is number => value !== null);

    if (values.length === 0) {
      return {
        cheapest: null,
        highest: null,
        spread: null,
      };
    }

    const cheapest = Math.min(...values);
    const highest = Math.max(...values);

    return {
      cheapest,
      highest,
      spread: highest - cheapest,
    };
  }, [groupedPriceRows]);

  const availabilityPageHref = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedTourCode) params.set("tour_code", selectedTourCode);
    const { from, to } = firstLastOfMonthKey(priceCalendarMonthKey);
    params.set("from_date", from);
    params.set("to_date", to);
    return `/availability?${params.toString()}`;
  }, [selectedTourCode, priceCalendarMonthKey]);

  /**
   * Tendencia mensual: **solo** precio medio real por día del mes (sin rellenar huecos).
   * GYG: media de todas las filas con esa fecha de visita. Viator (listado): media del scrape cuyo día local (observed_at) coincide.
   */
  const trendChartData = useMemo(() => {
    const { from: rangeFrom, to: rangeTo } = firstLastOfMonthKey(priceCalendarMonthKey);
    const items = priceTrendTimeseries?.items ?? [];

    const byDateTs = new Map<string, Record<string, number[]>>();
    for (const item of items) {
      if (!item.ota_name) continue;
      const otaKey = item.ota_name.toLowerCase();
      if (otaKey !== "getyourguide" && otaKey !== "viator") continue;
      const value = getPriceValue(item);
      if (value === null) continue;
      const day =
        otaKey === "viator" && item.horizon_days === 0
          ? utcIsoToLocalDateKey(item.observed_at) ?? item.target_date
          : item.target_date;
      if (day < rangeFrom || day > rangeTo) continue;
      const otaMap = byDateTs.get(day) ?? {};
      const arr = otaMap[otaKey] ?? [];
      arr.push(value);
      otaMap[otaKey] = arr;
      byDateTs.set(day, otaMap);
    }

    const partsFrom = rangeFrom.split("-").map(Number);
    const partsTo = rangeTo.split("-").map(Number);
    const sy = partsFrom[0];
    const sm = partsFrom[1];
    const sd = partsFrom[2];
    const ey = partsTo[0];
    const em = partsTo[1];
    const ed = partsTo[2];
    if (!sy || !sm || !sd || !ey || !em || !ed) return [];

    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    const rows: TrendChartRow[] = [];
    const cursor = new Date(start);

    const avgForKey = (m: Record<string, number[]>, key: string): number | null => {
      const vals = m[key] ?? [];
      if (vals.length === 0) return null;
      return vals.reduce((acc, v) => acc + v, 0) / vals.length;
    };

    while (cursor <= end) {
      const iso = formatDateLocal(cursor);
      const tsMap = byDateTs.get(iso) ?? {};
      rows.push({
        date: iso,
        label: dayLabel(iso),
        getyourguide: avgForKey(tsMap, "getyourguide"),
        viator: avgForKey(tsMap, "viator"),
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return rows;
  }, [priceTrendTimeseries?.items, priceCalendarMonthKey]);

  /**
   * Precio medio por día en el horizonte [hoy, fin], misma regla que el gráfico (serie + último snapshot por OTA).
   * El calendario térmico usa esto para poder colorear meses fuera del “Año/Mes” del gráfico.
   */
  const horizonPriceByDate = useMemo(() => {
    const start = todayIso;
    const end = toDate;
    const map = new Map<string, number | null>();
    if (start > end) return map;

    const byDateTs = new Map<string, Record<string, number[]>>();
    for (const item of filteredTimeseries) {
      if (!item.ota_name || !selectedOtas.includes(item.ota_name)) continue;
      const value = getPriceValue(item);
      if (value === null) continue;
      const day = item.target_date;
      if (day < start || day > end) continue;
      const otaMap = byDateTs.get(day) ?? {};
      const arr = otaMap[item.ota_name] ?? [];
      arr.push(value);
      otaMap[item.ota_name] = arr;
      byDateTs.set(day, otaMap);
    }

    const byDateLatest = new Map<string, Record<string, number[]>>();
    for (const item of filteredLatestPrices) {
      if (!item.ota_name || !selectedOtas.includes(item.ota_name)) continue;
      const value = getPriceValue(item);
      if (value === null) continue;
      const day = item.target_date;
      if (day < start || day > end) continue;
      const otaMap = byDateLatest.get(day) ?? {};
      const arr = otaMap[item.ota_name] ?? [];
      arr.push(value);
      otaMap[item.ota_name] = arr;
      byDateLatest.set(day, otaMap);
    }

    const partsFrom = start.split("-").map(Number);
    const partsTo = end.split("-").map(Number);
    const sy = partsFrom[0];
    const sm = partsFrom[1];
    const sd = partsFrom[2];
    const ey = partsTo[0];
    const em = partsTo[1];
    const ed = partsTo[2];
    if (!sy || !sm || !sd || !ey || !em || !ed) return map;

    const cursor = new Date(sy, sm - 1, sd);
    const endD = new Date(ey, em - 1, ed);
    while (cursor <= endD) {
      const iso = formatDateLocal(cursor);
      const tsMap = byDateTs.get(iso) ?? {};
      const latestMap = byDateLatest.get(iso) ?? {};
      const vals: number[] = [];
      for (const ota of selectedOtas) {
        const tsVals = tsMap[ota] ?? [];
        if (tsVals.length > 0) {
          vals.push(tsVals.reduce((acc, v) => acc + v, 0) / tsVals.length);
        } else {
          const lv = latestMap[ota] ?? [];
          if (lv.length > 0) vals.push(lv.reduce((acc, v) => acc + v, 0) / lv.length);
        }
      }
      map.set(iso, vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
      cursor.setDate(cursor.getDate() + 1);
    }
    return map;
  }, [filteredLatestPrices, filteredTimeseries, selectedOtas, todayIso, toDate]);

  type CalendarDayCell = {
    date: string;
    dayNumber: number;
    monthLabel: string;
    priceLevel: PriceLevel;
    avgPrice: number | null;
  };

  type CalendarMonthSection = {
    monthKey: string;
    monthLabel: string;
    leadingEmpty: number;
    days: CalendarDayCell[];
  };

  /** Un panel por mes natural que toque el horizonte; escala de color global en el rango. */
  const availabilityCalendar = useMemo(() => {
    const rangeStart = todayIso;
    const rangeEnd = toDate;
    let heatmapMonthKeys = listMonthKeysBetweenInclusive(rangeStart, rangeEnd);
    if (heatmapMonthKeys.length === 0) {
      heatmapMonthKeys = listMonthKeysBetweenInclusive(rangeStart, rangeStart);
    }

    const horizonAvgs: number[] = [];
    for (const v of horizonPriceByDate.values()) {
      if (v !== null && Number.isFinite(v)) horizonAvgs.push(v);
    }
    const minDailyPrice = horizonAvgs.length > 0 ? Math.min(...horizonAvgs) : null;
    const maxDailyPrice = horizonAvgs.length > 0 ? Math.max(...horizonAvgs) : null;

    const priceLevelForAvg = (avgPrice: number | null): PriceLevel => {
      if (avgPrice === null || minDailyPrice === null || maxDailyPrice === null) return "none";
      if (maxDailyPrice === minDailyPrice) return "medium";
      const normalized = (avgPrice - minDailyPrice) / (maxDailyPrice - minDailyPrice);
      if (normalized < 0.34) return "low";
      if (normalized < 0.67) return "medium";
      return "high";
    };

    const heatmapPanels: Array<{
      monthKey: string;
      monthLabel: string;
      monthSections: CalendarMonthSection[];
    }> = [];

    for (const monthKey of heatmapMonthKeys) {
      const { from: monthStartIso, to: monthEndIso } = firstLastOfMonthKey(monthKey);
      const [sy, sm, sd] = monthStartIso.split("-").map(Number);
      const [ey, em, ed] = monthEndIso.split("-").map(Number);
      if (!sy || !sm || !sd || !ey || !em || !ed) continue;

      const monthStart = new Date(sy, sm - 1, sd);
      const monthEnd = new Date(ey, em - 1, ed);
      const totalDays = Math.max(0, Math.floor((monthEnd.getTime() - monthStart.getTime()) / (24 * 60 * 60 * 1000)) + 1);

      const days: CalendarDayCell[] = [];
      for (let index = 0; index < totalDays; index += 1) {
        const date = addDays(monthStart, index);
        const iso = formatDateLocal(date);
        let avgPrice: number | null = null;
        let priceLevel: PriceLevel = "none";

        if (iso >= rangeStart && iso <= rangeEnd) {
          avgPrice = horizonPriceByDate.get(iso) ?? null;
          priceLevel = priceLevelForAvg(avgPrice);
        }

        days.push({
          date: iso,
          dayNumber: date.getDate(),
          monthLabel: date.toLocaleDateString("es-ES", { month: "short" }),
          priceLevel,
          avgPrice,
        });
      }

      const titleDate = new Date(`${monthStartIso}T00:00:00`);
      const section: CalendarMonthSection = {
        monthKey,
        monthLabel: formatMonthTitleEs(titleDate),
        leadingEmpty: titleDate.getDay(),
        days,
      };

      heatmapPanels.push({
        monthKey,
        monthLabel: formatMonthTitleEs(titleDate),
        monthSections: [section],
      });
    }

    let horizonHasPrice = false;
    for (const v of horizonPriceByDate.values()) {
      if (v !== null && Number.isFinite(v)) {
        horizonHasPrice = true;
        break;
      }
    }

    const scale =
      minDailyPrice !== null && maxDailyPrice !== null && horizonAvgs.length > 0
        ? {
            horizonFrom: rangeStart,
            horizonTo: rangeEnd,
            minPrice: minDailyPrice,
            maxPrice: maxDailyPrice,
            isFlat: minDailyPrice === maxDailyPrice,
            t1: minDailyPrice + 0.34 * (maxDailyPrice - minDailyPrice),
            t2: minDailyPrice + 0.67 * (maxDailyPrice - minDailyPrice),
          }
        : null;

    return {
      heatmapPanels,
      horizonHasPrice,
      scale,
    };
  }, [horizonPriceByDate, todayIso, toDate]);

  /** Menos marcas en el eje X (máx. ~12); hay un punto por cada día del mes. */
  const priceChartXTicks = useMemo(() => {
    if (trendChartData.length === 0) return undefined;
    const n = trendChartData.length;
    const maxTicks = 12;
    if (n <= maxTicks) return trendChartData.map((r) => String(r.label));
    const step = Math.max(1, Math.ceil(n / maxTicks));
    const labels: string[] = [];
    for (let i = 0; i < n; i += step) {
      labels.push(String(trendChartData[i]?.label ?? ""));
    }
    const lastLabel = String(trendChartData[n - 1]?.label ?? "");
    if (labels[labels.length - 1] !== lastLabel) labels.push(lastLabel);
    return labels;
  }, [trendChartData]);

  const trendChartHasSeriesPoint = useMemo(
    () => trendChartData.some((r) => r.getyourguide !== null || r.viator !== null),
    [trendChartData],
  );

  const otaPriceSummary = useMemo(() => {
    const summary = new Map<string, { count: number; total: number }>();

    for (const item of filteredLatestPrices) {
      if (!item.ota_name) continue;
      const value = getPriceValue(item);
      if (value === null) continue;

      const previous = summary.get(item.ota_name) ?? { count: 0, total: 0 };
      summary.set(item.ota_name, {
        count: previous.count + 1,
        total: previous.total + value,
      });
    }

    return [...summary.entries()].map(([ota, value]) => ({
      ota,
      average: value.total / value.count,
    }));
  }, [filteredLatestPrices]);

  const invalidateDashboardQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: toursQueryKeys.all });
    await queryClient.invalidateQueries({ queryKey: ["sources"] });
    await queryClient.invalidateQueries({ queryKey: ["latest-prices"] });
    await queryClient.invalidateQueries({ queryKey: ["latest-availability"] });
    await queryClient.invalidateQueries({ queryKey: ["price-timeseries"] });
    await queryClient.invalidateQueries({ queryKey: ["price-timeseries-trend"] });
    await queryClient.invalidateQueries({ queryKey: ["viator-listing"] });
    await queryClient.invalidateQueries({ queryKey: ["availability-heatmap"] });
    await queryClient.invalidateQueries({ queryKey: ["availability-day-detail"] });
  };

  /** Refresca el panel desde la BD y, si hay token, encola GYG+Viator en el servidor con barra de progreso. */
  const handleSincronizarPanel = async () => {
    if (panelSyncBusy) return;
    if (scrapePollRef.current) {
      clearInterval(scrapePollRef.current);
      scrapePollRef.current = null;
    }
    setPanelSyncBusy(true);
    setScrapeError(null);
    setScrapePercent(0);
    setScrapePhase("");
    setScrapeDetail(scrapingToken ? "Actualizando desde el servidor…" : "Actualizando desde el servidor…");

    try {
      await invalidateDashboardQueries();
    } catch {
      setPanelSyncBusy(false);
      setScrapeDetail("");
      return;
    }

    if (!scrapingToken) {
      setPanelSyncBusy(false);
      setScrapeDetail("");
      return;
    }

    setScrapeDetail("Encolando scrape (GYG + Viator)…");

    const pollOnce = async (): Promise<"done" | "error" | "running"> => {
      try {
        const s = await getScrapingStatus(scrapingToken);
        setScrapePercent(s.percent);
        setScrapePhase(s.phase);
        setScrapeDetail(s.detail);
        if (s.status === "done") {
          if (scrapePollRef.current) {
            clearInterval(scrapePollRef.current);
            scrapePollRef.current = null;
          }
          setPanelSyncBusy(false);
          await invalidateDashboardQueries();
          return "done";
        }
        if (s.status === "error") {
          if (scrapePollRef.current) {
            clearInterval(scrapePollRef.current);
            scrapePollRef.current = null;
          }
          setPanelSyncBusy(false);
          setScrapeError(s.error ?? s.detail ?? "Error en el scrape");
          return "error";
        }
        return "running";
      } catch {
        return "running";
      }
    };

    try {
      await postScrapingTrigger(scrapingToken);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("409")) {
        setScrapeError("Ya hay un scrape en curso en el servidor.");
      } else {
        setScrapeError(msg);
      }
      setPanelSyncBusy(false);
      setScrapeDetail("");
      return;
    }

    const first = await pollOnce();
    if (first === "running") {
      scrapePollRef.current = setInterval(() => {
        void pollOnce();
      }, 1000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-700 bg-slate-800 text-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
          <h1 className="text-3xl font-semibold tracking-tight">Panel de inteligencia competitiva</h1>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        {isToursError ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <p className="font-semibold">No se pudo cargar la lista de tours desde la API.</p>
            <p className="mt-1 text-red-800">
              Revisa en Vercel que{" "}
              <code className="rounded bg-red-100 px-1 font-mono text-xs">VITE_API_BASE_URL</code> sea la URL
              completa del backend (p. ej. <code className="font-mono text-xs">https://…onrender.com/api/v1</code>
              ), y en Render que <code className="font-mono text-xs">FRONTEND_ORIGINS</code> incluya tu dominio de
              Vercel. Abre la consola del navegador (F12) para ver el error detallado.
            </p>
          </div>
        ) : null}

        {!isToursLoading && !isToursError && (!tours || tours.length === 0) ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">No hay tours activos en la base de datos.</p>
            <p className="mt-1 text-amber-900">
              Ejecuta el seed contra Supabase (p. ej.{" "}
              <code className="rounded bg-amber-100 px-1 font-mono text-xs">python -m scripts.seed_monitored_tours</code>
              ) y confirma que Render usa el mismo <code className="font-mono text-xs">DATABASE_URL</code> que tu
              proyecto Supabase.
            </p>
          </div>
        ) : null}

        <section className="rounded-md border border-slate-300 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="tour-select">
                Tour:
              </label>
              <select
                id="tour-select"
                className="min-w-[320px] rounded border border-slate-300 px-3 py-2 text-sm"
                value={selectedTourCode ?? ""}
                onChange={(event) => setSelectedTourCode(event.target.value)}
                disabled={isToursLoading || !tours || tours.length === 0}
              >
                {sortToursWithPreferredFirst(tours ?? []).map((tour) => (
                  <option key={tour.id} value={tour.internal_code}>
                    {tour.attraction} - {tour.variant}
                  </option>
                ))}
              </select>
              {isToursError ? (
                <button
                  type="button"
                  onClick={() => {
                    void refetchTours();
                  }}
                  className="rounded bg-red-600 px-2 py-1 text-xs text-white"
                >
                  Reintentar
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">Horizonte:</span>
              <div className="flex items-center gap-1 rounded border border-slate-300 bg-slate-50 p-1">
                {HORIZON_OPTIONS.map((option) => {
                  const active = option === selectedHorizon;
                  const label = option === 0 ? "Hoy" : `+${option} días`;

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSelectedHorizon(option)}
                      className={`rounded px-3 py-1 text-sm font-medium ${
                        active ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex min-w-[240px] max-w-md flex-col gap-2">
              <button
                type="button"
                onClick={() => void handleSincronizarPanel()}
                disabled={panelSyncBusy}
                title={
                  scrapingToken
                    ? "Actualiza tours, precios y disponibilidad desde la base de datos y encola un scrape GetYourGuide + Viator en el servidor (progreso en la barra)."
                    : "Actualiza el panel desde la base de datos. Para también disparar el scrape en el servidor, define VITE_SCRAPING_TRIGGER_TOKEN igual que SCRAPING_TRIGGER_SECRET en el backend."
                }
                className="rounded-lg bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 px-5 py-2.5 text-base font-bold text-white shadow-lg shadow-orange-500/45 ring-2 ring-amber-200/90 transition hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
              >
                {panelSyncBusy ? "⏳ Sincronizando…" : "⚡ Sincronizar datos"}
              </button>
              {scrapingToken && (panelSyncBusy || scrapePercent > 0 || scrapeError) ? (
                <>
                  <div
                    className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
                    role="progressbar"
                    aria-valuenow={scrapePercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-2.5 rounded-full bg-gradient-to-r from-amber-400 to-rose-500 transition-[width] duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, scrapePercent))}%` }}
                    />
                  </div>
                  <p className="text-xs leading-snug text-slate-600">
                    {scrapePercent}%
                    {scrapePhase ? ` · ${scrapePhase}` : ""}
                    {scrapeDetail ? ` · ${scrapeDetail}` : ""}
                    {scrapeError ? <span className="block text-red-700">{scrapeError}</span> : null}
                  </p>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="dashboard-cal-year">
                Año:
              </label>
              <select
                id="dashboard-cal-year"
                className="min-w-[100px] rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={calendarYear}
                onChange={(event) => setCalendarYear(Number(event.target.value))}
                title="Año del calendario y rango de snapshots"
              >
                {dashboardCalendarYearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <label className="text-sm font-semibold text-slate-700" htmlFor="dashboard-cal-month">
                Mes:
              </label>
              <select
                id="dashboard-cal-month"
                className="min-w-[160px] rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={calendarMonth}
                onChange={(event) => setCalendarMonth(Number(event.target.value))}
                title="Mes del calendario de precios y rango de snapshots cargados"
              >
                {CAL_ES_MONTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">OTAs:</span>
              <div className="flex flex-wrap items-center gap-2 rounded border border-slate-300 bg-slate-50 px-2 py-1.5">
                {otaOptions.length === 0 ? <span className="text-xs text-slate-500">Sin OTAs</span> : null}
                {otaOptions.map((ota) => (
                  <label key={ota} className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedOtas.includes(ota)}
                      onChange={(event) => {
                        setSelectedOtas((previous) => {
                          if (event.target.checked) return [...new Set([...previous, ota])];
                          return previous.filter((value) => value !== ota);
                        });
                      }}
                    />
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: otaColor(ota) }}
                    />
                    {otaLabel(ota)}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-4">
          <MetricCard
            title="Precio medio"
            value={avgPriceValue !== null ? formatCurrency(avgPriceValue, primaryCurrency) : "N/D"}
            loading={isPricesLoading}
            subtitle={`Última captura de precios: ${formatUtcToLocal(latestPrices?.observed_at ?? null)}`}
            details={selectedOtas.map((ota) => {
              const entry = otaPriceSummary.find((item) => item.ota === ota);
              return entry
                ? `${otaLabel(ota)}: ${formatCurrency(entry.average, primaryCurrency)}`
                : `${otaLabel(ota)}: N/D`;
            })}
            onRetry={
              isPricesError
                ? () => {
                    void refetchPrices();
                  }
                : undefined
            }
          />

          <MetricCard
            title="Precio más bajo"
            value={priceStats.cheapest !== null ? formatCurrency(priceStats.cheapest, primaryCurrency) : "N/D"}
            loading={isPricesLoading}
            subtitle="Último snapshot (mínimo)"
            details={[
              `Máximo: ${priceStats.highest !== null ? formatCurrency(priceStats.highest, primaryCurrency) : "N/D"}`,
              `Rango: ${priceStats.spread !== null ? formatCurrency(priceStats.spread, primaryCurrency) : "N/D"}`,
            ]}
            onRetry={
              isPricesError
                ? () => {
                    void refetchPrices();
                  }
                : undefined
            }
          />

          <MetricCard
            title="Tasa de disponibilidad"
            value={availabilityRate !== null ? `${availabilityRate.toFixed(0)}%` : "N/D"}
            loading={isAvailabilityLoading}
            subtitle={`Última captura de disponibilidad: ${formatUtcToLocal(latestAvailability?.observed_at ?? null)}`}
            details={selectedOtas.map((ota) => {
              const otaItems = filteredLatestAvailability.filter((item) => item.ota_name === ota);
              if (otaItems.length === 0) return `${otaLabel(ota)}: N/D`;
              const available = otaItems.filter((item) => item.is_available).length;
              const rate = (available / otaItems.length) * 100;
              return `${otaLabel(ota)}: ${rate.toFixed(0)}%`;
            })}
            onRetry={
              isAvailabilityError
                ? () => {
                    void refetchAvailability();
                  }
                : undefined
            }
          />

          <MetricCard
            title="Listados activos"
            value={String(activeListings)}
            loading={isPricesLoading}
            subtitle="Fuentes OTA distintas en el último snapshot de precios"
            details={selectedOtas.map((ota) => {
              const count = new Set(
                filteredLatestPrices
                  .filter((item) => item.ota_name === ota)
                  .map((item) => item.ota_source_id),
              ).size;
              return `${otaLabel(ota)}: ${count}`;
            })}
            onRetry={
              isPricesError
                ? () => {
                    void refetchPrices();
                  }
                : undefined
            }
          />
        </section>

        <section className="mt-4">

          <article className="rounded border border-slate-300 bg-white shadow-sm">
            <header className="border-b border-slate-200 px-4 py-2 text-xl font-semibold text-slate-800">
              <Link to={availabilityPageHref} className="hover:underline">
                Vista de disponibilidad
              </Link>
            </header>
            <div className="px-4 py-3">
              <p className="mb-3 text-sm text-slate-600">
                Precio medio por día de visita según el <span className="font-medium text-slate-800">horizonte</span>. Tendencia:
                <span className="font-medium text-slate-800"> Año / Mes</span> arriba.
              </p>

              {isPricesLoading ? <div className="h-44 animate-pulse rounded bg-slate-100" /> : null}
              {!isPricesLoading && isPricesError ? (
                <div>
                  <p className="text-sm text-red-700">No se pudieron cargar los precios del calendario.</p>
                  <button
                    type="button"
                    onClick={() => {
                      void refetchPrices();
                    }}
                    className="mt-2 rounded bg-red-600 px-2 py-1 text-xs text-white"
                  >
                    Reintentar
                  </button>
                </div>
              ) : null}
              {!isPricesLoading && !isPricesError ? (
                <>
                  {!availabilityCalendar.horizonHasPrice ? (
                    <p className="mb-3 text-sm text-slate-600">Sin precios en este horizonte (gris).</p>
                  ) : null}
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-center">
                    <div className="flex flex-wrap items-start justify-center gap-6 lg:flex-1">
                      {availabilityCalendar.heatmapPanels.map((panel) => (
                        <div key={panel.monthKey} className="min-w-[240px] flex-1">
                          <div className="mb-2 text-center text-lg font-semibold text-slate-700">{panel.monthLabel}</div>
                          <div className="space-y-4">
                            {panel.monthSections.map((section) => (
                              <div key={section.monthKey}>
                                <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
                                  <div>D</div>
                                  <div>L</div>
                                  <div>M</div>
                                  <div>X</div>
                                  <div>J</div>
                                  <div>V</div>
                                  <div>S</div>
                                </div>
                                <div className="mt-1 grid grid-cols-7 gap-1">
                                  {Array.from({ length: section.leadingEmpty }).map((_, index) => (
                                    <div key={`empty-${section.monthKey}-${index}`} className="h-8 rounded bg-transparent" />
                                  ))}
                                  {section.days.map((day) => (
                                    <div
                                      key={day.date}
                                      title={
                                        day.avgPrice !== null
                                          ? `${day.date} · Precio medio: ${formatCurrency(day.avgPrice, primaryCurrency)}`
                                          : `${day.date} · Sin precio`
                                      }
                                      className={`flex h-8 items-center justify-center rounded text-sm font-medium ${getPriceClassName(day.priceLevel)}`}
                                    >
                                      {day.dayNumber}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {availabilityCalendar.scale ? (
                      <HeatmapPriceScaleLegend scale={availabilityCalendar.scale} currencyCode={primaryCurrency} />
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </article>
        </section>

        <section className="mt-4 rounded border border-slate-300 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-4 py-2 text-xl font-semibold text-slate-800">Tendencia de precios</header>
          <div className="p-4">
            <p className="mb-2 text-xs text-slate-600">
              Cada punto es el <span className="font-medium text-slate-800">precio medio de ese día</span> (media aritmética de los precios scrapeados para esa fecha).
              <span className="font-medium text-slate-800"> GetYourGuide</span>: día ={" "}
              <span className="font-medium text-slate-800">fecha de visita</span>.{" "}
              <span className="font-medium text-slate-800">Viator</span>: día ={" "}
              <span className="font-medium text-slate-800">día del scrape</span> (media de las tarjetas del listado).
              Sin scrape ese día → sin punto (hueco en la línea). No usa horizonte ni checkboxes de OTAs.
            </p>
            <p className="mb-3 text-[11px] leading-snug text-slate-500">
              El eje X muestra todos los días del mes seleccionado; solo hay valor donde hay datos en base.
            </p>
            {isTrendTimeseriesLoading ? <div className="h-[320px] animate-pulse rounded bg-slate-100" /> : null}
            {!isTrendTimeseriesLoading && isTrendTimeseriesError ? (
              <div>
                <p className="text-sm text-red-700">No se pudo cargar el histórico mensual.</p>
                <button
                  type="button"
                  onClick={() => {
                    void refetchTrendTimeseries();
                  }}
                  className="mt-2 rounded bg-red-600 px-2 py-1 text-xs text-white"
                >
                  Reintentar
                </button>
              </div>
            ) : null}
            {!isTrendTimeseriesLoading && !isTrendTimeseriesError && trendChartData.length === 0 ? (
              <p className="text-sm text-slate-600">No hay rango de fechas válido para el mes.</p>
            ) : null}
            {!isTrendTimeseriesLoading && !isTrendTimeseriesError && trendChartData.length > 0 && !trendChartHasSeriesPoint ? (
              <p className="text-sm text-slate-600">Sin datos de serie para este mes en la base (aún no scrapeados).</p>
            ) : null}
            {!isTrendTimeseriesLoading && !isTrendTimeseriesError && trendChartData.length > 0 && trendChartHasSeriesPoint ? (
              <div className="w-full min-w-0 overflow-hidden">
                <ResponsiveContainer width="100%" height={340}>
                  <ComposedChart data={trendChartData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      ticks={priceChartXTicks}
                      tick={{ fontSize: 10, fill: "#475569" }}
                      angle={-35}
                      textAnchor="end"
                      height={54}
                      interval={0}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#475569" }}
                      tickFormatter={(v) => (Number.isFinite(v) ? String(Math.round(v)) : "")}
                      domain={[
                        (min: number) => (Number.isFinite(min) ? min - 1 : 0),
                        (max: number) => (Number.isFinite(max) ? max + 1 : 100),
                      ]}
                      width={48}
                    />
                    <Tooltip
                      labelFormatter={(_, payload) => {
                        const row = payload?.[0]?.payload as { date?: string } | undefined;
                        return row?.date ?? "";
                      }}
                      formatter={(value, name) => {
                        if (typeof value !== "number") return ["Sin dato ese día", name];
                        return [`${formatCurrency(value, primaryCurrency)} · media del día`, name];
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: 6, fontSize: 12 }} iconType="line" />
                    <Line
                      type="linear"
                      dataKey="getyourguide"
                      name={otaLabel("getyourguide")}
                      stroke={otaColor("getyourguide")}
                      strokeWidth={2.5}
                      dot={{ r: 2.5, fill: otaColor("getyourguide"), stroke: "#fff", strokeWidth: 1 }}
                      activeDot={{
                        r: 5,
                        fill: otaColor("getyourguide"),
                        stroke: "#fff",
                        strokeWidth: 2,
                      }}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                    <Line
                      type="linear"
                      dataKey="viator"
                      name={otaLabel("viator")}
                      stroke={otaColor("viator")}
                      strokeWidth={2.5}
                      dot={{ r: 2.5, fill: otaColor("viator"), stroke: "#fff", strokeWidth: 1 }}
                      activeDot={{ r: 5, fill: otaColor("viator"), stroke: "#fff", strokeWidth: 2 }}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </div>
        </section>

        <OtaListingsSection
          priceRows={priceRows}
          sourceProductById={sourceProductById}
          sourceProductUrlById={sourceProductUrlById}
          expandedPriceRows={expandedPriceRows}
          setExpandedPriceRows={setExpandedPriceRows}
          showAllTours={showAllTours}
          setShowAllTours={setShowAllTours}
          tourSearchTerm={tourSearchTerm}
          setTourSearchTerm={setTourSearchTerm}
          isPricesLoading={isPricesLoading}
          isPricesError={isPricesError}
          refetchPrices={() => {
            void refetchPrices();
          }}
          fromDate={fromDate}
          toDate={toDate}
          observedAtLabel={formatUtcToLocal(latestPrices?.observed_at ?? null)}
        />
      </main>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  loading: boolean;
  details: string[];
  onRetry?: () => void;
}

function MetricCard({ title, value, subtitle, loading, details, onRetry }: MetricCardProps) {
  return (
    <article className="rounded border border-slate-300 bg-white p-4 shadow-sm">
      <h2 className="text-center text-2xl font-semibold text-slate-700">{title}</h2>
      {loading ? <div className="mt-4 h-12 animate-pulse rounded bg-slate-100" /> : <p className="mt-2 text-center text-5xl font-bold text-slate-800">{value}</p>}
      <p className="mt-2 text-center text-xs text-slate-500">{subtitle}</p>
      {details.length > 0 ? (
        <ul className="mt-4 space-y-1 text-sm text-slate-700">
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-3 rounded bg-red-600 px-2 py-1 text-xs text-white">
          Reintentar
        </button>
      ) : null}
    </article>
  );
}

function getPriceClassName(level: PriceLevel): string {
  if (level === "low") return "bg-green-500 text-white";
  if (level === "medium") return "bg-amber-400 text-slate-900";
  if (level === "high") return "bg-red-500 text-white";
  return "bg-slate-200 text-slate-500";
}
