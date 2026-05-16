import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  EXERCISE_COLUMNS,
  IMPORT_SHEETS,
  parseImportWorkbook,
} from '../src/lib/importWorkbook.ts';

const writeWorkbook = (rows: Array<Record<string, unknown>>) => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), IMPORT_SHEETS.exercises);
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
};

const baseExercise = {
  [EXERCISE_COLUMNS.type]: '政治理论',
  [EXERCISE_COLUMNS.totalQuestions]: 10,
  [EXERCISE_COLUMNS.correctQuestions]: 8,
};

const textDatePreview = parseImportWorkbook('text-date.xlsx', writeWorkbook([
  {
    ...baseExercise,
    [EXERCISE_COLUMNS.date]: '2024/1/1',
    [EXERCISE_COLUMNS.timeSpent]: '15:30',
  },
]));

assert.equal(textDatePreview.hasBlockingIssues, false);
assert.equal(textDatePreview.exercises[0]?.date, '2024-01-01');

const excelTimePreview = parseImportWorkbook('excel-time.xlsx', writeWorkbook([
  {
    ...baseExercise,
    [EXERCISE_COLUMNS.date]: '2024-01-01',
    [EXERCISE_COLUMNS.timeSpent]: 0.010763888888888889,
  },
]));

assert.equal(excelTimePreview.hasBlockingIssues, false);
assert.equal(excelTimePreview.exercises[0]?.timeSpent, '15:30');

const plainNumberTimePreview = parseImportWorkbook('plain-number-time.xlsx', writeWorkbook([
  {
    ...baseExercise,
    [EXERCISE_COLUMNS.date]: '2024-01-01',
    [EXERCISE_COLUMNS.timeSpent]: 15,
  },
]));

assert.equal(plainNumberTimePreview.hasBlockingIssues, true);
assert.equal(plainNumberTimePreview.exercises.length, 0);
assert.match(plainNumberTimePreview.issues.map(issue => issue.message).join('\n'), /用时格式/);

console.log('importWorkbook tests passed');
