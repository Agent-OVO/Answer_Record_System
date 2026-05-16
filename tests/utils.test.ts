import assert from 'node:assert/strict';
import { normalizeDateRange } from '../src/lib/utils.ts';

assert.deepEqual(normalizeDateRange('2026-05-01', '2026-05-16'), {
  startDate: '2026-05-01',
  endDate: '2026-05-16',
  wasReversed: false,
});

assert.deepEqual(normalizeDateRange('2026-05-16', '2026-05-01'), {
  startDate: '2026-05-01',
  endDate: '2026-05-16',
  wasReversed: true,
});

assert.deepEqual(normalizeDateRange('', '2026-05-16'), {
  startDate: '',
  endDate: '2026-05-16',
  wasReversed: false,
});

console.log('utils tests passed');
