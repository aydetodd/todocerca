// Lista de países hispanohablantes con sus banderas y códigos
export interface PaisHispano {
  codigo: string;
  nombre: string;
  bandera: string;
  codigoTelefono: string;
  digitos: number;
  nivel1Tipo: string; // estado, provincia, departamento, región
  nivel2Tipo: string; // municipio, comuna, cantón
}

export const PAISES_HISPANOAMERICA: PaisHispano[] = [
  { codigo: 'MX', nombre: 'México', bandera: '🇲🇽', codigoTelefono: '+52', digitos: 10, nivel1Tipo: 'estado', nivel2Tipo: 'municipio' },
  { codigo: 'GT', nombre: 'Guatemala', bandera: '🇬🇹', codigoTelefono: '+502', digitos: 8, nivel1Tipo: 'departamento', nivel2Tipo: 'municipio' },
  { codigo: 'HN', nombre: 'Honduras', bandera: '🇭🇳', codigoTelefono: '+504', digitos: 8, nivel1Tipo: 'departamento', nivel2Tipo: 'municipio' },
  { codigo: 'SV', nombre: 'El Salvador', bandera: '🇸🇻', codigoTelefono: '+503', digitos: 8, nivel1Tipo: 'departamento', nivel2Tipo: 'municipio' },
  { codigo: 'NI', nombre: 'Nicaragua', bandera: '🇳🇮', codigoTelefono: '+505', digitos: 8, nivel1Tipo: 'departamento', nivel2Tipo: 'municipio' },
  { codigo: 'CR', nombre: 'Costa Rica', bandera: '🇨🇷', codigoTelefono: '+506', digitos: 8, nivel1Tipo: 'provincia', nivel2Tipo: 'cantón' },
  { codigo: 'PA', nombre: 'Panamá', bandera: '🇵🇦', codigoTelefono: '+507', digitos: 8, nivel1Tipo: 'provincia', nivel2Tipo: 'distrito' },
  { codigo: 'CO', nombre: 'Colombia', bandera: '🇨🇴', codigoTelefono: '+57', digitos: 10, nivel1Tipo: 'departamento', nivel2Tipo: 'municipio' },
  { codigo: 'VE', nombre: 'Venezuela', bandera: '🇻🇪', codigoTelefono: '+58', digitos: 10, nivel1Tipo: 'estado', nivel2Tipo: 'municipio' },
  { codigo: 'EC', nombre: 'Ecuador', bandera: '🇪🇨', codigoTelefono: '+593', digitos: 9, nivel1Tipo: 'provincia', nivel2Tipo: 'cantón' },
  { codigo: 'PE', nombre: 'Perú', bandera: '🇵🇪', codigoTelefono: '+51', digitos: 9, nivel1Tipo: 'departamento', nivel2Tipo: 'provincia' },
  { codigo: 'BO', nombre: 'Bolivia', bandera: '🇧🇴', codigoTelefono: '+591', digitos: 8, nivel1Tipo: 'departamento', nivel2Tipo: 'municipio' },
  { codigo: 'CL', nombre: 'Chile', bandera: '🇨🇱', codigoTelefono: '+56', digitos: 9, nivel1Tipo: 'región', nivel2Tipo: 'comuna' },
  { codigo: 'AR', nombre: 'Argentina', bandera: '🇦🇷', codigoTelefono: '+54', digitos: 10, nivel1Tipo: 'provincia', nivel2Tipo: 'departamento' },
  { codigo: 'UY', nombre: 'Uruguay', bandera: '🇺🇾', codigoTelefono: '+598', digitos: 8, nivel1Tipo: 'departamento', nivel2Tipo: 'municipio' },
  { codigo: 'PY', nombre: 'Paraguay', bandera: '🇵🇾', codigoTelefono: '+595', digitos: 9, nivel1Tipo: 'departamento', nivel2Tipo: 'distrito' },
  { codigo: 'CU', nombre: 'Cuba', bandera: '🇨🇺', codigoTelefono: '+53', digitos: 8, nivel1Tipo: 'provincia', nivel2Tipo: 'municipio' },
  { codigo: 'DO', nombre: 'República Dominicana', bandera: '🇩🇴', codigoTelefono: '+1', digitos: 10, nivel1Tipo: 'provincia', nivel2Tipo: 'municipio' },
];

// Mapa para acceso rápido por código
export const PAISES_MAP = new Map(PAISES_HISPANOAMERICA.map(p => [p.codigo, p]));

// Obtener país por código
export const getPaisPorCodigo = (codigo: string): PaisHispano | undefined => {
  return PAISES_MAP.get(codigo);
};

// Obtener bandera por código
export const getBanderaPorCodigo = (codigo: string): string => {
  return PAISES_MAP.get(codigo)?.bandera || '🌎';
};
