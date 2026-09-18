/**
 * Busca de GIFs na API do GIPHY, para o cadastro de emoji personalizado não
 * depender de o usuário achar uma URL na mão. Precisa de uma chave (grátis em
 * developers.giphy.com) em `VITE_GIPHY_API_KEY`; sem ela a busca fica
 * desligada e a modal avisa. A chave vai na query string — é uma chave
 * pública de cliente por natureza, não um segredo.
 *
 * Só este arquivo conhece o provedor: trocar de API é reescrever `giphy()` e
 * manter o tipo `GifResult`.
 */
const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY ?? '';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

export const GIF_SEARCH_ENABLED = GIPHY_API_KEY.length > 0;
export const GIF_PROVIDER_NAME = 'GIPHY';

export type GifResult = {
  id: string;
  title: string;
  /** Versão pequena, só para a grade de resultados. */
  previewUrl: string;
  /** Versão que vira a URL do emoji: `fixed_height_small` (100px de altura) — mais que suficiente para 1.4em e bem mais leve que o original. */
  url: string;
  width: number;
  height: number;
};

type GiphyImage = { url: string; width: string; height: string };
type GiphyResponse = {
  data: {
    id: string;
    title: string;
    images: { fixed_height_small?: GiphyImage; fixed_width_small?: GiphyImage };
  }[];
};

async function giphy(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<GifResult[]> {
  const query = new URLSearchParams({ api_key: GIPHY_API_KEY, rating: 'pg-13', ...params });
  const res = await fetch(`${GIPHY_BASE}/${path}?${query}`, { signal });
  if (!res.ok) throw new Error(`GIPHY respondeu ${res.status}`);
  const body = (await res.json()) as GiphyResponse;

  return body.data.flatMap((item) => {
    const small = item.images.fixed_height_small;
    if (!small) return [];
    return [
      {
        id: item.id,
        title: item.title,
        previewUrl: item.images.fixed_width_small?.url ?? small.url,
        url: small.url,
        width: Number(small.width),
        height: Number(small.height),
      },
    ];
  });
}

/** GIFs em alta — o que a busca mostra antes de o usuário digitar. */
export function featuredGifs(limit = 24, signal?: AbortSignal) {
  return giphy('trending', { limit: String(limit) }, signal);
}

export function searchGifs(q: string, limit = 24, signal?: AbortSignal) {
  return giphy('search', { q, limit: String(limit) }, signal);
}
