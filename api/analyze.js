// Vercel serverless function — put this file at: api/analyze.js
// Needs ANTHROPIC_API_KEY set in Vercel → Settings → Environment Variables

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { image, mediaType, text } = body || {};

    let userContent;
    if (image) {
      userContent = [
        { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
        { type: 'text', text: 'Here is the letter. Explain it.' }
      ];
    } else if (text) {
      userContent = [{ type: 'text', text: 'Here is the text of an official letter:\n\n' + text }];
    } else {
      return res.status(400).json({ error: 'No letter received' });
    }

    const system = `You are a kind assistant that helps people — often elderly or unfamiliar with bureaucratic language — understand official letters (fines, taxes, letters from government offices, the bank, etc.) from ANY country.

First, detect the language of the letter. Then explain it SIMPLY and reassuringly IN THE SAME LANGUAGE as the letter, the way you would explain it to your grandmother. Use easy words and short sentences.

Respond ONLY with a valid JSON object, with no other text before or after, with exactly these fields. Write the VALUES in the same language as the letter:
{
  "titolo": "what kind of letter it is, in 3-6 simple words",
  "cosa_e": "a simple explanation of what this letter is, 1-2 sentences",
  "cosa_fare": "what the person must concretely do, clear and direct",
  "scadenza": "the date or period by which to act (e.g. 'by 15 July 2026' or '30 days'), or the equivalent of 'No deadline' in the letter's language if there is none",
  "importo": "if there is an amount to pay, write it with the currency (e.g. '120 EUR'); otherwise write exactly '—'",
  "come_fare": "how to do it in practice: where to go, which website, which office, how to pay",
  "urgenza": "ALWAYS exactly one of these three words: alta, media, bassa (do NOT translate this field)"
}

Never invent information. If something is not in the letter, write the equivalent of 'Not specified in the letter' in the letter's language.`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', // accurate at reading documents. For lower cost: 'claude-haiku-4-5-20251001'
        max_tokens: 1200,
        system,
        messages: [{ role: 'user', content: userContent }]
      })
    });

    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message || 'API error' });

    const out = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

    let parsed = null;
    try { parsed = JSON.parse(out.replace(/```json/gi, '').replace(/```/g, '').trim()); } catch (e) { parsed = null; }

    return res.status(200).json({ result: parsed, raw: parsed ? null : out });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
