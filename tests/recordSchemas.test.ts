import assert from 'node:assert/strict';

process.env.TZ = 'Asia/Shanghai';

const { dateStringSchema, exerciseInputSchema, materialInputSchema } = await import('../src/lib/recordSchemas.ts');

const validDate = '2026-05-16';

assert.equal(dateStringSchema.safeParse(validDate).success, true);
assert.deepEqual(dateStringSchema.safeParse('2026/05/16'), {
  success: true,
  data: validDate,
});
assert.deepEqual(dateStringSchema.safeParse('2026.5.6'), {
  success: true,
  data: '2026-05-06',
});
assert.equal(
  materialInputSchema.safeParse({
    date: validDate,
    category: '经济',
    summary: '测试素材',
  }).success,
  true
);
assert.deepEqual(materialInputSchema.safeParse({
  date: '2026/05/16',
  category: '政治',
  summary: '正确的政绩观：义乌发展经验',
}), {
  success: true,
  data: {
    date: validDate,
    category: '政治',
    summary: '正确的政绩观：义乌发展经验',
  },
});

assert.equal(dateStringSchema.safeParse('2024-02-29').success, true);
assert.equal(dateStringSchema.safeParse('2025-02-29').success, false);
assert.equal(dateStringSchema.safeParse('2026-13-01').success, false);
assert.equal(dateStringSchema.safeParse('2026/13/01').success, false);
assert.equal(dateStringSchema.safeParse('2026-00-10').success, false);
assert.equal(dateStringSchema.safeParse('2026-05-00').success, false);

const validExercise = {
  date: validDate,
  type: '政治理论',
  totalQuestions: 10,
  correctQuestions: 8,
};

assert.equal(exerciseInputSchema.safeParse({ ...validExercise, timeSpent: '59:59' }).success, true);
assert.equal(exerciseInputSchema.safeParse({ ...validExercise, timeSpent: '60:00' }).success, true);
assert.equal(exerciseInputSchema.safeParse({ ...validExercise, timeSpent: '1:02:03' }).success, true);
assert.equal(exerciseInputSchema.safeParse({ ...validExercise, timeSpent: '1:99' }).success, false);
assert.equal(exerciseInputSchema.safeParse({ ...validExercise, timeSpent: '12:60' }).success, false);
assert.equal(exerciseInputSchema.safeParse({ ...validExercise, timeSpent: '1:02:60' }).success, false);
assert.equal(exerciseInputSchema.safeParse({ ...validExercise, timeSpent: '1000:00' }).success, false);

console.log('recordSchemas tests passed');
