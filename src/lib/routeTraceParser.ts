// Parses route trace files (KML/KMZ/GPX/GeoJSON) into a GeoJSON FeatureCollection
// with at least one LineString feature, suitable for storage in productos.route_geojson.
import { kml, gpx } from '@tmcw/togeojson';
import JSZip from 'jszip';

export interface ParsedTrace {
  geojson: any;
  lineCount: number;
  pointCount: number;
}

function ensureLineString(fc: any): ParsedTrace {
  if (!fc || !Array.isArray(fc.features)) {
    throw new Error('Archivo sin geometrías válidas');
  }
  const lines = fc.features.filter(
    (f: any) =>
      f?.geometry?.type === 'LineString' || f?.geometry?.type === 'MultiLineString'
  );
  if (lines.length === 0) {
    // Try to build a LineString from Points if there are several
    const points = fc.features.filter((f: any) => f?.geometry?.type === 'Point');
    if (points.length >= 2) {
      const coords = points.map((p: any) => p.geometry.coordinates);
      const synthesized = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { synthesized: true },
            geometry: { type: 'LineString', coordinates: coords },
          },
          ...points,
        ],
      };
      return { geojson: synthesized, lineCount: 1, pointCount: points.length };
    }
    throw new Error('El archivo no contiene un trazado de ruta (LineString)');
  }
  const pointCount = fc.features.filter((f: any) => f?.geometry?.type === 'Point').length;
  return { geojson: fc, lineCount: lines.length, pointCount };
}

function parseXmlOrThrow(text: string): Document {
  const dom = new DOMParser().parseFromString(text, 'text/xml');
  const err = dom.getElementsByTagName('parsererror')[0];
  if (err) {
    console.error('[routeTraceParser] XML parse error:', err.textContent);
    throw new Error('XML inválido dentro del archivo');
  }
  return dom;
}

async function parseKmlString(text: string): Promise<ParsedTrace> {
  const dom = parseXmlOrThrow(text);
  const fc = kml(dom);
  console.log('[routeTraceParser] KML features:', fc?.features?.length);
  try {
    return ensureLineString(fc);
  } catch (error) {
    const fallback = parseCoordinateBlocks(dom);
    if (fallback) return fallback;
    throw error;
  }
}

function parseCoordinateBlocks(dom: Document): ParsedTrace | null {
  // Recolectar puntos en orden de aparición en el DOM, asociando el nombre del Placemark
  const placemarks = Array.from(dom.getElementsByTagName('Placemark'));
  const orderedPoints: Array<{ name: string; lng: number; lat: number }> = [];
  const lineFeatures: any[] = [];

  const parseTuples = (raw: string): number[][] =>
    raw
      .trim()
      .split(/\s+/)
      .map((t) => t.split(',').map(Number))
      .filter((t) => t.length >= 2 && Number.isFinite(t[0]) && Number.isFinite(t[1]))
      .map(([lng, lat]) => [lng, lat]);

  placemarks.forEach((pm, idx) => {
    const nameEl = pm.getElementsByTagName('name')[0];
    const name = nameEl?.textContent?.trim() || `Punto ${idx + 1}`;
    const coordsEls = Array.from(pm.getElementsByTagName('coordinates'));
    coordsEls.forEach((c) => {
      const tuples = parseTuples(c.textContent || '');
      if (tuples.length >= 2) {
        lineFeatures.push({
          type: 'Feature',
          properties: { name, parsedBy: 'coordinates-fallback' },
          geometry: { type: 'LineString', coordinates: tuples },
        });
      } else if (tuples.length === 1) {
        orderedPoints.push({ name, lng: tuples[0][0], lat: tuples[0][1] });
      }
    });
  });

  // Si encontramos líneas explícitas, devolverlas
  if (lineFeatures.length > 0) {
    const features = [...lineFeatures];
    if (orderedPoints.length > 0) {
      orderedPoints.forEach((p) =>
        features.push({
          type: 'Feature',
          properties: { name: p.name },
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        })
      );
    }
    return {
      geojson: { type: 'FeatureCollection', features },
      lineCount: lineFeatures.length,
      pointCount: orderedPoints.length,
    };
  }

  // Si no hay líneas, pero sí >=2 puntos (caso Google My Maps con Placemarks Point),
  // los unimos como una LineString sintetizada en su orden natural (Point 1, Point 2...)
  if (orderedPoints.length >= 2) {
    // Intentar ordenar numéricamente por nombre si todos llevan número (Point 1, Point 2...)
    const numbered = orderedPoints
      .map((p) => ({ ...p, n: parseInt((p.name.match(/\d+/) || ['0'])[0], 10) }))
      .sort((a, b) => a.n - b.n);
    const useNumbered = numbered.every((p) => p.n > 0);
    const finalPoints = useNumbered ? numbered : orderedPoints;
    const coords = finalPoints.map((p) => [p.lng, p.lat]);
    const features: any[] = [
      {
        type: 'Feature',
        properties: { synthesized: true, source: 'points-to-line' },
        geometry: { type: 'LineString', coordinates: coords },
      },
      ...finalPoints.map((p) => ({
        type: 'Feature',
        properties: { name: p.name },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      })),
    ];
    return {
      geojson: { type: 'FeatureCollection', features },
      lineCount: 1,
      pointCount: finalPoints.length,
    };
  }

  return null;
}

async function parseGpxString(text: string): Promise<ParsedTrace> {
  const dom = parseXmlOrThrow(text);
  const fc = gpx(dom);
  return ensureLineString(fc);
}

async function parseKmz(file: File): Promise<ParsedTrace> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  console.log('[routeTraceParser] KMZ contents:', entries.map((e) => e.name));
  // Prefer doc.kml at root, then any .kml
  const kmlFile =
    entries.find((f) => /(^|\/)doc\.kml$/i.test(f.name)) ||
    entries.find((f) => f.name.toLowerCase().endsWith('.kml'));
  if (!kmlFile) throw new Error('El KMZ no contiene un archivo .kml interno');
  const text = await kmlFile.async('text');
  return parseKmlString(text);
}

export async function parseRouteTraceFile(file: File): Promise<ParsedTrace> {
  const name = file.name.toLowerCase();
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const looksLikeZip = header[0] === 0x50 && header[1] === 0x4b;
  if (name.endsWith('.kmz') || looksLikeZip) return parseKmz(file);
  const text = await file.text();
  const looksLikeKml = /<\s*kml[\s>]/i.test(text) || /<\s*Document[\s>]/i.test(text);
  const looksLikeGpx = /<\s*gpx[\s>]/i.test(text);
  if (name.endsWith('.kml') || name.endsWith('.xml') || looksLikeKml) {
    return parseKmlString(text);
  }
  if (name.endsWith('.gpx') || looksLikeGpx) return parseGpxString(text);
  if (name.endsWith('.geojson') || name.endsWith('.json')) {
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('GeoJSON inválido');
    }
    // Wrap a single Feature or Geometry into a FeatureCollection
    if (parsed?.type === 'Feature') {
      parsed = { type: 'FeatureCollection', features: [parsed] };
    } else if (parsed?.type && parsed?.coordinates) {
      parsed = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: parsed }],
      };
    }
    return ensureLineString(parsed);
  }
  throw new Error('Formato no soportado. Usa KML, KMZ, GPX o GeoJSON.');
}
