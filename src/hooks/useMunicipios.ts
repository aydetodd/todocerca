import { useState, useEffect } from 'react';

type MunicipiosData = Record<string, string[]>;

let cachedData: MunicipiosData | null = null;

export function useMunicipios() {
  const [municipiosData, setMunicipiosData] = useState<MunicipiosData>(cachedData || {});
  const [loading, setLoading] = useState(!cachedData);

  useEffect(() => {
    if (cachedData) {
      setMunicipiosData(cachedData);
      setLoading(false);
      return;
    }

    fetch('/data/estados-municipios-mx.json')
      .then(res => res.json())
      .then((data: MunicipiosData) => {
        cachedData = data;
        setMunicipiosData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading municipios:', err);
        setLoading(false);
      });
  }, []);

  const getEstados = (): string[] => {
    return Object.keys(municipiosData).sort();
  };

  const getMunicipios = (estado: string): string[] => {
    return municipiosData[estado] || [];
  };

  return { municipiosData, loading, getEstados, getMunicipios };
}
