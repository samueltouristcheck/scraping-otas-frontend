import type { ViatorTourCard } from "@/types/market";

interface ViatorTourCardItemProps {
  tour: ViatorTourCard;
}

export function ViatorTourCardItem({ tour }: ViatorTourCardItemProps) {
  const price = tour.price_eur !== null ? Number(tour.price_eur) : null;
  const rating = tour.rating !== null ? Number(tour.rating) : null;
  const reviews = tour.reviews !== null ? Number(tour.reviews) : null;

  return (
    <article className="flex flex-col justify-between rounded-md border border-slate-200 bg-slate-50 p-3 transition-shadow hover:shadow-md">
      <div>
        <div className="mb-1.5 flex flex-wrap gap-1">
          {tour.badges.map((badge) => (
            <BadgeChip key={badge} label={badge} />
          ))}
        </div>

        <a
          href={tour.url}
          target="_blank"
          rel="noreferrer"
          className="block text-sm font-semibold leading-snug text-slate-800 hover:text-blue-700 hover:underline"
        >
          {tour.name}
        </a>

        {tour.duration ? <p className="mt-1 text-xs text-slate-500">{tour.duration}</p> : null}

        {rating !== null || reviews !== null ? (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600">
            {rating !== null ? (
              <span className="flex items-center gap-0.5 font-medium text-amber-600">★ {rating.toFixed(1)}</span>
            ) : null}
            {reviews !== null ? (
              <span className="text-slate-400">({reviews.toLocaleString("es-ES")} opiniones)</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between">
        {price !== null ? (
          <span className="text-base font-bold text-slate-900">desde {price} €</span>
        ) : (
          <span className="text-xs text-slate-400">Sin precio</span>
        )}
        <a
          href={tour.url}
          target="_blank"
          rel="noreferrer"
          className="rounded bg-[#172753] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
        >
          Ver en Viator
        </a>
      </div>
    </article>
  );
}

interface BadgeChipProps {
  label: string;
}

function BadgeChip({ label }: BadgeChipProps) {
  const isPopular =
    label.toLowerCase().includes("best seller") ||
    label.toLowerCase().includes("bestseller") ||
    label.toLowerCase().includes("likely to sell");

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
        isPopular ? "bg-orange-100 text-orange-700" : "bg-slate-200 text-slate-600"
      }`}
    >
      {label}
    </span>
  );
}
