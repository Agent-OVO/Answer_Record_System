import { z } from 'zod';
import { MATERIAL_CATEGORIES, QUESTION_TYPES, type MaterialCategory, type QuestionType } from '../types';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timeSpentPattern = /^\d{1,3}:\d{2}(?::\d{2})?$/;

const numberInputSchema = (label: string) =>
  z.union([z.string(), z.number()]).transform((value, ctx) => {
    const normalized = typeof value === 'string' ? value.trim() : value;

    if (normalized === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `请输入${label}`,
      });
      return z.NEVER;
    }

    const next = typeof normalized === 'number' ? normalized : Number(normalized);

    if (!Number.isFinite(next)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label}必须是有效数字`,
      });
      return z.NEVER;
    }

    if (!Number.isInteger(next)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label}必须是整数`,
      });
      return z.NEVER;
    }

    return next;
  });

const validDateString = (value: string) => {
  if (!datePattern.test(value)) return false;

  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const questionTypeSchema = z
  .string()
  .trim()
  .min(1, '请选择题型')
  .refine((value): value is QuestionType => QUESTION_TYPES.includes(value as QuestionType), '请选择有效的题型')
  .transform(value => value as QuestionType);

const materialCategorySchema = z
  .string()
  .trim()
  .min(1, '请选择分类')
  .refine(
    (value): value is MaterialCategory => MATERIAL_CATEGORIES.includes(value as MaterialCategory),
    '请选择有效的分类'
  )
  .transform(value => value as MaterialCategory);

export const dateStringSchema = z
  .string()
  .trim()
  .min(1, '请输入日期')
  .refine(validDateString, '日期格式必须为 YYYY-MM-DD');

export const exerciseInputSchema = z
  .object({
    date: dateStringSchema,
    type: questionTypeSchema,
    totalQuestions: numberInputSchema('总题数').refine(value => value >= 1, '总题数至少为 1'),
    correctQuestions: numberInputSchema('做对题数').refine(value => value >= 0, '做对题数不能小于 0'),
    timeSpent: z
      .string()
      .trim()
      .refine(value => value === '' || timeSpentPattern.test(value), '用时格式必须为 mm:ss 或 hh:mm:ss'),
  })
  .superRefine((value, ctx) => {
    if (value.correctQuestions > value.totalQuestions) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '做对题数不能大于总题数',
        path: ['correctQuestions'],
      });
    }
  });

export const materialInputSchema = z.object({
  date: dateStringSchema,
  category: materialCategorySchema,
  summary: z.string().trim().min(1, '请输入素材内容').max(500, '素材内容不能超过 500 字'),
});

export const dailySummaryInputSchema = z.object({
  date: dateStringSchema,
  content: z.string().trim().min(1, '请输入每日总结').max(100, '每日总结不能超过 100 字'),
});

export type ExerciseInput = z.infer<typeof exerciseInputSchema>;
export type MaterialInput = z.infer<typeof materialInputSchema>;
export type DailySummaryInput = z.infer<typeof dailySummaryInputSchema>;

export const formatZodError = (error: z.ZodError) =>
  error.issues.map(issue => issue.message).join('；');
