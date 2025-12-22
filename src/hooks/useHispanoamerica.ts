import { useState, useEffect, useCallback, useMemo } from 'react';
import { PAISES_HISPANOAMERICA, PaisHispano } from '@/data/paises-hispanoamerica';

interface CiudadData {
  pais: string;
  codigo_iso: string;
  nivel1_nombre: string;
  nivel1: string;
  nivel2_nombre: string;
  nivel2: string;
}

type HispanoData = Record<string, Record<string, string[]>>; // pais -> nivel1 -> nivel2[]

let cachedData: HispanoData | null = null;
let loadingPromise: Promise<HispanoData> | null = null;

const loadCSVData = async (): Promise<HispanoData> => {
  if (cachedData) return cachedData;
  
  if (loadingPromise) return loadingPromise;
  
  loadingPromise = fetch('/data/ciudades-hispanoamerica.csv')
    .then(res => res.text())
    .then(csvText => {
      const lines = csvText.trim().split('\n');
      const data: HispanoData = {};
      
      // Skip header
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        // Parse CSV line (simple parser for this format)
        const parts = line.split(',').map(p => p.trim());
        if (parts.length < 6) continue;
        
        const [pais, codigoIso, nivel1Tipo, nivel1Nombre, nivel2Tipo, nivel2Nombre] = parts;
        
        if (!data[codigoIso]) {
          data[codigoIso] = {};
        }
        
        if (!data[codigoIso][nivel1Nombre]) {
          data[codigoIso][nivel1Nombre] = [];
        }
        
        if (!data[codigoIso][nivel1Nombre].includes(nivel2Nombre)) {
          data[codigoIso][nivel1Nombre].push(nivel2Nombre);
        }
      }
      
      // Sort nivel2 arrays
      Object.values(data).forEach(nivel1Map => {
        Object.keys(nivel1Map).forEach(key => {
          nivel1Map[key].sort();
        });
      });
      
      cachedData = data;
      return data;
    });
  
  return loadingPromise;
};

export function useHispanoamerica() {
  const [data, setData] = useState<HispanoData>(cachedData || {});
  const [loading, setLoading] = useState(!cachedData);

  useEffect(() => {
    loadCSVData()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const getPaises = useCallback((): PaisHispano[] => {
    return PAISES_HISPANOAMERICA;
  }, []);

  const getNivel1 = useCallback((codigoPais: string): string[] => {
    const paisData = data[codigoPais];
    if (!paisData) return [];
    return Object.keys(paisData).sort();
  }, [data]);

  const getNivel2 = useCallback((codigoPais: string, nivel1: string): string[] => {
    const paisData = data[codigoPais];
    if (!paisData) return [];
    return paisData[nivel1] || [];
  }, [data]);

  const hasPaisData = useCallback((codigoPais: string): boolean => {
    return !!data[codigoPais];
  }, [data]);

  // Get all available country codes in the data
  const paisesDisponibles = useMemo(() => {
    return PAISES_HISPANOAMERICA.filter(p => data[p.codigo] !== undefined);
  }, [data]);

  return { 
    loading, 
    getPaises, 
    getNivel1, 
    getNivel2, 
    hasPaisData,
    paisesDisponibles,
    allPaises: PAISES_HISPANOAMERICA 
  };
}
