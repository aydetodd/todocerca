import React from 'react';
import { MapPin, Globe, Building, Home } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useGeographySelector, Pais, SubdivisionNivel1, SubdivisionNivel2 } from '@/hooks/useGeography';

interface GeographySelectorProps {
  onSelectionChange?: (selection: {
    pais: Pais | null;
    nivel1: SubdivisionNivel1 | null;
    nivel2: SubdivisionNivel2 | null;
  }) => void;
  showLabels?: boolean;
  compact?: boolean;
  required?: boolean;
  initialPaisId?: string;
  initialNivel1Id?: string;
  initialNivel2Id?: string;
  className?: string;
}

// Mapa de banderas por código ISO
const FLAG_EMOJIS: Record<string, string> = {
  MX: '🇲🇽',
  CO: '🇨🇴',
  AR: '🇦🇷',
  PE: '🇵🇪',
  CL: '🇨🇱',
  EC: '🇪🇨',
  GT: '🇬🇹',
  CU: '🇨🇺',
  BO: '🇧🇴',
  DO: '🇩🇴',
  HN: '🇭🇳',
  PY: '🇵🇾',
  SV: '🇸🇻',
  NI: '🇳🇮',
  CR: '🇨🇷',
  PA: '🇵🇦',
  UY: '🇺🇾',
  PR: '🇵🇷',
  VE: '🇻🇪',
  BR: '🇧🇷',
};

// Mapa de tipos de subdivisión
const TIPO_LABELS: Record<string, { nivel1: string; nivel2: string }> = {
  MX: { nivel1: 'Estado', nivel2: 'Municipio' },
  CO: { nivel1: 'Departamento', nivel2: 'Municipio' },
  AR: { nivel1: 'Provincia', nivel2: 'Departamento' },
  PE: { nivel1: 'Departamento', nivel2: 'Provincia' },
  CL: { nivel1: 'Región', nivel2: 'Comuna' },
  EC: { nivel1: 'Provincia', nivel2: 'Cantón' },
  GT: { nivel1: 'Departamento', nivel2: 'Municipio' },
  CU: { nivel1: 'Provincia', nivel2: 'Municipio' },
  BO: { nivel1: 'Departamento', nivel2: 'Municipio' },
  DO: { nivel1: 'Provincia', nivel2: 'Municipio' },
  HN: { nivel1: 'Departamento', nivel2: 'Municipio' },
  PY: { nivel1: 'Departamento', nivel2: 'Distrito' },
  SV: { nivel1: 'Departamento', nivel2: 'Municipio' },
  NI: { nivel1: 'Departamento', nivel2: 'Municipio' },
  CR: { nivel1: 'Provincia', nivel2: 'Cantón' },
  PA: { nivel1: 'Provincia', nivel2: 'Distrito' },
  UY: { nivel1: 'Departamento', nivel2: 'Municipio' },
  PR: { nivel1: 'Municipio', nivel2: 'Barrio' },
  VE: { nivel1: 'Estado', nivel2: 'Municipio' },
  BR: { nivel1: 'Estado', nivel2: 'Municipio' },
};

export function GeographySelector({
  onSelectionChange,
  showLabels = true,
  compact = false,
  required = false,
  initialPaisId,
  initialNivel1Id,
  initialNivel2Id,
  className = ''
}: GeographySelectorProps) {
  const {
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
    setSelectedNivel2Id
  } = useGeographySelector(initialPaisId, initialNivel1Id, initialNivel2Id);

  // Notificar cambios
  React.useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange({
        pais: selectedPais,
        nivel1: selectedNivel1,
        nivel2: selectedNivel2
      });
    }
  }, [selectedPais, selectedNivel1, selectedNivel2, onSelectionChange]);

  const getLabels = () => {
    if (selectedPais && TIPO_LABELS[selectedPais.codigo_iso]) {
      return TIPO_LABELS[selectedPais.codigo_iso];
    }
    return { nivel1: 'Estado/Departamento', nivel2: 'Municipio/Distrito' };
  };

  const labels = getLabels();

  if (loading && paises.length === 0) {
    return (
      <div className={`space-y-4 ${className}`}>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${compact ? 'space-y-2' : ''} ${className}`}>
      {/* País */}
      <div className="space-y-2">
        {showLabels && (
          <Label className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            País {required && <span className="text-destructive">*</span>}
          </Label>
        )}
        <Select
          value={selectedPaisId || ''}
          onValueChange={(value) => setSelectedPaisId(value)}
        >
          <SelectTrigger className={compact ? 'h-9' : ''}>
            <SelectValue placeholder="Selecciona un país" />
          </SelectTrigger>
          <SelectContent>
            {paises.map((pais) => (
              <SelectItem key={pais.id} value={pais.id}>
                <span className="flex items-center gap-2">
                  <span>{FLAG_EMOJIS[pais.codigo_iso] || '🌎'}</span>
                  <span>{pais.nombre}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Nivel 1 (Estado/Departamento) */}
      <div className="space-y-2">
        {showLabels && (
          <Label className="flex items-center gap-2">
            <Building className="h-4 w-4 text-primary" />
            {labels.nivel1} {required && <span className="text-destructive">*</span>}
          </Label>
        )}
        <Select
          value={selectedNivel1Id || ''}
          onValueChange={(value) => setSelectedNivel1Id(value)}
          disabled={!selectedPaisId || nivel1List.length === 0}
        >
          <SelectTrigger className={compact ? 'h-9' : ''}>
            <SelectValue 
              placeholder={
                !selectedPaisId 
                  ? 'Primero selecciona un país' 
                  : loading 
                    ? 'Cargando...' 
                    : nivel1List.length === 0 
                      ? 'No hay datos disponibles'
                      : `Selecciona ${labels.nivel1.toLowerCase()}`
              } 
            />
          </SelectTrigger>
          <SelectContent>
            {nivel1List.map((nivel1) => (
              <SelectItem key={nivel1.id} value={nivel1.id}>
                {nivel1.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Nivel 2 (Municipio/Distrito) */}
      <div className="space-y-2">
        {showLabels && (
          <Label className="flex items-center gap-2">
            <Home className="h-4 w-4 text-primary" />
            {labels.nivel2} {required && <span className="text-destructive">*</span>}
          </Label>
        )}
        <Select
          value={selectedNivel2Id || ''}
          onValueChange={(value) => setSelectedNivel2Id(value)}
          disabled={!selectedNivel1Id || nivel2List.length === 0}
        >
          <SelectTrigger className={compact ? 'h-9' : ''}>
            <SelectValue 
              placeholder={
                !selectedNivel1Id 
                  ? `Primero selecciona ${labels.nivel1.toLowerCase()}` 
                  : loading 
                    ? 'Cargando...' 
                    : nivel2List.length === 0 
                      ? 'No hay datos disponibles'
                      : `Selecciona ${labels.nivel2.toLowerCase()}`
              } 
            />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {nivel2List.map((nivel2) => (
              <SelectItem key={nivel2.id} value={nivel2.id}>
                {nivel2.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Ubicación seleccionada */}
      {selectedNivel2 && (
        <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
          <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-medium">
            {selectedNivel2.nombre}, {selectedNivel1?.nombre}, {selectedPais?.nombre}
          </span>
        </div>
      )}
    </div>
  );
}

// Versión inline/horizontal para filtros
export function GeographySelectorInline({
  onSelectionChange,
  className = ''
}: Omit<GeographySelectorProps, 'showLabels' | 'compact'>) {
  const {
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
    setSelectedNivel2Id
  } = useGeographySelector();

  React.useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange({
        pais: selectedPais,
        nivel1: selectedNivel1,
        nivel2: selectedNivel2
      });
    }
  }, [selectedPais, selectedNivel1, selectedNivel2, onSelectionChange]);

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <Select
        value={selectedPaisId || ''}
        onValueChange={(value) => setSelectedPaisId(value)}
      >
        <SelectTrigger className="w-[140px] h-9">
          <SelectValue placeholder="País" />
        </SelectTrigger>
        <SelectContent>
          {paises.map((pais) => (
            <SelectItem key={pais.id} value={pais.id}>
              <span className="flex items-center gap-1">
                <span>{FLAG_EMOJIS[pais.codigo_iso] || '🌎'}</span>
                <span className="truncate">{pais.nombre}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedNivel1Id || ''}
        onValueChange={(value) => setSelectedNivel1Id(value)}
        disabled={!selectedPaisId}
      >
        <SelectTrigger className="w-[160px] h-9">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          {nivel1List.map((nivel1) => (
            <SelectItem key={nivel1.id} value={nivel1.id}>
              {nivel1.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedNivel2Id || ''}
        onValueChange={(value) => setSelectedNivel2Id(value)}
        disabled={!selectedNivel1Id}
      >
        <SelectTrigger className="w-[160px] h-9">
          <SelectValue placeholder="Municipio" />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {nivel2List.map((nivel2) => (
            <SelectItem key={nivel2.id} value={nivel2.id}>
              {nivel2.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default GeographySelector;
