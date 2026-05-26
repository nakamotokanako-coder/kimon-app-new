const UPSTREAMS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function readBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (req.body?.data) return req.body.data;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const query = await readBody(req);
  if (!query.trim()) {
    return res.status(400).json({ error: 'empty overpass query' });
  }

  for (const url of UPSTREAMS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      console.error('[overpass] trying', url, 'querylen', query.length);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'kimon-app/1.0 (kimon-app-new.vercel.app)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) {
        console.error('[overpass] upstream not ok', url, response.status);
        continue;
      }
      const json = await response.json();
      res.setHeader('Cache-Control', 's-maxage=300');
      return res.status(200).json(json);
    } catch (e) {
      clearTimeout(timer);
      console.error('[overpass] upstream threw', url, e?.name, e?.message);
    }
  }

  console.error('[overpass] all upstreams failed');
  return res.status(502).json({ error: 'overpass upstream failed' });
}
