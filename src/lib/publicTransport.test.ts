import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isPublicTransportType, matchesScopedRouteUnit } from './publicTransport';
test('taxi colectivo puede consultarse sin registro', () => assert.equal(isPublicTransportType('taxi_colectivo'), true));
test('taxi ordinario permanece oculto', () => assert.equal(isPublicTransportType('taxi'), false));
test('rutas privadas no entran a consulta pública', () => assert.equal(isPublicTransportType('privada'), false));
test('tipo desconocido no expone rutas', () => assert.equal(isPublicTransportType(null), false));
test('dos colectivos de la misma consulta no se pierden por tener productos de concesionarios distintos', () => {
  const ids = ['dca4d776-abb2-4d21-8e9c-335072599f98', '043ad88a-69d0-4675-af0c-75d173cc9ad4'];
  assert.equal(ids.filter(id => matchesScopedRouteUnit({ route_producto_id: id, route_type: 'taxi_colectivo' }, ids[0], 'taxi_colectivo')).length, 2);
});
test('consulta colectiva rechaza unidad privada y de otra familia', () => {
  assert.equal(matchesScopedRouteUnit({ route_type: 'taxi_colectivo', is_private_route: true }, 'a', 'taxi_colectivo'), false);
  assert.equal(matchesScopedRouteUnit({ route_type: 'urbana' }, 'a', 'taxi_colectivo'), false);
});
test('ruta privada mantiene coincidencia exacta', () => assert.equal(matchesScopedRouteUnit({ route_producto_id: 'b' }, 'a', 'privada'), false));