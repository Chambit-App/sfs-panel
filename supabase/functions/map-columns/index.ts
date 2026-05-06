// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface MapRequest {
  headers: string[];
  sampleRows: string[][];
  targetFields: { key: string; label: string; required: boolean }[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ error: "missing_api_key", message: "ANTHROPIC_API_KEY secret is not set on the project." }, 500);
  }

  let body: MapRequest;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!Array.isArray(body.headers) || body.headers.length === 0) return json({ error: "headers_required" }, 400);
  if (!Array.isArray(body.targetFields) || body.targetFields.length === 0) return json({ error: "target_fields_required" }, 400);

  const headersStr = body.headers.map((h, i) => `[${i}] ${h || "(boş)"}`).join("\n");
  const samples = (body.sampleRows ?? [])
    .slice(0, 3)
    .map((row, ri) => `Satır ${ri + 1}: ${row.map((c, i) => `[${i}]=${(c ?? "").toString().slice(0, 40)}`).join(" | ")}`)
    .join("\n");
  const fieldList = body.targetFields.map(f => `- ${f.key} (${f.label})${f.required ? " *zorunlu" : ""}`).join("\n");

  const properties: Record<string, any> = {};
  const reasoningProperties: Record<string, any> = {};
  for (const f of body.targetFields) {
    properties[f.key] = { type: ["integer", "null"], description: `${f.label} alanına denk gelen Excel kolon indeksi (0-tabanlı). Eşleşme yoksa null.` };
    reasoningProperties[f.key] = { type: "string", description: `${f.label} için kısa gerekçe.` };
  }
  const schema = {
    type: "object",
    properties: {
      mapping: { type: "object", properties, required: body.targetFields.map(f => f.key), additionalProperties: false },
      reasoning: { type: "object", properties: reasoningProperties, required: body.targetFields.map(f => f.key), additionalProperties: false },
    },
    required: ["mapping", "reasoning"],
    additionalProperties: false,
  };

  const systemPrompt = `Sen bir Türkçe muhasebe yazılımı için Excel/CSV kolon eşleştirme uzmanısın. Türkçe muhasebe terimlerini ve kısaltmaları (Fat. No, Fat. Tarihi, Vade Tarihi, Vade/Gün, Tahsil Edilecek Tutar, Firma Adı, Cari, Müşteri, Tedarikçi, Durumu vb.) tanırsın. Kolon başlığı belirsizse örnek satır değerlerine bak (tarih mi, sayı mı, metin mi). Emin değilsen null döndür — yanlış eşleştirme yapma.`;
  const userPrompt = `Hedef alanlar:\n${fieldList}\n\nExcel kolonları:\n${headersStr}\n\nÖrnek satırlar:\n${samples || "(yok)"}\n\nHer hedef için en uygun kolon indeksini bul. Mantıklı eşleşme yoksa null.`;

  const apiBody = {
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
    output_config: { format: { type: "json_schema", schema } },
  };

  let resp: Response;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(apiBody),
    });
  } catch (err) {
    return json({ error: "upstream_fetch_failed", message: (err as Error).message }, 502);
  }
  if (!resp.ok) {
    const text = await resp.text();
    return json({ error: "upstream_error", status: resp.status, body: text }, 502);
  }
  const data = await resp.json();
  const block = (data.content ?? []).find((b: any) => b.type === "text");
  if (!block) return json({ error: "no_text_block", raw: data }, 502);
  let parsed: any;
  try { parsed = JSON.parse(block.text); } catch { return json({ error: "parse_failed", raw: block.text }, 502); }

  return json({ mapping: parsed.mapping, reasoning: parsed.reasoning, usage: data.usage ?? null, model: data.model ?? null });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}
