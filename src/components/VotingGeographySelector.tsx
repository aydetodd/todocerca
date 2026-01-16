import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Globe, Building } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useHispanoamerica } from '@/hooks/useHispanoamerica';
import { PAISES_HISPANOAMERICA, getPaisPorCodigo, PaisHispano } from '@/data/paises-hispanoamerica';

export interface VotingGeographySelection {
  paisCodigo: string;
  paisNombre: string;
  estadoNombre: string;
  localidadNombre: string;
}

interface VotingGeographySelectorProps {
  nivel: 'nacional' | 'estatal' | 'ciudad';
  onSelectionChange: (selection: VotingGeographySelection) => void;
  initialPaisCodigo?: string;
  initialEstado?: string;
  initialLocalidad?: string;
  className?: string;
}

export function VotingGeographySelector({
  nivel,
  onSelectionChange,
  initialPaisCodigo = '',
  initialEstado = '',
  initialLocalidad = '',
  className = ''
}: VotingGeographySelectorProps) {
  const { getNivel1, getNivel2, loading: dataLoading, allPaises } = useHispanoamerica();
  
  const [selectedPaisCodigo, setSelectedPaisCodigo] = useState(initialPaisCodigo);
  const [selectedEstado, setSelectedEstado] = useState(initialEstado);
  const [selectedLocalidad, setSelectedLocalidad] = useState(initialLocalidad);
  const [estadoSearch, setEstadoSearch] = useState('');
  const [localidadSearch, setLocalidadSearch] = useState('');

  // Obtener info del país seleccionado
  const paisInfo = useMemo(() => {
    return getPaisPorCodigo(selectedPaisCodigo) || null;
  }, [selectedPaisCodigo]);

  // Obtener estados filtrados
  const estadosList = useMemo(() => {
    if (!selectedPaisCodigo) return [];
    const all = getNivel1(selectedPaisCodigo);
    if (!estadoSearch.trim()) return all;
    const search = estadoSearch.toLowerCase();
    return all.filter(e => e.toLowerCase().includes(search));
  }, [selectedPaisCodigo, getNivel1, estadoSearch]);

  // Obtener localidades filtradas
  const localidadesList = useMemo(() => {
    if (!selectedPaisCodigo || !selectedEstado) return [];
    const all = getNivel2(selectedPaisCodigo, selectedEstado);
    if (!localidadSearch.trim()) return all;
    const search = localidadSearch.toLowerCase();
    return all.filter(l => l.toLowerCase().includes(search));
  }, [selectedPaisCodigo, selectedEstado, getNivel2, localidadSearch]);

  // Notificar cambios
  useEffect(() => {
    const paisNombre = paisInfo?.nombre || '';
    onSelectionChange({
      paisCodigo: selectedPaisCodigo,
      paisNombre,
      estadoNombre: selectedEstado,
      localidadNombre: selectedLocalidad
    });
  }, [selectedPaisCodigo, selectedEstado, selectedLocalidad, paisInfo, onSelectionChange]);

  // Labels dinámicos según país
  const nivel1Label = paisInfo?.nivel1Tipo 
    ? paisInfo.nivel1Tipo.charAt(0).toUpperCase() + paisInfo.nivel1Tipo.slice(1)
    : 'Estado';
  const nivel2Label = paisInfo?.nivel2Tipo
    ? paisInfo.nivel2Tipo.charAt(0).toUpperCase() + paisInfo.nivel2Tipo.slice(1)
    : 'Municipio';

  const handlePaisChange = (codigo: string) => {
    setSelectedPaisCodigo(codigo);
    setSelectedEstado('');
    setSelectedLocalidad('');
    setEstadoSearch('');
    setLocalidadSearch('');
  };

  const handleEstadoChange = (estado: string) => {
    setSelectedEstado(estado);
    setSelectedLocalidad('');
    setLocalidadSearch('');
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* País - siempre visible */}
      <div className="space-y-1">
        <Label className="text-xs flex items-center gap-1">
          <Globe className="h-3 w-3" />
          País *
        </Label>
        <Select value={selectedPaisCodigo} onValueChange={handlePaisChange}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona un país" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {allPaises.map((pais) => (
              <SelectItem key={pais.codigo} value={pais.codigo}>
                <span className="flex items-center gap-2">
                  <span>{pais.bandera}</span>
                  <span>{pais.nombre}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Estado - visible si nivel es estatal o localidad */}
      {selectedPaisCodigo && (nivel === 'estatal' || nivel === 'ciudad') && (
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1">
            <Building className="h-3 w-3" />
            {nivel1Label} *
          </Label>
          {estadosList.length > 10 && (
            <Input
              placeholder={`Buscar ${nivel1Label.toLowerCase()}...`}
              value={estadoSearch}
              onChange={(e) => setEstadoSearch(e.target.value)}
              className="h-8 text-sm mb-1"
            />
          )}
          <Select value={selectedEstado} onValueChange={handleEstadoChange}>
            <SelectTrigger>
              <SelectValue placeholder={`Selecciona ${nivel1Label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {estadosList.length === 0 ? (
                <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                  {dataLoading ? 'Cargando...' : 'No hay datos disponibles'}
                </div>
              ) : (
                estadosList.map((estado) => (
                  <SelectItem key={estado} value={estado}>
                    {estado}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Localidad - visible si nivel es ciudad y hay estado seleccionado */}
      {selectedPaisCodigo && selectedEstado && nivel === 'ciudad' && (
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {nivel2Label} *
          </Label>
          {localidadesList.length > 10 && (
            <Input
              placeholder={`Buscar ${nivel2Label.toLowerCase()}...`}
              value={localidadSearch}
              onChange={(e) => setLocalidadSearch(e.target.value)}
              className="h-8 text-sm mb-1"
            />
          )}
          <Select value={selectedLocalidad} onValueChange={setSelectedLocalidad}>
            <SelectTrigger>
              <SelectValue placeholder={`Selecciona ${nivel2Label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {localidadesList.length === 0 ? (
                <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                  {dataLoading ? 'Cargando...' : 'No hay datos disponibles'}
                </div>
              ) : (
                localidadesList.map((loc) => (
                  <SelectItem key={loc} value={loc}>
                    {loc}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Resumen */}
      <div className="text-xs text-muted-foreground bg-background/50 p-2 rounded">
        {nivel === 'nacional' && selectedPaisCodigo && paisInfo && (
          <span>🗳️ Votarán usuarios de <strong>{paisInfo.nombre}</strong></span>
        )}
        {nivel === 'estatal' && selectedPaisCodigo && (
          !selectedEstado ? (
            <span className="text-amber-500">⚠️ Selecciona un {nivel1Label.toLowerCase()} específico</span>
          ) : (
            <span>🗳️ Votarán usuarios de <strong>{selectedEstado}, {paisInfo?.nombre}</strong></span>
          )
        )}
        {nivel === 'ciudad' && selectedPaisCodigo && (
          !selectedEstado ? (
            <span className="text-amber-500">⚠️ Selecciona un {nivel1Label.toLowerCase()} para ver las localidades</span>
          ) : !selectedLocalidad ? (
            <span className="text-amber-500">⚠️ Selecciona un {nivel2Label.toLowerCase()} específico</span>
          ) : (
            <span>🗳️ Votarán usuarios de <strong>{selectedLocalidad}, {selectedEstado}</strong></span>
          )
        )}
        {!selectedPaisCodigo && <span>Selecciona un país para continuar</span>}
      </div>
    </div>
  );
}

export default VotingGeographySelector;
