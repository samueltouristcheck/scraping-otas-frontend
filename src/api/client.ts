const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

if (!API_BASE_URL) {
  throw new Error("Falta VITE_API_BASE_URL. Defínela en el archivo .env del frontend.");
}

function joinBase(path: string): string {
  const base = API_BASE_URL!.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export async function apiFetch<TResponse>(
  path: string,
  init?: RequestInit,
  errorLabel?: string,
): Promise<TResponse> {
  const url = joinBase(path);

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `${errorLabel ?? "Network error"}: ${msg}. ` +
        "En Vercel, VITE_API_BASE_URL debe ser la URL absoluta del backend (p. ej. https://tu-api.onrender.com/api/v1), no solo /api/v1.",
    );
  }

  const text = await response.text();

  if (!response.ok) {
    const hint = errorLabel ?? `HTTP ${response.status}`;
    throw new Error(`${hint}: ${text.slice(0, 500) || response.statusText} (${url})`);
  }

  try {
    return JSON.parse(text) as TResponse;
  } catch {
    throw new Error(
      `La API no devolvió JSON válido desde ${url}. Primeros caracteres: ${text.slice(0, 180)}. ` +
        "Comprueba VITE_API_BASE_URL en Vercel (debe incluir https://… y terminar en /api/v1).",
    );
  }
}
