import * as XLSX from 'xlsx';
import type { DailySummary, ExerciseRecord, MaterialRecord } from '../types';
import {
  dailySummaryInputSchema,
  exerciseInputSchema,
  formatZodError,
  materialInputSchema,
  type DailySummaryInput,
  type ExerciseInput,
  type MaterialInput,
} from './recordSchemas';

export const IMPORT_SHEETS = {
  exercises: '题目练习',
  materials: '素材积累',
  summaries: '每日总结',
} as const;

export const EXERCISE_COLUMNS = {
  date: '日期',
  type: '题型',
  totalQuestions: '总题数',
  correctQuestions: '做对题数',
  timeSpent: '用时',
} as const;

export const MATERIAL_COLUMNS = {
  date: '日期',
  category: '分类',
  summary: '主题内容',
} as const;

export const SUMMARY_COLUMNS = {
  date: '日期',
  content: '概述文字',
} as const;

type ImportIssueSeverity = 'error' | 'warning';
type ImportIssueScope = 'workbook' | 'exercise' | 'material' | 'summary';

export interface ImportIssue {
  severity: ImportIssueSeverity;
  scope: ImportIssueScope;
  row?: number;
  message: string;
}

export interface ImportPreviewData {
  fileName: string;
  exercises: ExerciseInput[];
  materials: MaterialInput[];
  summaries: DailySummaryInput[];
  issues: ImportIssue[];
  totalValid: number;
  hasBlockingIssues: boolean;
}

type WorkbookRow = Record<string, unknown>;

const formatDateParts = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const normalizeDateCell = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return formatDateParts(parsed.y, parsed.m, parsed.d);
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(/[/.]/g, '-');
    const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) return formatDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
    return normalized;
  }

  return String(value ?? '').trim();
};

const normalizeTimeCell = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '';

  if (typeof value === 'number') {
    if (value < 0 || value >= 1) return String(value);

    const totalSeconds = Math.round(value * 24 * 60 * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  return String(value).trim();
};

const isExampleRow = (value: unknown) => String(value ?? '').includes('示例');

const isEmptyRow = (values: unknown[]) => values.every(value => String(value ?? '').trim() === '');

const pushDuplicateWarnings = (
  issues: ImportIssue[],
  scope: Exclude<ImportIssueScope, 'workbook'>,
  rows: string[],
) => {
  const seen = new Map<string, number>();

  rows.forEach((rowKey, index) => {
    const previousRow = seen.get(rowKey);
    const currentRow = index + 2;

    if (previousRow) {
      issues.push({
        severity: 'warning',
        scope,
        row: currentRow,
        message: `与第 ${previousRow} 行内容重复，导入后会保留重复记录`,
      });
      return;
    }

    seen.set(rowKey, currentRow);
  });
};

export function parseImportWorkbook(fileName: string, buffer: ArrayBuffer): ImportPreviewData {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const issues: ImportIssue[] = [];

  const exercises = parseExerciseSheet(workbook, issues);
  const materials = parseMaterialSheet(workbook, issues);
  const summaries = parseSummarySheet(workbook, issues);

  if (
    !workbook.SheetNames.includes(IMPORT_SHEETS.exercises)
    && !workbook.SheetNames.includes(IMPORT_SHEETS.materials)
    && !workbook.SheetNames.includes(IMPORT_SHEETS.summaries)
  ) {
    issues.push({
      severity: 'error',
      scope: 'workbook',
      message: '未找到可识别的工作表，请使用系统提供的 Excel 模板',
    });
  }

  const totalValid = exercises.length + materials.length + summaries.length;

  if (totalValid === 0) {
    issues.push({
      severity: 'error',
      scope: 'workbook',
      message: '未找到可导入的数据，请检查模板、工作表名称和示例行',
    });
  }

  return {
    fileName,
    exercises,
    materials,
    summaries,
    issues,
    totalValid,
    hasBlockingIssues: issues.some(issue => issue.severity === 'error'),
  };
}

export function downloadRecordsWorkbook(
  records: {
    exercises: ExerciseRecord[];
    materials: MaterialRecord[];
    summaries: DailySummary[];
  },
  fileName: string,
) {
  XLSX.writeFile(buildRecordsWorkbook(records), fileName);
}

export function downloadTemplateWorkbook(fileName: string) {
  const workbook = buildRecordsWorkbook({
    exercises: [
      {
        id: 'template-exercise',
        userId: 'template',
        date: '2024-01-01',
        createdAt: 0,
        type: '政治理论',
        totalQuestions: 10,
        correctQuestions: 8,
        timeSpent: '15:30',
      },
    ],
    materials: [
      {
        id: 'template-material',
        userId: 'template',
        date: '2024-01-01',
        createdAt: 0,
        category: '经济',
        summary: '概括一句当日积累的素材或观点。',
      },
    ],
    summaries: [
      {
        id: 'template-summary',
        userId: 'template',
        date: '2024-01-01',
        createdAt: 0,
        content: '今天复盘顺利，晚间需要再补一轮错题。',
      },
    ],
  });

  XLSX.writeFile(workbook, fileName);
}

const buildRecordsWorkbook = (records: {
  exercises: ExerciseRecord[];
  materials: MaterialRecord[];
  summaries: DailySummary[];
}) => {
  const workbook = XLSX.utils.book_new();

  const exerciseRows = records.exercises.length
    ? records.exercises.map(record => ({
        [EXERCISE_COLUMNS.date]: record.date,
        [EXERCISE_COLUMNS.type]: record.type,
        [EXERCISE_COLUMNS.totalQuestions]: record.totalQuestions,
        [EXERCISE_COLUMNS.correctQuestions]: record.correctQuestions,
        [EXERCISE_COLUMNS.timeSpent]: record.timeSpent,
      }))
    : [{
        [EXERCISE_COLUMNS.date]: '示例 2024-01-01',
        [EXERCISE_COLUMNS.type]: '政治理论',
        [EXERCISE_COLUMNS.totalQuestions]: 10,
        [EXERCISE_COLUMNS.correctQuestions]: 8,
        [EXERCISE_COLUMNS.timeSpent]: '15:30',
      }];

  const materialRows = records.materials.length
    ? records.materials.map(record => ({
        [MATERIAL_COLUMNS.date]: record.date,
        [MATERIAL_COLUMNS.category]: record.category,
        [MATERIAL_COLUMNS.summary]: record.summary,
      }))
    : [{
        [MATERIAL_COLUMNS.date]: '示例 2024-01-01',
        [MATERIAL_COLUMNS.category]: '经济',
        [MATERIAL_COLUMNS.summary]: '概括一句当日积累的素材或观点。',
      }];

  const summaryRows = records.summaries.length
    ? records.summaries.map(record => ({
        [SUMMARY_COLUMNS.date]: record.date,
        [SUMMARY_COLUMNS.content]: record.content,
      }))
    : [{
        [SUMMARY_COLUMNS.date]: '示例 2024-01-01',
        [SUMMARY_COLUMNS.content]: '今天复盘顺利，晚间需要再补一轮错题。',
      }];

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exerciseRows), IMPORT_SHEETS.exercises);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(materialRows), IMPORT_SHEETS.materials);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), IMPORT_SHEETS.summaries);

  return workbook;
};

const parseExerciseSheet = (workbook: XLSX.WorkBook, issues: ImportIssue[]) => {
  if (!workbook.SheetNames.includes(IMPORT_SHEETS.exercises)) {
    issues.push({
      severity: 'warning',
      scope: 'exercise',
      message: '未找到“题目练习”工作表，本次将跳过练习数据',
    });
    return [];
  }

  const sheet = workbook.Sheets[IMPORT_SHEETS.exercises];
  const rows = XLSX.utils.sheet_to_json<WorkbookRow>(sheet, { defval: '' });
  const parsedRows: ExerciseInput[] = [];
  const duplicateKeys: string[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rowValues = Object.values(row);
    if (isEmptyRow(rowValues)) return;

    const date = normalizeDateCell(row[EXERCISE_COLUMNS.date]);
    if (isExampleRow(date)) return;

    const result = exerciseInputSchema.safeParse({
      date,
      type: String(row[EXERCISE_COLUMNS.type] ?? '').trim(),
      totalQuestions: row[EXERCISE_COLUMNS.totalQuestions],
      correctQuestions: row[EXERCISE_COLUMNS.correctQuestions],
      timeSpent: normalizeTimeCell(row[EXERCISE_COLUMNS.timeSpent]),
    });

    if (!result.success) {
      issues.push({
        severity: 'error',
        scope: 'exercise',
        row: rowNumber,
        message: formatZodError(result.error),
      });
      return;
    }

    parsedRows.push(result.data);
    duplicateKeys.push([
      result.data.date,
      result.data.type,
      result.data.totalQuestions,
      result.data.correctQuestions,
      result.data.timeSpent,
    ].join('|'));
  });

  pushDuplicateWarnings(issues, 'exercise', duplicateKeys);
  return parsedRows;
};

const parseMaterialSheet = (workbook: XLSX.WorkBook, issues: ImportIssue[]) => {
  if (!workbook.SheetNames.includes(IMPORT_SHEETS.materials)) {
    issues.push({
      severity: 'warning',
      scope: 'material',
      message: '未找到“素材积累”工作表，本次将跳过素材数据',
    });
    return [];
  }

  const sheet = workbook.Sheets[IMPORT_SHEETS.materials];
  const rows = XLSX.utils.sheet_to_json<WorkbookRow>(sheet, { defval: '' });
  const parsedRows: MaterialInput[] = [];
  const duplicateKeys: string[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rowValues = Object.values(row);
    if (isEmptyRow(rowValues)) return;

    const date = normalizeDateCell(row[MATERIAL_COLUMNS.date]);
    if (isExampleRow(date)) return;

    const result = materialInputSchema.safeParse({
      date,
      category: String(row[MATERIAL_COLUMNS.category] ?? '').trim(),
      summary: String(row[MATERIAL_COLUMNS.summary] ?? '').trim(),
    });

    if (!result.success) {
      issues.push({
        severity: 'error',
        scope: 'material',
        row: rowNumber,
        message: formatZodError(result.error),
      });
      return;
    }

    parsedRows.push(result.data);
    duplicateKeys.push([result.data.date, result.data.category, result.data.summary].join('|'));
  });

  pushDuplicateWarnings(issues, 'material', duplicateKeys);
  return parsedRows;
};

const parseSummarySheet = (workbook: XLSX.WorkBook, issues: ImportIssue[]) => {
  if (!workbook.SheetNames.includes(IMPORT_SHEETS.summaries)) {
    issues.push({
      severity: 'warning',
      scope: 'summary',
      message: '未找到“每日总结”工作表，本次将跳过总结数据',
    });
    return [];
  }

  const sheet = workbook.Sheets[IMPORT_SHEETS.summaries];
  const rows = XLSX.utils.sheet_to_json<WorkbookRow>(sheet, { defval: '' });
  const parsedRows: DailySummaryInput[] = [];
  const duplicateKeys: string[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rowValues = Object.values(row);
    if (isEmptyRow(rowValues)) return;

    const date = normalizeDateCell(row[SUMMARY_COLUMNS.date]);
    if (isExampleRow(date)) return;

    const result = dailySummaryInputSchema.safeParse({
      date,
      content: String(row[SUMMARY_COLUMNS.content] ?? '').trim(),
    });

    if (!result.success) {
      issues.push({
        severity: 'error',
        scope: 'summary',
        row: rowNumber,
        message: formatZodError(result.error),
      });
      return;
    }

    parsedRows.push(result.data);
    duplicateKeys.push([result.data.date, result.data.content].join('|'));
  });

  pushDuplicateWarnings(issues, 'summary', duplicateKeys);
  return parsedRows;
};
