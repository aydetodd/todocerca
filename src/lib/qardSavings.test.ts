import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { uniquePocketConcepts } from './qardSavings';

test('tres Bolsillos Renta históricos se presentan como un solo concepto', () => {
  assert.deepEqual(uniquePocketConcepts([{ concepto: 'Vacaciones' }, { concepto: 'Renta' }, { concepto: 'Renta' }, { concepto: 'Renta' }, { concepto: 'Emergencias' }]), ['Vacaciones', 'Renta', 'Emergencias']);
});