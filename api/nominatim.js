export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const q = String(req.query.q || '').trim();
  const viewbox = String(req.query.viewbox || '').trim();
  if (!q) return res.status(400).json({ error: 'missing q' });

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '30');
  url.searchParams.set('accept-language', 'ja');
  url.searchParams.set('addressdetails', '0');
  if (viewbox) {
    url.searchParams.set('viewbox', viewbox);
    url.searchParams.set('bounded', '1');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'kimon-app/1.0 (https://kimon-app-new.vercel.app/)',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) {
      return res.status(502).json({ error: 'nominatim upstream', status: response.status });
    }
    const json = await response.json();
    res.setHeader('Cache-Control', 's-maxage=300');
    return res.status(200).json(json);
  } catch {
    clearTimeout(timer);
    return res.status(502).json({ error: 'nominatim failed' });
  }
}
