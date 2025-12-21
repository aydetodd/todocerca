import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Pais {
  id: string;
  nombre: string;
  codigo_iso: string;
  codigo_iso3: string | null;
  codigo_telefono: string | null;
  moneda: string | null;
}

export interface SubdivisionNivel1 {
  id: string;
  pais_id: string;
  nombre: string;
  slug: string;
  tipo: string;
  codigo: string | null;
}

export interface SubdivisionNivel2 {
  id: string;
  nivel1_id: string;
  nombre: string;
  slug: string;
  tipo: string;
  codigo_postal: string | null;
  latitud: number | null;
  longitud: number | null;
  poblacion: number | null;
}

export interface GeografiaCompleta {
  pais: Pais | null;
  nivel1: SubdivisionNivel1 | null;
  nivel2: SubdivisionNivel2 | null;
}

export function useGeography() {
  const [paises, setPaises] = useState<Pais[]>([]);
  const [nivel1List, setNivel1List] = useState<SubdivisionNivel1[]>([]);
  const [nivel2List, setNivel2List] = useState<SubdivisionNivel2[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar países al montar
  useEffect(() => {
    fetchPaises();
  }, []);

  const fetchPaises = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('paises')
        .select('*')
        .eq('is_active', true)
        .order('nombre');

      if (error) throw error;
      setPaises(data || []);
    } catch (err: any) {
      console.error('Error fetching países:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchNivel1ByPais = useCallback(async (paisId: string) => {
    try {
      setLoading(true);
      setNivel1List([]);
      setNivel2List([]);
      
      const { data, error } = await supabase
        .from('subdivisiones_nivel1')
        .select('*')
        .eq('pais_id', paisId)
        .eq('is_active', true)
        .order('nombre');

      if (error) throw error;
      setNivel1List(data || []);
    } catch (err: any) {
      console.error('Error fetching nivel1:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchNivel2ByNivel1 = useCallback(async (nivel1Id: string) => {
    try {
      setLoading(true);
      setNivel2List([]);
      
      const { data, error } = await supabase
        .from('subdivisiones_nivel2')
        .select('*')
        .eq('nivel1_id', nivel1Id)
        .eq('is_active', true)
        .order('nombre');

      if (error) throw error;
      setNivel2List(data || []);
    } catch (err: any) {
      console.error('Error fetching nivel2:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Buscar por slugs (para URLs amigables)
  const findBySlugs = useCallback(async (
    paisCodigo: string,
    nivel1Slug: string,
    nivel2Slug?: string
  ): Promise<GeografiaCompleta> => {
    try {
      // Buscar país
      const { data: paisData } = await supabase
        .from('paises')
        .select('*')
        .ilike('codigo_iso', paisCodigo)
        .single();

      if (!paisData) {
        return { pais: null, nivel1: null, nivel2: null };
      }

      // Buscar nivel1
      const { data: nivel1Data } = await supabase
        .from('subdivisiones_nivel1')
        .select('*')
        .eq('pais_id', paisData.id)
        .ilike('slug', nivel1Slug)
        .single();

      if (!nivel1Data) {
        return { pais: paisData, nivel1: null, nivel2: null };
      }

      // Si hay nivel2 slug, buscarlo
      if (nivel2Slug) {
        const { data: nivel2Data } = await supabase
          .from('subdivisiones_nivel2')
          .select('*')
          .eq('nivel1_id', nivel1Data.id)
          .ilike('slug', nivel2Slug)
          .single();

        return {
          pais: paisData,
          nivel1: nivel1Data,
          nivel2: nivel2Data || null
        };
      }

      return { pais: paisData, nivel1: nivel1Data, nivel2: null };
    } catch (err: any) {
      console.error('Error finding by slugs:', err);
      return { pais: null, nivel1: null, nivel2: null };
    }
  }, []);

  // Obtener geografía completa por nivel2_id
  const getGeografiaCompleta = useCallback(async (nivel2Id: string): Promise<GeografiaCompleta> => {
    try {
      const { data: nivel2 } = await supabase
        .from('subdivisiones_nivel2')
        .select('*')
        .eq('id', nivel2Id)
        .single();

      if (!nivel2) {
        return { pais: null, nivel1: null, nivel2: null };
      }

      const { data: nivel1 } = await supabase
        .from('subdivisiones_nivel1')
        .select('*')
        .eq('id', nivel2.nivel1_id)
        .single();

      if (!nivel1) {
        return { pais: null, nivel1: null, nivel2 };
      }

      const { data: pais } = await supabase
        .from('paises')
        .select('*')
        .eq('id', nivel1.pais_id)
        .single();

      return { pais, nivel1, nivel2 };
    } catch (err: any) {
      console.error('Error getting geografía completa:', err);
      return { pais: null, nivel1: null, nivel2: null };
    }
  }, []);

  // Generar URL amigable
  const generateSlugUrl = useCallback((
    basePath: string,
    pais: Pais | null,
    nivel1: SubdivisionNivel1 | null,
    nivel2: SubdivisionNivel2 | null
  ): string => {
    if (!pais) return basePath;
    
    let url = `${basePath}/${pais.codigo_iso.toLowerCase()}`;
    if (nivel1) {
      url += `/${nivel1.slug}`;
      if (nivel2) {
        url += `/${nivel2.slug}`;
      }
    }
    return url;
  }, []);

  return {
    paises,
    nivel1List,
    nivel2List,
    loading,
    error,
    fetchPaises,
    fetchNivel1ByPais,
    fetchNivel2ByNivel1,
    findBySlugs,
    getGeografiaCompleta,
    generateSlugUrl
  };
}

// Hook para selector controlado
export function useGeographySelector(
  initialPaisId?: string,
  initialNivel1Id?: string,
  initialNivel2Id?: string
) {
  const {
    paises,
    nivel1List,
    nivel2List,
    loading,
    fetchNivel1ByPais,
    fetchNivel2ByNivel1
  } = useGeography();

  const [selectedPaisId, setSelectedPaisId] = useState<string | null>(initialPaisId || null);
  const [selectedNivel1Id, setSelectedNivel1Id] = useState<string | null>(initialNivel1Id || null);
  const [selectedNivel2Id, setSelectedNivel2Id] = useState<string | null>(initialNivel2Id || null);

  // Cargar nivel1 cuando cambia el país
  useEffect(() => {
    if (selectedPaisId) {
      fetchNivel1ByPais(selectedPaisId);
      setSelectedNivel1Id(null);
      setSelectedNivel2Id(null);
    }
  }, [selectedPaisId, fetchNivel1ByPais]);

  // Cargar nivel2 cuando cambia nivel1
  useEffect(() => {
    if (selectedNivel1Id) {
      fetchNivel2ByNivel1(selectedNivel1Id);
      setSelectedNivel2Id(null);
    }
  }, [selectedNivel1Id, fetchNivel2ByNivel1]);

  const selectedPais = paises.find(p => p.id === selectedPaisId) || null;
  const selectedNivel1 = nivel1List.find(n => n.id === selectedNivel1Id) || null;
  const selectedNivel2 = nivel2List.find(n => n.id === selectedNivel2Id) || null;

  const reset = () => {
    setSelectedPaisId(null);
    setSelectedNivel1Id(null);
    setSelectedNivel2Id(null);
  };

  return {
    paises,
    nivel1List,
    nivel2List,
    loading,
    selectedPaisId,
    selectedNivel1Id,
    selectedNivel2Id,
    selectedPais,
    selectedNivel1,
    selectedNivel2,
    setSelectedPaisId,
    setSelectedNivel1Id,
    setSelectedNivel2Id,
    reset
  };
}
