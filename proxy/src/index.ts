// Cloud-Proxy: versteckt die API-Schlüssel, gibt STT-Kurzzeit-Token aus, hält die Sitzung
// (Durable Object) und liefert Decks aus, die der Lernbegleiter hochgeladen hat.
//
//   POST /token                 {provider}             App-Schlüssel   → {token}
//   GET  /ws?session=&key=      WebSocket zur Sitzung   App-Schlüssel
//   GET  /log/:session                                  Pi-Schlüssel    → JSON-Zeilen
//   PUT  /decks/:id/:file                               Pi-Schlüssel    (deck.json, slides/NNN.png)
//   GET  /decks/:id/:file                               App-/Pi-Schlüssel (Handouts sind Material der Dozenten)
//   PUT  /profile                                       Pi-Schlüssel    (profile.md)
import type { Env } from "./env.ts";
import { HttpError, sttToken } from "./token.ts";

export { LectureSession } from "./session.ts";

function cors(env: Env): Record<string, string> {
  return {
    "access-control-allow-origin": env.ALLOWED_ORIGIN ?? "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
  };
}

function json(env: Env, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors(env) } });
}

/** Vergleich in konstanter Zeit, damit der Schlüssel nicht über Antwortzeiten erraten wird. */
function same(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function bearer(req: Request): string {
  return (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
}

function requireKey(env: Env, key: string, ...allowed: (keyof Env)[]): void {
  if (!allowed.some((k) => same(key, String(env[k] ?? "")))) throw new HttpError(401, "Schlüssel fehlt oder falsch");
}

const SAFE = /^[a-z0-9][a-z0-9_.-]{0,80}$/i;

export async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(env) });

  if (path === "/health") return json(env, { ok: true });

  if (path === "/token" && req.method === "POST") {
    requireKey(env, bearer(req), "APP_KEY");
    const { provider } = (await req.json()) as { provider?: string };
    return json(env, await sttToken(env, provider ?? "assemblyai"));
  }

  if (path === "/ws") {
    requireKey(env, url.searchParams.get("key") ?? "", "APP_KEY");
    const session = url.searchParams.get("session") ?? "";
    if (!SAFE.test(session)) throw new HttpError(400, "Ungültige Sitzung");
    if (req.headers.get("upgrade") !== "websocket") throw new HttpError(426, "WebSocket erwartet");
    const stub = env.SESSIONS.get(env.SESSIONS.idFromName(session));
    return stub.fetch(req);
  }

  const logMatch = /^\/log\/([^/]+)$/.exec(path);
  if (logMatch && req.method === "GET") {
    requireKey(env, bearer(req), "PI_KEY", "APP_KEY");
    const session = decodeURIComponent(logMatch[1]!);
    if (!SAFE.test(session)) throw new HttpError(400, "Ungültige Sitzung");
    const stub = env.SESSIONS.get(env.SESSIONS.idFromName(session));
    const res = await stub.fetch(new Request(`https://session/${session}/log`));
    return new Response(res.body, { headers: { ...Object.fromEntries(res.headers), ...cors(env) } });
  }

  if (path === "/profile" && req.method === "PUT") {
    requireKey(env, bearer(req), "PI_KEY");
    if (!env.DECKS) throw new HttpError(501, "KV DECKS nicht eingerichtet");
    await env.DECKS.put("profile.md", await req.text());
    return json(env, { ok: true });
  }

  const deckMatch = /^\/decks\/([^/]+)\/(deck\.json|transcript\.txt|slides\/[0-9]{1,4}\.(?:png|webp))$/.exec(path);
  if (deckMatch) {
    const [, id, file] = deckMatch;
    if (!SAFE.test(id!)) throw new HttpError(400, "Ungültige Deck-ID");
    const key = `deck:${id}/${file}`;
    if (req.method === "PUT") {
      requireKey(env, bearer(req), "PI_KEY");
      if (!env.DECKS) throw new HttpError(501, "KV DECKS nicht eingerichtet");
      await env.DECKS.put(key, await req.arrayBuffer(), { metadata: { type: req.headers.get("content-type") ?? "application/octet-stream" } });
      return json(env, { ok: true, key });
    }
    if (req.method === "GET" && env.ASSETS) {
      // Mitgelieferte Decks (app/public/decks, z. B. die synthetische Demo) sind öffentlich wie die App selbst.
      // Hochgeladene Handouts liegen nur in KV und brauchen weiter einen Schlüssel.
      const asset = await env.ASSETS.fetch(req);
      if (asset.ok) return asset;
    }
    if (req.method === "GET" && env.DECKS) {
      requireKey(env, bearer(req), "APP_KEY", "PI_KEY");
      const hit = await env.DECKS.getWithMetadata<{ type: string }>(key, "arrayBuffer");
      if (hit.value) {
        const immutable = file!.startsWith("slides/");
        return new Response(hit.value, {
          headers: {
            "content-type": hit.metadata?.type ?? "application/octet-stream",
            "cache-control": immutable ? "private, max-age=604800" : "no-cache",
            ...cors(env),
          },
        });
      }
    }
  }

  if (env.ASSETS && req.method === "GET") return env.ASSETS.fetch(req);
  return json(env, { error: "nicht gefunden" }, 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await handle(req, env);
    } catch (e) {
      if (e instanceof HttpError) return json(env, { error: e.message }, e.status);
      console.error(e);
      return json(env, { error: "interner Fehler" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
