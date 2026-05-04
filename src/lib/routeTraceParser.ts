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
  return ensureLineString(fc);
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
  let kmlFile =
    entries.find((f) => /(^|\/)doc\.kml$/i.test(f.name)) ||
    entries.find((f) => f.name.toLowerCase().endsWith('.kml'));
  if (!kmlFile) throw new Error('El KMZ no contiene un archivo .kml interno');
  const text = await kmlFile.async('text');
  return parseKmlString(text);
}

export async function parseRouteTraceFile(file: File): Promise<ParsedTrace> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.kmz')) return parseKmz(file);
  const text = await file.text();
  if (name.endsWith('.kml')) return parseKmlString(text);
  if (name.endsWith('.gpx')) return parseGpxString(text);
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
