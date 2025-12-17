// Cache bust: 2025-12-17T10:00:00
import { useState, useEffect } from 'react';

type MunicipiosData = Record<string, string[]>;

let cachedData: MunicipiosData | null = null;

export function useMunicipios() {
  const [municipiosData, setMunicipiosData] = useState<MunicipiosData>(cachedData || {});
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedData) {
      setMunicipiosData(cachedData);
      setLoading(false);
      return;
    }

    fetch('/data/estados-municipios-mx.json')
      .then(res => {
        if (!res.ok) throw new Error('No se pudo cargar los municipios');
        return res.json();
      })
      .then((data: MunicipiosData) => {
        cachedData = data;
        setMunicipiosData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error cargando municipios:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const estados = Object.keys(municipiosData).sort();
  
  const getMunicipios = (estado: string): string[] => {
    return municipiosData[estado] || [];
  };

  return { estados, getMunicipios, loading, error };
}
