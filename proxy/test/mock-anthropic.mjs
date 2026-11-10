// Winziger Ersatz für die Messages-API, nur für den lokalen Integrationstest (wrangler dev).
import http from "node:http";

const port = Number(process.argv[2] ?? 8787 + 100);
const calls = [];
http
  .createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    if (req.url === "/calls") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(calls));
    }
    const j = JSON.parse(body || "{}");
    calls.push({ path: req.url, model: j.model, beta: req.headers["anthropic-beta"] ?? null, fallbacks: j.fallbacks ?? null, system: (j.system ?? []).map((b) => ({ cached: Boolean(b.cache_control), len: b.text.length })), thinking: j.thinking ?? null, format: j.output_config?.format?.type ?? null });
    const user = JSON.stringify(j.messages ?? []);
    let text;
    if (j.output_config?.format?.schema?.properties?.type) {
      text = /Schatten/.test(user)
        ? JSON.stringify({ type: "note", text: "Projektion = Schatten, wenn das Licht genau von oben kommt.", confidence: 0.86 })
        : JSON.stringify({ type: "none", text: "", confidence: 0.9 });
    } else if (j.output_config?.format?.schema?.properties?.n) {
      text = JSON.stringify({ n: 7, confidence: 0.8 });
    } else {
      text = /Faden verloren/.test(user) ? "Linear heißt: Summen bleiben erhalten.\nDer Kern ist alles, was auf 0 landet.\nProjektion: y wird 0." : "Der Kern sammelt alle v mit f(v) = 0. Jetzt du: Prüf (0; 3) bei der Projektion.";
    }
    res.writeHead(200, { "content-type": "application/json", "request-id": "req_mock" });
    res.end(
      JSON.stringify({
        id: "msg_mock",
        type: "message",
        role: "assistant",
        model: j.model,
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 812, output_tokens: 40, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 },
      }),
    );
  })
  .listen(port, "127.0.0.1", () => console.log(`mock on ${port}`));
