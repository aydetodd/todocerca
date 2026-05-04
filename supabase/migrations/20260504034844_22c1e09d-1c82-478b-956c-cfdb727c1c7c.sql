-- Limpieza completa para nueva prueba (conserva rutas públicas/foráneas, perfiles de usuario, profiles)

-- 1) QR tickets, validaciones, liquidaciones, transacciones de boletos
DELETE FROM logs_validacion_qr;
DELETE FROM validaciones_transporte_personal;
DELETE FROM movimientos_boleto;
DELETE FROM transacciones_boletos;
DELETE FROM intentos_fraude;
DELETE FROM viajes_realizados;
DELETE FROM liquidaciones_diarias;
DELETE FROM cortes_transporte;
DELETE FROM qr_tickets;
DELETE FROM qr_empleados;
DELETE FROM cuentas_boletos;

-- 2) Choferes, unidades, asignaciones, invitaciones de ruta
DELETE FROM asignaciones_chofer;
DELETE FROM ruta_invitaciones;
DELETE FROM choferes_empresa;
DELETE FROM unidades_empresa;

-- 3) Rutas privadas (solo productos route_type='privada'); rutas urbanas/foráneas (rutas_catalogo) se conservan
DELETE FROM productos WHERE route_type = 'privada';

-- 4) Concesionarios + Stripe Connect + suscripciones + contratos + empresas
DELETE FROM detalles_verificacion_unidad;
DELETE FROM documentos_concesionario;
DELETE FROM verificaciones_concesionario;
DELETE FROM cuentas_conectadas;
DELETE FROM contratos_transporte;
DELETE FROM empleados_empresa;
DELETE FROM empresas_transporte;
DELETE FROM subscriptions;
DELETE FROM proveedores;