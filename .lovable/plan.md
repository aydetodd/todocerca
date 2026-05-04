## Objetivo

Eliminar el flujo de "verificación de documentos" del concesionario. Originalmente fue diseñado para taxistas (regulación municipal). Para concesionarios con transporte privado, foráneo o público, basta con que paguen su suscripción anual a TodoCerca y queden habilitados para registrar choferes, unidades y rutas. Los contratos de servicio los manejan ellos directamente con sus clientes.

## Cambios en `src/pages/PanelConcesionario.tsx`

1. **Eliminar la pestaña "Verif." (`TabsTrigger value="verificacion"`)** y su `TabsContent` completo (líneas ~1305–1640), incluyendo:
   - Tarjeta "Estado de Verificación".
   - Lógica/UI que bloquea Stripe Connect detrás de `verificacion?.estado === "approved"`.
   - Importación y uso de `VerificationDocsUploader`.
2. **Mover la tarjeta "Cuenta Stripe Connect"** a una pestaña existente (p. ej. la pestaña "Pagos/Liquidaciones" o una nueva mini-tab "Cobros") y desbloquearla incondicionalmente: el botón "Configurar Stripe Connect" se muestra siempre que el concesionario tenga suscripción activa, sin requerir verificación previa.
3. **Eliminar fetch / realtime de `verificaciones_concesionario` y `detalles_verificacion_unidad`** dentro del panel (consultas en líneas ~458, 526, 562, 859–932). Quitar el estado `verificacion`, `setVerificacion` y los badges asociados en el header (líneas ~1223–1227).
4. **Quitar el badge "Verif. pendiente/aprobada"** del header del panel y del listado de unidades. Las unidades quedan activas en cuanto se registran y se cubre la suscripción.

## Cambios en otros componentes

5. **`src/components/AdminVerificaciones.tsx`**: dejar de mostrarlo en el menú admin para concesionarios no-taxi. Dado que el Protocolo 2 ya oculta taxis, en la práctica este panel queda sin uso. Acciones:
   - Mantener el componente para el caso futuro de taxistas (oculto por Protocolo 2 hoy), pero **remover su entrada del menú principal de admin** (`Dashboard.tsx` / `Panel.tsx` — confirmar ubicación al implementar).
6. **`src/components/VerificationDocsUploader.tsx`**: dejar de importarlo desde `PanelConcesionario`. No se elimina el archivo (puede reutilizarse para taxis si se reactivan).

## Base de datos

7. **No se borran tablas** (`verificaciones_concesionario`, `detalles_verificacion_unidad`, bucket `verificacion-docs`) para preservar histórico y compatibilidad futura con taxis.
8. **Trigger `sync_concesionario_verification_status`**: ya marca `unidades_empresa.is_verified = true` cuando la verificación es aprobada y excluye taxis. Como ya no usaremos verificaciones, agregar **migración** que ponga `is_verified = true` por defecto en `unidades_empresa` para todas las unidades **no taxi**:
   - `ALTER TABLE unidades_empresa ALTER COLUMN is_verified SET DEFAULT true;`
   - `UPDATE unidades_empresa SET is_verified = true WHERE COALESCE(transport_type,'') <> 'taxi';`
   Así cualquier UI/policy que dependa de `is_verified` deja de bloquear concesionarios privados.

## Flujo resultante para el concesionario

1. Se registra como concesionario.
2. Paga la suscripción anual ($400 MXN/unidad) desde "Mis Rutas de Transporte".
3. Registra choferes, unidades y rutas (pública / foránea / privada).
4. Configura Stripe Connect cuando quiera empezar a cobrar boletos QR (opcional, sin verificación previa).
5. Para rutas privadas, firma sus propios contratos directamente con la empresa cliente desde "Empresas → Mis Contratos".

## Memoria a actualizar

- Sustituir `mem://transporte/verificacion-estricta-concesionarios` por una nota que diga: "Verificación documental aplica únicamente a taxistas (actualmente ocultos por Protocolo 2). Concesionarios privados/foráneos/públicos quedan habilitados al pagar la suscripción anual; no requieren verificación manual."
