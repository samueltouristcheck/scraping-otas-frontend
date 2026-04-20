/** Fecha calendario local YYYY-MM-DD desde un instante ISO (p. ej. agrupar tendencia Viator por día de captura). */
export function utcIsoToLocalDateKey(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatUtcToLocal(value: string | null): string {
  if (!value) return "N/D";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "N/D";
  }

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
