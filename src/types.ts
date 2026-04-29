export type User = {
  id: string;
  username: string;
};

export const QUESTION_TYPES = [
  '政治理论',
  '常识判断',
  '言语理解',
  '数量关系',
  '判断推理',
  '资料分析',
] as const;
export type QuestionType = typeof QUESTION_TYPES[number];

export const MATERIAL_CATEGORIES = [
  '经济',
  '政治',
  '文化',
  '社会',
  '生态',
  '党建',
  '国防',
  '外交',
] as const;
export type MaterialCategory = typeof MATERIAL_CATEGORIES[number];

export interface BaseRecord {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  createdAt: number;
  deletedAt?: number;
}

export interface ExerciseRecord extends BaseRecord {
  type: QuestionType;
  totalQuestions: number;
  correctQuestions: number;
  timeSpent: string; // mm:ss
}

export interface MaterialRecord extends BaseRecord {
  category: MaterialCategory;
  summary: string;
}

export interface DailySummary extends BaseRecord {
  content: string; // max 100 chars
}
