import { useEffect, useRef, useState } from 'react';

/* ── French commune geocoding ──────────────────────────────────────────── */
const geoCache = {};

async function geocode(city, postalCode) {
  const key = `${postalCode}|${city}`;
  if (geoCache[key] !== undefined) return geoCache[key];
  try {
    let url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(city)}&codePostal=${encodeURIComponent(postalCode)}&fields=nom,centre&limit=1`;
    let r = await fetch(url);
    let d = await r.json();
    if (!d.length) {
      r = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(city)}&fields=nom,centre&limit=1`);
      d = await r.json();
    }
    if (!d.length) { geoCache[key] = null; return null; }
    const [lng, lat] = d[0].centre.coordinates;
    const result = { lat, lng, nom: d[0].nom };
    geoCache[key] = result;
    return result;
  } catch {
    geoCache[key] = null;
    return null;
  }
}

/* ── helpers ────────────────────────────────────────────────────────────── */
function markerColor(count, max) {
  const r = max > 0 ? count / max : 0;
  if (r >= 0.75) return '#1E3A8A';
  if (r >= 0.5)  return '#1D4ED8';
  if (r >= 0.25) return '#3B82F6';
  return '#60A5FA';
}
function markerRadius(count, max) {
  return max > 0 ? Math.round(8 + 26 * Math.sqrt(count / max)) : 8;
}

/* ── component ──────────────────────────────────────────────────────────── */
export default function MapInscriptions({ communes = [], scope = 'current' }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const layerRef     = useRef(null);
  const [geocoding, setGeocoding] = useState(false);
  const [missed,    setMissed]    = useState(0);

  /* ── create map once ── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (typeof window === 'undefined' || !window.L) return;

    const L = window.L;

    /* guard against React StrictMode double-invoke */
    if (containerRef.current._leaflet_id) {
      containerRef.current._leaflet_id = undefined;
    }

    const map = L.map(containerRef.current, {
      center: [46.6, 2.3],
      zoom: 6,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    mapRef.current   = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current   = null;
      layerRef.current = null;
    };
  }, []);

  /* ── geocode + draw markers ── */
  useEffect(() => {
    if (!communes.length || !mapRef.current || !layerRef.current) return;
    const L = window.L;
    let cancelled = false;

    setGeocoding(true);
    setMissed(0);
    layerRef.current.clearLayers();

    const max = Math.max(...communes.map((c) => c.count), 1);
    let fail  = 0;

    Promise.all(communes.map(async (c) => {
      const geo = await geocode(c.city, c.postalCode);
      if (cancelled || !geo) { if (!geo) fail++; return; }

      const radius = markerRadius(c.count, max);
      const color  = markerColor(c.count, max);

      const marker = L.circleMarker([geo.lat, geo.lng], {
        radius,
        fillColor: color,
        color: '#ffffff',
        weight: 2,
        fillOpacity: 0.85,
      });

      marker.bindTooltip(
        `<div style="text-align:center;min-width:120px">
          <strong style="font-size:13px">${geo.nom || c.city}</strong><br/>
          <span style="color:#6B7280;font-size:11px">${c.postalCode}</span><br/>
          <span style="font-size:15px;font-weight:700;color:${color}">${c.count}</span>
          <span style="font-size:11px"> inscription${c.count > 1 ? 's' : ''}</span>
        </div>`,
        { permanent: false, direction: 'top', offset: [0, -radius] },
      );

      if (!cancelled && layerRef.current) {
        layerRef.current.addLayer(marker);
      }
    })).then(() => {
      if (!cancelled) {
        setMissed(fail);
        setGeocoding(false);
      }
    });

    return () => { cancelled = true; };
  }, [communes]);

  const total     = communes.reduce((s, c) => s + c.count, 0);
  const nbCommune = communes.length;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>
          📍 Inscriptions par commune
          <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: '#6B7280' }}>
            {scope === 'current' ? '— Année en cours' : '— Global'}
          </span>
        </h3>
        <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
          <span><strong style={{ color: 'var(--amc-primary)' }}>{nbCommune}</strong> commune{nbCommune > 1 ? 's' : ''}</span>
          <span><strong style={{ color: 'var(--amc-primary)' }}>{total}</strong> inscription{total > 1 ? 's' : ''}</span>
          {geocoding && <span style={{ color: '#6B7280', fontStyle: 'italic' }}>Géolocalisation…</span>}
          {!geocoding && missed > 0 && (
            <span style={{ color: '#D97706' }}>{missed} non localisée{missed > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* Map container — explicit dimensions required by Leaflet */}
      <div
        ref={containerRef}
        style={{ height: 440, width: '100%', zIndex: 0 }}
      />

      {/* Detail table */}
      {communes.length > 0 && (
        <div style={{ maxHeight: 200, overflowY: 'auto', borderTop: '1px solid var(--amc-border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--amc-light-bg-2)', zIndex: 1 }}>
              <tr>
                <th style={{ textAlign: 'left',  padding: '6px 12px', fontWeight: 700 }}>Commune</th>
                <th style={{ textAlign: 'left',  padding: '6px 12px', fontWeight: 700 }}>Code postal</th>
                <th style={{ textAlign: 'right', padding: '6px 12px', fontWeight: 700 }}>Inscriptions</th>
              </tr>
            </thead>
            <tbody>
              {communes.map((c, i) => (
                <tr key={`${c.city}-${c.postalCode}`} style={{ background: i % 2 === 0 ? '#fff' : 'var(--amc-light-bg-2)' }}>
                  <td style={{ padding: '4px 12px', fontWeight: 600 }}>{c.city}</td>
                  <td style={{ padding: '4px 12px', color: '#6B7280' }}>{c.postalCode}</td>
                  <td style={{ padding: '4px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--amc-primary)' }}>{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {communes.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: '#6B7280' }}>
          Aucune donnée d'inscription disponible.
        </div>
      )}
    </div>
  );
}
