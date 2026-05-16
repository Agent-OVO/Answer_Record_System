import assert from 'node:assert/strict';

process.env.TZ = 'Asia/Shanghai';

const { dateStringSchema, materialInputSchema } = await import('../src/lib/recordSchemas.ts');

const validDate = '2026-05-16';

assert.equal(dateStringSchema.safeParse(validDate).success, true);
assert.equal(
  materialInputSchema.safeParse({
    date: validDate,
    category: '经济',
    summary: '测试素材',
  }).success,
  true
);

assert.equal(dateStringSchema.safeParse('2024-02-29').success, true);
assert.equal(dateStringSchema.safeParse('2025-02-29').success, false);
assert.equal(dateStringSchema.safeParse('2026-13-01').success, false);
assert.equal(dateStringSchema.safeParse('2026-00-10').success, false);
assert.equal(dateStringSchema.safeParse('2026-05-00').success, false);

console.log('recordSchemas tests passed');
