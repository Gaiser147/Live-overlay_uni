// Kurzzeit-Token für die Streaming-Transkription. Die API-Schlüssel bleiben im Worker.

export interface TokenEnv {
  ASSEMBLYAI_API_KEY?: string;
  DEEPGRAM_API_KEY?: string;
}

export async function sttToken(env: TokenEnv, provider: string, fetcher: typeof fetch = fetch): Promise<{ token: string; expiresIn: number }> {
  if (provider === "assemblyai") {
    if (!env.ASSEMBLYAI_API_KEY) throw new HttpError(501, "ASSEMBLYAI_API_KEY fehlt");
    const res = await fetcher("https://token.assemblyai.com/v1/token", {
      method: "POST",
      headers: { authorization: env.ASSEMBLYAI_API_KEY, "content-type": "application/json" },
      // Das Token muss innerhalb von 60 s eingelöst werden; die Sitzung darf bis 3 h laufen.
      body: JSON.stringify({ product: "streaming", expires_in_seconds: 60, max_session_duration_seconds: 10_800 }),
    });
    if (!res.ok) throw new HttpError(502, `AssemblyAI: ${res.status}`);
    const j = (await res.json()) as { token: string; expires_in_seconds: number };
    return { token: j.token, expiresIn: j.expires_in_seconds };
  }
  if (provider === "deepgram") {
    if (!env.DEEPGRAM_API_KEY) throw new HttpError(501, "DEEPGRAM_API_KEY fehlt");
    const res = await fetcher("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: { authorization: `Token ${env.DEEPGRAM_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ ttl_seconds: 60 }),
    });
    if (!res.ok) throw new HttpError(502, `Deepgram: ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    return { token: j.access_token, expiresIn: j.expires_in };
  }
  throw new HttpError(400, `Unbekannter Anbieter: ${provider}`);
}

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
