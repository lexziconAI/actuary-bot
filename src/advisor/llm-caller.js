// src/advisor/llm-caller.js
// Direct Cerebras API — Regex God pattern for structured extraction

const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';

async function callCerebras(messages, options = {}) {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    return { content: '', fallback: true };
  }

  const body = {
    model: options.model || 'gpt-oss-120b',
    messages,
    temperature: options.temperature ?? 0.5,
    max_tokens: options.max_tokens ?? 800,
  };

  try {
    const res = await fetch(CEREBRAS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeout || 12000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[Advisor LLM] Cerebras ${res.status}: ${text.slice(0, 200)}`);
      return { content: '', error: true };
    }

    const data = await res.json();
    return { content: data.choices?.[0]?.message?.content || '' };
  } catch (e) {
    console.error('[Advisor LLM] Failed:', e.message);
    return { content: '', error: true };
  }
}

async function regexGodExtract(systemPrompt, userText) {
  const result = await callCerebras([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userText },
  ], { temperature: 0.1, max_tokens: 600, timeout: 6000 });

  if (result.error || result.fallback || !result.content) return {};

  const extracted = {};
  const tagRegex = /<([A-Z_]+)>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = tagRegex.exec(result.content)) !== null) {
    extracted[match[1]] = match[2].trim();
  }
  return extracted;
}

export { callCerebras, regexGodExtract };
