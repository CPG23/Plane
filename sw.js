const CACHE = 'flugradar-v4';
const API_HOSTS = ['api.adsb.fi','api.airplanes.live','api.adsb.lol','api.adsbdb.com','api.planespotters.net','tile.openstreetmap.org'];
const SHELL = ['./manifest.json', './icon.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

function patchIndex(html) {
  if (!html.includes('FlugRadar') || !html.includes('function classifyAircraft')) return html;

  if (!html.includes('const AIRLINE_INFO')) {
    html = html.replace(/function flag\(iso\) \{[\s\S]*?\n\}/, m => `${m}

const AIRLINE_INFO = {
  RYR:'Ryanair',
  DLH:'Lufthansa',
  EWG:'Eurowings',
  EJU:'easyJet Europe',
  EZY:'easyJet',
  WZZ:'Wizz Air',
  SWR:'Swiss',
  AUA:'Austrian',
  KLM:'KLM',
  AFR:'Air France',
  BAW:'British Airways',
  THY:'Turkish Airlines',
  UAE:'Emirates',
  QTR:'Qatar Airways',
  CFG:'Condor',
  TUI:'TUI fly'
};

function airlineName(ac) {
  const prefix = (ac.callsign || '').trim().slice(0, 3).toUpperCase();
  return AIRLINE_INFO[prefix] || '';
}`);
  }

  if (!html.includes('function aircraftSummary')) {
    html = html.replace(/\nfunction aircraftPhotoBlock\(typeInfo\)/, `
function aircraftSummary(ac) {
  const typeInfo = aircraftTypeInfo(ac);
  const airline = airlineName(ac);
  if (airline && typeInfo.code) return `${airline} · ${typeInfo.name}`;
  if (typeInfo.code) return `✈️ ${typeInfo.name}`;
  if (airline) return airline;
  return classifyAircraft(ac);
}

function aircraftPhotoBlock(typeInfo)`);
  }

  html = html.replace(
    /if \(cat === 'A1' \|\| cat === 'A2'\) return '[^']*Privatflugzeug';\n\n  return '[^']*Kleinflugzeug';/,
    `if (cat === 'A1' || cat === 'A2') return '🛩️ Privatflugzeug';

  if (typeof TYPE_INFO !== 'undefined' && TYPE_INFO[type]) return `✈️ ${TYPE_INFO[type].name}`;

  if (/^(A3|A2|A1|A5|B7|B3|B8|E17|E19|CRJ|DH8|AT7|SU9|BCS|MD8|MD9|F70|F90)/.test(type))
    return '✈️ Verkehrsflugzeug';

  return '🛩️ Kleinflugzeug';`
  );

  html = html.replace("if (ac.route === null) return `<span class=\"plane-lbl\">${esc(classifyAircraft(ac))}</span>`;", "if (ac.route === null) return `<span class=\"plane-lbl\">${esc(aircraftSummary(ac))}</span>`;");
  html = html.replace(": r0 === null ? classifyAircraft(ac)", ": r0 === null ? (airlineName(ac) || aircraftSummary(ac))");
  html = html.replace("// Keine Route gefunden – Flugzeug klassifizieren\n    l2.textContent = classifyAircraft(ac);", "// Keine Route gefunden – trotzdem Airline und Flugzeugtyp anzeigen, wenn erkennbar\n    const airline = airlineName(ac);\n    if (airline) l1.textContent = `${airline} ${ac.callsign}`;\n    l2.textContent = aircraftSummary(ac);");

  return html;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request, { cache: 'no-store' });
    if (res.ok && res.status < 300) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch {
    return (await cache.match(request)) || fetch(request);
  }
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (API_HOSTS.some(h => url.hostname.includes(h))) return;

  const acceptsHtml = e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html');
  if (acceptsHtml || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
    e.respondWith((async () => {
      const res = await fetch(e.request, { cache: 'no-store' });
      const html = await res.text();
      return new Response(patchIndex(html), {
        status: res.status,
        statusText: res.statusText,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
      });
    })().catch(() => networkFirst(e.request)));
    return;
  }

  e.respondWith(networkFirst(e.request));
});
