// deck.json laden, Bildpfade auflösen, Bilder vorladen (danach läuft alles offline).
import { validateDeck, type Deck } from "../../shared/deck.ts";

export interface LoadedDeck {
  deck: Deck;
  url: string;
  imageUrl(n: number): string | null;
  problems: string[];
  /** Header für geschützte Decks vom Proxy. */
  headers: Record<string, string>;
}

/**
 * Lädt deck.json. Decks vom Proxy sind geschützt (Handouts sind Material der Dozenten):
 * dann wird der App-Schlüssel mitgeschickt und die Bilder werden als Blob geladen.
 */
export async function loadDeck(url: string, proxy?: { url: string; key: string }): Promise<LoadedDeck> {
  const abs = new URL(url, location.href).toString();
  const fromProxy = Boolean(proxy?.url && proxy.key && abs.startsWith(new URL(proxy.url).origin));
  const headers: Record<string, string> = fromProxy ? { authorization: `Bearer ${proxy!.key}` } : {};
  const res = await fetch(abs, { cache: "no-cache", headers });
  if (res.status === 401) throw new Error("Der Proxy-Schlüssel passt nicht zu diesem Deck.");
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) throw new Error("Unter dieser Adresse liegt keine deck.json.");
  const deck = (await res.json()) as Deck;
  const problems = validateDeck(deck).map((p) => (p.n ? `Folie ${p.n}: ${p.problem}` : p.problem));
  const images = new Map<number, string>();
  for (const s of deck.slides) if (s.image) images.set(s.n, new URL(s.image, abs).toString());
  return { deck, url: abs, imageUrl: (n) => images.get(n) ?? null, problems, headers };
}

/**
 * Lädt alle Folienbilder vorab (landen im Service-Worker-Cache), damit die App ohne Netz
 * weiterläuft. Bei geschützten Decks werden die Bild-URLs durch Blob-URLs ersetzt.
 */
export async function preloadImages(d: LoadedDeck): Promise<number> {
  let ok = 0;
  const blobs = new Map<number, string>();
  await Promise.all(
    d.deck.slides.map(async (s) => {
      const u = d.imageUrl(s.n);
      if (!u) return;
      try {
        const res = await fetch(u, { headers: d.headers });
        if (!res.ok) return;
        if (Object.keys(d.headers).length) blobs.set(s.n, URL.createObjectURL(await res.blob()));
        ok++;
      } catch {
        /* einzelnes Bild fehlt: Folie wird dann als Text gezeigt */
      }
    }),
  );
  if (blobs.size) {
    const orig = d.imageUrl;
    d.imageUrl = (n) => blobs.get(n) ?? orig(n);
  }
  return ok;
}
