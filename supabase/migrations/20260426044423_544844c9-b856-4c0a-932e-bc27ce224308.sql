
-- Boletos QR
DELETE FROM public.logs_validacion_qr;
DELETE FROM public.movimientos_boleto;
DELETE FROM public.intentos_fraude;
DELETE FROM public.qr_tickets;
UPDATE public.cuentas_boletos SET ticket_count = 0, total_comprado = 0, total_usado = 0;

-- Validaciones transporte personal (FK a contratos/empresa/empleados/productos)
DELETE FROM public.validaciones_transporte_personal;

-- Liquidaciones
DELETE FROM public.liquidaciones_diarias;
DELETE FROM public.cuentas_conectadas;

-- Recursos/notas/cortes/contratos
DELETE FROM public.recursos_contrato;
DELETE FROM public.notas_contrato;
DELETE FROM public.cortes_transporte;
DELETE FROM public.contratos_transporte;

-- Empleados y empresas
DELETE FROM public.qr_empleados;
DELETE FROM public.empleados_empresa;
DELETE FROM public.empresas_transporte;

-- Recursos de proveedor (transporte)
DELETE FROM public.asignaciones_chofer;
DELETE FROM public.choferes_empresa;
DELETE FROM public.unidades_empresa;

-- Verificaciones concesionario
DELETE FROM public.detalles_verificacion_unidad;
DELETE FROM public.documentos_concesionario;
DELETE FROM public.audit_log_verificacion;
DELETE FROM public.verificaciones_concesionario;

-- Datos de proveedor
DELETE FROM public.ruta_invitaciones;
DELETE FROM public.citas_publicas;
DELETE FROM public.citas;
DELETE FROM public.horarios_proveedor;
DELETE FROM public.items_pedido;
DELETE FROM public.pedidos;
DELETE FROM public.fotos_productos;
DELETE FROM public.productos;
DELETE FROM public.favoritos WHERE proveedor_id IS NOT NULL OR producto_id IS NOT NULL;

-- Proveedores
DELETE FROM public.proveedores;
