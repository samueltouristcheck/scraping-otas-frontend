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
