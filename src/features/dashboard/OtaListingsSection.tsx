import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";

import { otaLabel } from "@/features/dashboard/constants";
import type { ProductOptionRow } from "@/features/dashboard/productOptionsTable";
import { truncateWords } from "@/features/dashboard/productOptionsTable";
import { useViatorListingQuery } from "@/features/dashboard/useDashboardQueries";
import { ViatorTourCardItem } from "@/features/dashboard/ViatorTourCard";
import type { ViatorTourCard } from "@/types/market";
import { sortToursWithPreferredFirst } from "@/features/tours/defaultTour";
import { useTourSelection } from "@/features/tours/TourSelectionContext";
import { useToursQuery } from "@/features/tours/useToursQuery";
import { formatCurrency } from "@/utils/number";
import { formatUtcToLocal } from "@/utils/datetime";

const GYG_BRAND = "#ff5533";
const VIATOR_BRAND = "#172753";

/** GetYourGuide: prioriza la URL de la página del tour (`detail_page_url` del scrape), luego el listado de la fuente; otras OTAs → detalle interno. */
function rowTourHref(
  row: ProductOptionRow,
  sourceProductUrlById: Map<string, string>,
  selectedTourCode: string | null,
  fromDate: string,
  toDate: string,
): string {
  const ota = (row.otaName ?? "").toLowerCase();
  if (ota === "getyourguide") {
    if (row.detailPageUrl) return row.detailPageUrl;
    const listingUrl = sourceProductUrlById.get(row.otaSourceId);
    if (listingUrl) return listingUrl;
  }
  const detailParams = new URLSearchParams();
  if (selectedTourCode) detailParams.set("tour_code", selectedTourCode);
  if (fromDate) detailParams.set("from_date", fromDate);
  if (toDate) detailParams.set("to_date", toDate);
  if (row.otaName) detailParams.set("ota_name", row.otaName);
  if (row.optionName) detailParams.set("option_name", row.optionName);
  return `/availability?${detailParams.toString()}`;
}

function gygPrimaryLinkTitle(row: ProductOptionRow, sourceProductUrlById: Map<string, string>): string {
  const ota = (row.otaName ?? "").toLowerCase();
  if (ota !== "getyourguide") return "Abrir detalle de horarios";
  if (row.detailPageUrl) return "Abrir página del tour en GetYourGuide";
  if (sourceProductUrlById.get(row.otaSourceId)) return "Abrir listado en GetYourGuide";
  return "Abrir detalle de horarios";
}

type ListingTab = "gyg" | "viator";

type Props = {
  priceRows: ProductOptionRow[];
  sourceProductById: Map<string, string>;
  /** URL pública del listado en la OTA (p. ej. página GetYourGuide configurada para la fuente). */
  sourceProductUrlById: Map<string, string>;
  expandedPriceRows: string[];
  setExpandedPriceRows: Dispatch<SetStateAction<string[]>>;
  showAllTours: boolean;
  setShowAllTours: Dispatch<SetStateAction<boolean>>;
  tourSearchTerm: string;
  setTourSearchTerm: Dispatch<SetStateAction<string>>;
  isPricesLoading: boolean;
  isPricesError: boolean;
  refetchPrices: () => void;
  fromDate: string;
  toDate: string;
  observedAtLabel: string | null;
};

export function OtaListingsSection({
  priceRows,
  sourceProductById,
  sourceProductUrlById,
  expandedPriceRows,
  setExpandedPriceRows,
  showAllTours,
  setShowAllTours,
  tourSearchTerm,
  setTourSearchTerm,
  isPricesLoading,
  isPricesError,
  refetchPrices,
  fromDate,
  toDate,
  observedAtLabel,
}: Props) {
  const { selectedTourCode, setSelectedTourCode } = useTourSelection();
  const {
    data: tours,
    isLoading: toursLoading,
    isError: toursError,
    refetch: refetchTours,
  } = useToursQuery();
  const [tab, setTab] = useState<ListingTab>("gyg");
  const [gygDetailTourFilter, setGygDetailTourFilter] = useState<string | null>(null);

  useEffect(() => {
    setGygDetailTourFilter(null);
  }, [selectedTourCode]);

  const gygDetailTourOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of priceRows) {
      const d = row.detailTourName?.trim();
      if (d) names.add(d);
    }
    return [...names].sort((a, b) => a.localeCompare(b, "es"));
  }, [priceRows]);

  const gygFilteredPriceRows = useMemo(() => {
    if (!gygDetailTourFilter) return priceRows;
    return priceRows.filter((row) => (row.detailTourName ?? "").trim() === gygDetailTourFilter);
  }, [priceRows, gygDetailTourFilter]);

  const {
    data: viatorData,
    isLoading: viatorLoading,
    isError: viatorError,
    refetch: refetchViator,
    dataUpdatedAt: viatorUpdatedAt,
  } = useViatorListingQuery();

  const viatorSnapshotAge = viatorUpdatedAt ? Math.floor((Date.now() - viatorUpdatedAt) / (1000 * 60 * 60)) : null;

  return (
    <section className="mt-4 rounded border border-slate-300 bg-white shadow-sm">
      <header className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-2">
            <span
              className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: tab === "gyg" ? GYG_BRAND : VIATOR_BRAND }}
            />
            <div>
              <h2 className="text-xl font-semibold text-slate-800">Listados OTA</h2>
              <p className="mt-0.5 max-w-3xl text-xs text-slate-500">
                {tab === "gyg" ? (
                  <>
                    GetYourGuide: mismas tarjetas que Viator; cada clic abre la página pública del tour (URL del scrape
                    por variante). Ranking &quot;ayer&quot; solo si GYG lo publica.
                  </>
                ) : (
                  <>Viator: tarjetas con la instantánea del listado público (badges, duración, valoraciones).</>
                )}
              </p>
              {tab === "gyg" && observedAtLabel ? (
                <p className="mt-1 text-[11px] text-slate-400">Última captura precios: {observedAtLabel}</p>
              ) : null}
            </div>
          </div>

          <div
            className="flex w-full shrink-0 rounded-lg bg-slate-100 p-1 sm:w-auto"
            role="tablist"
            aria-label="Origen del listado"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "gyg"}
              onClick={() => {
                setTab("gyg");
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === "gyg" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              GetYourGuide
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "viator"}
              onClick={() => {
                setTab("viator");
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === "viator" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Viator
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <label className="shrink-0 text-xs font-semibold text-slate-600" htmlFor="ota-listings-tour">
              Tour
            </label>
            <select
              id="ota-listings-tour"
              className="min-w-0 max-w-full flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm sm:max-w-md"
              value={selectedTourCode ?? ""}
              onChange={(event) => {
                setSelectedTourCode(event.target.value);
              }}
              disabled={toursLoading || !tours || tours.length === 0}
            >
              {sortToursWithPreferredFirst(tours ?? []).map((tour) => (
                <option key={tour.id} value={tour.internal_code}>
                  {tour.attraction} — {tour.variant}
                </option>
              ))}
            </select>
            {toursError ? (
              <button
                type="button"
                onClick={() => {
                  void refetchTours();
                }}
                className="shrink-0 rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
              >
                Reintentar tours
              </button>
            ) : null}
          </div>
          <p className="text-[11px] text-slate-400 sm:max-w-sm sm:text-right">
            Cambia el tour para este bloque y para el resto del dashboard (precios, calendario, etc.).
          </p>
        </div>

        {tab === "gyg" && gygDetailTourOptions.length > 1 ? (
          <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Producto / listado GYG
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setGygDetailTourFilter(null);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  gygDetailTourFilter === null
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Todos
              </button>
              {gygDetailTourOptions.map((name) => (
                <button
                  key={name}
                  type="button"
                  title={name}
                  onClick={() => {
                    setGygDetailTourFilter(name);
                  }}
                  className={`max-w-[14rem] truncate rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    gygDetailTourFilter === name
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "gyg" ? (
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-slate-100 pt-3 sm:justify-end">
            <input
              type="text"
              value={tourSearchTerm}
              onChange={(event) => {
                setTourSearchTerm(event.target.value);
              }}
              placeholder="Buscar opción, producto, idioma…"
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm sm:w-56 sm:flex-initial"
            />
            <button
              type="button"
              onClick={() => {
                setShowAllTours((previous) => !previous);
              }}
              className={`whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium ${
                showAllTours
                  ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                  : "bg-slate-800 text-white hover:bg-slate-900"
              }`}
            >
              {showAllTours ? "Solo con ranking GYG" : "Lista completa"}
            </button>
          </div>
        ) : viatorData && viatorData.length > 0 ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {viatorSnapshotAge !== null && viatorSnapshotAge >= 24 ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                Instantánea con más de 24 h
              </span>
            ) : null}
            <span className="text-xs text-slate-500">
              Capturada: {viatorData[0] ? formatUtcToLocal(viatorData[0].captured_at) : "—"}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {viatorData.length} tours
            </span>
          </div>
        ) : null}
      </header>

      <div className="px-4 py-3">
        {tab === "gyg" ? (
          <GygListingsBody
            priceRows={gygFilteredPriceRows}
            sourceProductById={sourceProductById}
            sourceProductUrlById={sourceProductUrlById}
            expandedPriceRows={expandedPriceRows}
            setExpandedPriceRows={setExpandedPriceRows}
            showAllTours={showAllTours}
            isPricesLoading={isPricesLoading}
            isPricesError={isPricesError}
            refetchPrices={refetchPrices}
            fromDate={fromDate}
            toDate={toDate}
          />
        ) : (
          <ViatorListingsBody
            data={viatorData}
            isLoading={viatorLoading}
            isError={viatorError}
            refetch={refetchViator}
          />
        )}
      </div>
    </section>
  );
}

function GygListingsBody({
  priceRows,
  sourceProductById,
  sourceProductUrlById,
  expandedPriceRows,
  setExpandedPriceRows,
  showAllTours,
  isPricesLoading,
  isPricesError,
  refetchPrices,
  fromDate,
  toDate,
}: Pick<
  Props,
  | "priceRows"
  | "sourceProductById"
  | "sourceProductUrlById"
  | "expandedPriceRows"
  | "setExpandedPriceRows"
  | "showAllTours"
  | "isPricesLoading"
  | "isPricesError"
  | "refetchPrices"
  | "fromDate"
  | "toDate"
>) {
  return (
    <>
      {isPricesLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      ) : null}

      {!isPricesLoading && isPricesError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">No se pudieron cargar las opciones de precio.</p>
          <button
            type="button"
            onClick={() => {
              void refetchPrices();
            }}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {!isPricesLoading && !isPricesError && priceRows.length === 0 ? (
        <p className="text-sm text-slate-600">
          {showAllTours
            ? "Ningún resultado con ese filtro para este tour y horizonte."
            : "Ninguna opción con ranking GYG en este rango; prueba «Lista completa» o amplía el horizonte."}
        </p>
      ) : null}

      {!isPricesLoading && !isPricesError && priceRows.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {priceRows.map((row) => (
            <GygTourCard
              key={row.groupKey}
              row={row}
              sourceProductById={sourceProductById}
              sourceProductUrlById={sourceProductUrlById}
              expandedPriceRows={expandedPriceRows}
              setExpandedPriceRows={setExpandedPriceRows}
              fromDate={fromDate}
              toDate={toDate}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function GygTourCard({
  row,
  sourceProductById,
  sourceProductUrlById,
  expandedPriceRows,
  setExpandedPriceRows,
  fromDate,
  toDate,
}: {
  row: ProductOptionRow;
  sourceProductById: Map<string, string>;
  sourceProductUrlById: Map<string, string>;
  expandedPriceRows: string[];
  setExpandedPriceRows: Dispatch<SetStateAction<string[]>>;
  fromDate: string;
  toDate: string;
}) {
  const { selectedTourCode } = useTourSelection();
  const isExpanded = expandedPriceRows.includes(row.groupKey);
  const hasGyGPopularity = row.popularityCountYesterday !== null;
  const tourHref = rowTourHref(row, sourceProductUrlById, selectedTourCode, fromDate, toDate);

  return (
    <article
      className={`flex flex-col justify-between rounded-md border border-slate-200 bg-slate-50 p-3 transition-shadow hover:shadow-md ${
        hasGyGPopularity ? "ring-1 ring-emerald-200/80" : ""
      }`}
    >
      <div>
        <div className="mb-1.5 flex flex-wrap gap-1">
          <span className="inline-block rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-800">
            {row.otaName ? otaLabel(row.otaName) : "N/D"}
          </span>
          {hasGyGPopularity ? (
            <span
              className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800"
              title="Reservas atribuidas a esta opción el día anterior (dato GYG)"
            >
              Ay.: {row.popularityCountYesterday}
            </span>
          ) : null}
          {row.languageCode ? (
            <span className="inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-900">
              {row.languageCode}
            </span>
          ) : null}
          {row.slotTime ? (
            <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
              {row.slotTime.length >= 5 ? row.slotTime.slice(0, 5) : row.slotTime}
            </span>
          ) : null}
        </div>

        <a
          href={tourHref}
          target="_blank"
          rel="noreferrer"
          title={gygPrimaryLinkTitle(row, sourceProductUrlById)}
          className="block text-sm font-semibold leading-snug text-slate-800 hover:text-blue-700 hover:underline"
        >
          {row.optionName ?? "N/D"}
        </a>

        {row.detailTourName ? (
          <p className="mt-1 line-clamp-2 text-xs leading-snug text-slate-500" title={row.detailTourName}>
            {truncateWords(row.detailTourName, 72)}
          </p>
        ) : null}

        {sourceProductById.get(row.otaSourceId) ? (
          <p className="mt-1 truncate font-mono text-[10px] text-slate-500" title={sourceProductById.get(row.otaSourceId)}>
            {sourceProductById.get(row.otaSourceId)}
          </p>
        ) : null}

        <p className="mt-1.5 text-xs text-slate-600">
          <span className="font-medium text-slate-700">{row.daysCovered} días cubiertos</span>
          {" · "}
          <span title={row.priceTooltip}>
            Disp. {row.availabilityRate !== null ? `${(row.availabilityRate * 100).toFixed(0)}%` : "—"}
          </span>
        </p>
      </div>

      <div className="mt-2 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-base font-bold text-slate-900">
            {row.avgPrice !== null ? (
              <>media {formatCurrency(row.avgPrice, row.currencyCode)}</>
            ) : (
              <span className="text-xs font-normal text-slate-400">Sin media</span>
            )}
          </span>
          {(row.otaName ?? "").toLowerCase() === "getyourguide" ? (
            <a
              href={tourHref}
              target="_blank"
              rel="noreferrer"
              className="rounded px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
              style={{ backgroundColor: GYG_BRAND }}
            >
              Ver en GetYourGuide
            </a>
          ) : (
            <a
              href={tourHref}
              target="_blank"
              rel="noreferrer"
              className="rounded bg-slate-700 px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
            >
              Abrir
            </a>
          )}
        </div>

        <div className="flex items-center justify-end gap-1">
          {isExpanded ? (
            <button
              type="button"
              title={row.priceTooltip}
              onClick={() => {
                setExpandedPriceRows((previous) => previous.filter((value) => value !== row.groupKey));
              }}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
            >
              Ocultar precios
            </button>
          ) : (
            <a
              href={tourHref}
              target="_blank"
              rel="noreferrer"
              title={row.priceTooltip}
              onClick={() => {
                setExpandedPriceRows((previous) =>
                  previous.includes(row.groupKey) ? previous : [...previous, row.groupKey],
                );
              }}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
            >
              Ver precios por fecha
            </a>
          )}
        </div>

        {isExpanded ? (
          <div className="max-h-28 overflow-y-auto rounded border border-slate-200 bg-white p-2 text-[10px] text-slate-700">
            <div className="grid gap-0.5 sm:grid-cols-2">
              {row.orderedPrices.length === 0 ? <span>Sin precios.</span> : null}
              {row.orderedPrices.map((item) => (
                <span key={`${row.groupKey}-${item.targetDate}`}>
                  {item.targetDate}: {formatCurrency(item.value, row.currencyCode)}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ViatorListingsBody({
  data,
  isLoading,
  isError,
  refetch,
}: {
  data: ViatorTourCard[] | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}) {
  return (
    <>
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      ) : null}

      {!isLoading && isError ? (
        <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 p-3">
          <div>
            <p className="text-sm font-medium text-amber-800">Listado Viator no disponible</p>
            <p className="mt-0.5 text-xs text-amber-700">
              Ejecuta{" "}
              <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">
                python -m scraping.viator.listing_scraper --no-headless
              </code>{" "}
              y comprueba que el endpoint{" "}
              <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">GET /viator/listing</code> esté
              activo en la API.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void refetch();
            }}
            className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {!isLoading && !isError && (!data || data.length === 0) ? (
        <p className="text-sm text-slate-600">
          No hay instantánea del listado Viator. Ejecuta el scraper y reinicia la API si hace falta.
        </p>
      ) : null}

      {!isLoading && !isError && data && data.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((tour) => (
            <ViatorTourCardItem key={tour.url} tour={tour} />
          ))}
        </div>
      ) : null}
    </>
  );
}
