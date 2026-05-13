import * as XLSX from 'xlsx';
import type { DailySummary, ExerciseRecord, MaterialRecord } from '../types';
import { formatDate } from './utils';
import { isSupabaseConfigured, supabase } from './supabase';

export type AdminRangePreset = 'today' | 'week' | 'month' | 'custom';
export type AdminRecordTypeFilter = 'all' | 'exercise' | 'material' | 'summary';
export type AdminUserStatusFilter = 'all' | 'high_active' | 'stable_active' | 'low_active' | 'silent' | 'risk';

export type AdminAnalyticsFilters = {
  preset: AdminRangePreset;
  startDate: string;
  endDate: string;
  search: string;
  recordType: AdminRecordTypeFilter;
  userStatus: AdminUserStatusFilter;
};

export type AdminStatus = {
  isAdmin: boolean;
  isCloudMode: boolean;
  reason?: string;
};

export type AdminOverview = {
  totalUsers: number;
  activeUsers: number;
  silentUsers: number;
  totalRecords: number;
  exerciseRecords: number;
  materialRecords: number;
  summaryRecords: number;
  averageRecordsPerUser: number;
  totalQuestions: number;
  averageAccuracy: number;
  deletedRecords: number;
  lastRecordAt: string | null;
  pageViews: number;
  eventCount: number;
  sessionCount: number;
  activeDurationMs: number;
};

export type AdminDailyActivity = {
  date: string;
  activeUsers: number;
  records: number;
  exerciseRecords: number;
  materialRecords: number;
  summaryRecords: number;
  totalQuestions: number;
  averageAccuracy: number;
  recordsPerUser: number;
  activeDurationMs: number;
  sessionCount: number;
  eventCount: number;
};

export type AdminRecordStructure = {
  recordTypeShare: Array<{ name: string; value: number; percent: number }>;
  questionTypeStats: Array<{ name: string; totalQuestions: number; correctQuestions: number; accuracy: number; records: number }>;
  materialCategoryStats: Array<{ name: string; records: number; percent: number }>;
  summaryStats: {
    summaryDays: number;
    completionRate: number;
    averageLength: number;
  };
};

export type AdminUserActivity = {
  userId: string;
  username: string;
  lastActiveAt: string | null;
  activeDays: number;
  streakDays: number;
  totalRecords: number;
  exerciseRecords: number;
  materialRecords: number;
  summaryRecords: number;
  totalQuestions: number;
  averageAccuracy: number;
  deletedRecords: number;
  eventCount: number;
  sessionCount: number;
  activeDurationMs: number;
  riskTags: string[];
  status: '高活跃' | '稳定活跃' | '低活跃' | '长期未活跃' | '数据异常';
};

export type AdminEventOverview = {
  eventCount: number;
  pageViews: number;
  recordMutations: number;
  syncFailures: number;
  errorEvents: number;
  activeEventUsers: number;
};

export type AdminFeatureUsage = {
  name: string;
  eventName: string;
  count: number;
  users: number;
};

export type AdminBehaviorFunnel = {
  step: string;
  count: number;
  users: number;
  conversionRate: number;
};

export type AdminErrorEvent = {
  id: string;
  userId: string;
  username: string;
  eventTimeMs: number;
  page: string;
  message: string;
  source: string;
};

export type AdminUserEvent = {
  id: string;
  userId: string;
  username: string;
  eventName: string;
  actionText: string;
  eventTimeMs: number;
  localDate: string;
  page: string;
  recordType?: string | null;
  recordId?: string | null;
  metadata?: Record<string, unknown>;
};

export type AdminSessionOverview = {
  sessionCount: number;
  activeUsers: number;
  averageDurationMs: number;
  averageActiveDurationMs: number;
  totalActiveDurationMs: number;
  averageEventsPerSession: number;
  averageRecordsPerSession: number;
};

export type AdminSessionTrend = {
  date: string;
  sessionCount: number;
  activeDurationMs: number;
  averageActiveDurationMs: number;
  eventCount: number;
  recordCount: number;
};

export type AdminHeatmapCell = {
  weekday: number;
  hour: number;
  activeDurationMs: number;
  eventCount: number;
  sessionCount: number;
};

export type AdminUserSession = {
  id: string;
  userId: string;
  username: string;
  startedAtMs: number;
  endedAtMs: number | null;
  durationMs: number;
  activeDurationMs: number;
  idleDurationMs: number;
  pageCount: number;
  eventCount: number;
  recordCount: number;
  completedRecordCount: number;
};

export type AdminAnalyticsBundle = {
  status: AdminStatus;
  overview: AdminOverview;
  dailyActivity: AdminDailyActivity[];
  structure: AdminRecordStructure;
  users: AdminUserActivity[];
  eventOverview: AdminEventOverview;
  featureUsage: AdminFeatureUsage[];
  funnel: AdminBehaviorFunnel[];
  errors: AdminErrorEvent[];
  timeline: AdminUserEvent[];
  sessionOverview: AdminSessionOverview;
  sessionTrend: AdminSessionTrend[];
  heatmap: AdminHeatmapCell[];
  sessions: AdminUserSession[];
  notice?: string;
};

const emptyOverview: AdminOverview = {
  totalUsers: 0,
  activeUsers: 0,
  silentUsers: 0,
  totalRecords: 0,
  exerciseRecords: 0,
  materialRecords: 0,
  summaryRecords: 0,
  averageRecordsPerUser: 0,
  totalQuestions: 0,
  averageAccuracy: 0,
  deletedRecords: 0,
  lastRecordAt: null,
  pageViews: 0,
  eventCount: 0,
  sessionCount: 0,
  activeDurationMs: 0,
};

const emptyEventOverview: AdminEventOverview = {
  eventCount: 0,
  pageViews: 0,
  recordMutations: 0,
  syncFailures: 0,
  errorEvents: 0,
  activeEventUsers: 0,
};

const emptySessionOverview: AdminSessionOverview = {
  sessionCount: 0,
  activeUsers: 0,
  averageDurationMs: 0,
  averageActiveDurationMs: 0,
  totalActiveDurationMs: 0,
  averageEventsPerSession: 0,
  averageRecordsPerSession: 0,
};

export const createDefaultAdminFilters = (): AdminAnalyticsFilters => {
  const today = new Date();
  const endDate = formatDate(today);
  const start = new Date(today);
  start.setDate(start.getDate() - 29);

  return {
    preset: 'month',
    startDate: formatDate(start),
    endDate,
    search: '',
    recordType: 'all',
    userStatus: 'all',
  };
};

export const resolveDateRange = (
  preset: AdminRangePreset,
  customStart?: string,
  customEnd?: string,
) => {
  const today = new Date();
  const endDate = formatDate(today);
  const start = new Date(today);

  if (preset === 'today') return { startDate: endDate, endDate };
  if (preset === 'week') start.setDate(start.getDate() - 6);
  if (preset === 'month') start.setDate(start.getDate() - 29);

  if (preset === 'custom') {
    return {
      startDate: customStart || '1970-01-01',
      endDate: customEnd || '2099-12-31',
    };
  }

  return { startDate: formatDate(start), endDate };
};

export const formatPercent = (value: number, digits = 1) =>
  `${Number.isFinite(value) ? value.toFixed(digits) : '0.0'}%`;

export const formatDuration = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) return '0 分钟';
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} 分钟`;
  return `${hours} 小时 ${minutes} 分钟`;
};

const toNumber = (value: unknown) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};

const toStringValue = (value: unknown) => typeof value === 'string' ? value : '';

const parseTimeValue = (value: string) => {
  const parts = value.split(':').map(Number);
  if (parts.some(part => !Number.isFinite(part))) return 0;
  if (parts.length === 2) return parts[0] * 60000 + parts[1] * 1000;
  if (parts.length === 3) return parts[0] * 3600000 + parts[1] * 60000 + parts[2] * 1000;
  return 0;
};

const dateRange = (startDate: string, endDate: string) => {
  const dates: string[] = [];
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return dates;

  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const activeStreak = (dates: string[]) => {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length === 0) return 0;
  let best = 1;
  let current = 1;

  for (let index = 1; index < sorted.length; index += 1) {
    const prev = new Date(`${sorted[index - 1]}T00:00:00`);
    const next = new Date(`${sorted[index]}T00:00:00`);
    const diff = Math.round((next.getTime() - prev.getTime()) / 86400000);
    if (diff === 1) current += 1;
    else current = 1;
    best = Math.max(best, current);
  }

  return best;
};

export const classifyUserRisk = (input: {
  activeDays: number;
  totalRecords: number;
  summaryRecords: number;
  exerciseRecords: number;
  deletedRecords: number;
  averageAccuracy: number;
  lastActiveAt: string | null;
}) => {
  const tags: string[] = [];
  const now = new Date();
  const lastActiveAt = input.lastActiveAt ? new Date(input.lastActiveAt) : null;
  const inactiveDays = lastActiveAt && !Number.isNaN(lastActiveAt.getTime())
    ? Math.floor((now.getTime() - lastActiveAt.getTime()) / 86400000)
    : Infinity;

  if (input.activeDays >= 10 || input.totalRecords >= 30) tags.push('高活跃');
  if (input.activeDays >= 5 && input.totalRecords >= 10) tags.push('稳定活跃');
  if (input.activeDays > 0 && input.totalRecords < 5) tags.push('低活跃');
  if (inactiveDays >= 14) tags.push('长期未活跃');
  if (input.exerciseRecords > 0 && input.summaryRecords === 0) tags.push('总结缺失');
  if (input.deletedRecords >= 5 || input.deletedRecords > Math.max(3, input.totalRecords * 0.4)) tags.push('频繁删除');
  if (input.exerciseRecords >= 3 && input.averageAccuracy < 50) tags.push('正确率下降');
  if (input.totalRecords === 0 && input.activeDays > 0) tags.push('数据异常');

  return [...new Set(tags)];
};

type LocalRecord =
  | (ExerciseRecord & { kind: 'exercise' })
  | (MaterialRecord & { kind: 'material' })
  | (DailySummary & { kind: 'summary' });

export const buildLocalAdminAnalytics = (
  input: {
    currentUser?: { id: string; username: string } | null;
    exercises: ExerciseRecord[];
    materials: MaterialRecord[];
    summaries: DailySummary[];
  },
  filters: AdminAnalyticsFilters,
): AdminAnalyticsBundle => {
  const currentUser = input.currentUser;
  const allRecords: LocalRecord[] = [
    ...input.exercises.map(record => ({ ...record, kind: 'exercise' as const })),
    ...input.materials.map(record => ({ ...record, kind: 'material' as const })),
    ...input.summaries.map(record => ({ ...record, kind: 'summary' as const })),
  ].filter(record => !currentUser || record.userId === currentUser.id);

  const matchesType = (record: LocalRecord) => filters.recordType === 'all' || record.kind === filters.recordType;
  const matchesPeriod = (record: LocalRecord) => record.date >= filters.startDate && record.date <= filters.endDate;

  const periodRecords = allRecords.filter(record => matchesPeriod(record) && matchesType(record));
  const activeRecords = periodRecords.filter(record => !record.deletedAt);
  const deletedRecords = periodRecords.filter(record => record.deletedAt);
  const exercises = activeRecords.filter((record): record is ExerciseRecord & { kind: 'exercise' } => record.kind === 'exercise');
  const materials = activeRecords.filter((record): record is MaterialRecord & { kind: 'material' } => record.kind === 'material');
  const summaries = activeRecords.filter((record): record is DailySummary & { kind: 'summary' } => record.kind === 'summary');

  const activeDates = [...new Set(activeRecords.map(record => record.date))];
  const totalQuestions = exercises.reduce((sum, record) => sum + toNumber(record.totalQuestions), 0);
  const correctQuestions = exercises.reduce((sum, record) => sum + toNumber(record.correctQuestions), 0);
  const lastRecord = [...activeRecords].sort((a, b) => b.createdAt - a.createdAt)[0];
  const activeUsers = currentUser && activeRecords.length > 0 ? 1 : 0;
  const totalUsers = currentUser && allRecords.length > 0 ? 1 : 0;

  const riskTags = classifyUserRisk({
    activeDays: activeDates.length,
    totalRecords: activeRecords.length,
    summaryRecords: summaries.length,
    exerciseRecords: exercises.length,
    deletedRecords: deletedRecords.length,
    averageAccuracy: totalQuestions > 0 ? (correctQuestions / totalQuestions) * 100 : 0,
    lastActiveAt: lastRecord ? new Date(lastRecord.createdAt).toISOString() : null,
  });

  const userRow: AdminUserActivity | null = currentUser ? {
    userId: currentUser.id,
    username: currentUser.username,
    lastActiveAt: lastRecord ? new Date(lastRecord.createdAt).toISOString() : null,
    activeDays: activeDates.length,
    streakDays: activeStreak(activeDates),
    totalRecords: activeRecords.length,
    exerciseRecords: exercises.length,
    materialRecords: materials.length,
    summaryRecords: summaries.length,
    totalQuestions,
    averageAccuracy: totalQuestions > 0 ? (correctQuestions / totalQuestions) * 100 : 0,
    deletedRecords: deletedRecords.length,
    eventCount: 0,
    sessionCount: 0,
    activeDurationMs: exercises.reduce((sum, record) => sum + parseTimeValue(record.timeSpent || ''), 0),
    riskTags,
    status: riskTags.includes('长期未活跃')
      ? '长期未活跃'
      : riskTags.includes('数据异常')
        ? '数据异常'
        : riskTags.includes('高活跃')
          ? '高活跃'
          : riskTags.includes('稳定活跃')
            ? '稳定活跃'
            : '低活跃',
  } : null;

  const dailyActivity = dateRange(filters.startDate, filters.endDate).map((date) => {
    const records = activeRecords.filter(record => record.date === date);
    const dayExercises = records.filter((record): record is ExerciseRecord & { kind: 'exercise' } => record.kind === 'exercise');
    const dayQuestions = dayExercises.reduce((sum, record) => sum + toNumber(record.totalQuestions), 0);
    const dayCorrect = dayExercises.reduce((sum, record) => sum + toNumber(record.correctQuestions), 0);
    return {
      date,
      activeUsers: records.length > 0 ? 1 : 0,
      records: records.length,
      exerciseRecords: dayExercises.length,
      materialRecords: records.filter(record => record.kind === 'material').length,
      summaryRecords: records.filter(record => record.kind === 'summary').length,
      totalQuestions: dayQuestions,
      averageAccuracy: dayQuestions > 0 ? (dayCorrect / dayQuestions) * 100 : 0,
      recordsPerUser: records.length,
      activeDurationMs: dayExercises.reduce((sum, record) => sum + parseTimeValue(record.timeSpent || ''), 0),
      sessionCount: 0,
      eventCount: 0,
    };
  });

  const recordTypeRows = [
    { name: '练习记录', value: exercises.length },
    { name: '素材记录', value: materials.length },
    { name: '总结记录', value: summaries.length },
  ];
  const recordTypeTotal = recordTypeRows.reduce((sum, item) => sum + item.value, 0);

  const questionTypes = [...new Set(exercises.map(record => record.type))];
  const materialCategories = [...new Set(materials.map(record => record.category))];

  const structure: AdminRecordStructure = {
    recordTypeShare: recordTypeRows.map(item => ({
      ...item,
      percent: recordTypeTotal > 0 ? (item.value / recordTypeTotal) * 100 : 0,
    })),
    questionTypeStats: questionTypes.map(name => {
      const records = exercises.filter(record => record.type === name);
      const questions = records.reduce((sum, record) => sum + toNumber(record.totalQuestions), 0);
      const correct = records.reduce((sum, record) => sum + toNumber(record.correctQuestions), 0);
      return {
        name,
        totalQuestions: questions,
        correctQuestions: correct,
        accuracy: questions > 0 ? (correct / questions) * 100 : 0,
        records: records.length,
      };
    }),
    materialCategoryStats: materialCategories.map(name => {
      const count = materials.filter(record => record.category === name).length;
      return {
        name,
        records: count,
        percent: materials.length > 0 ? (count / materials.length) * 100 : 0,
      };
    }),
    summaryStats: {
      summaryDays: new Set(summaries.map(record => record.date)).size,
      completionRate: activeDates.length > 0 ? (new Set(summaries.map(record => record.date)).size / activeDates.length) * 100 : 0,
      averageLength: summaries.length > 0
        ? summaries.reduce((sum, record) => sum + record.content.length, 0) / summaries.length
        : 0,
    },
  };

  const overview: AdminOverview = {
    ...emptyOverview,
    totalUsers,
    activeUsers,
    silentUsers: totalUsers > 0 && activeUsers === 0 ? 1 : 0,
    totalRecords: activeRecords.length,
    exerciseRecords: exercises.length,
    materialRecords: materials.length,
    summaryRecords: summaries.length,
    averageRecordsPerUser: activeUsers > 0 ? activeRecords.length / activeUsers : 0,
    totalQuestions,
    averageAccuracy: totalQuestions > 0 ? (correctQuestions / totalQuestions) * 100 : 0,
    deletedRecords: deletedRecords.length,
    lastRecordAt: lastRecord ? new Date(lastRecord.createdAt).toISOString() : null,
    activeDurationMs: userRow?.activeDurationMs || 0,
  };

  const users = userRow ? [userRow] : [];

  return {
    status: {
      isAdmin: true,
      isCloudMode: false,
      reason: '本地模式仅展示当前用户样例，不代表全体用户统计。',
    },
    overview,
    dailyActivity,
    structure,
    users,
    eventOverview: emptyEventOverview,
    featureUsage: [],
    funnel: [],
    errors: [],
    timeline: [],
    sessionOverview: emptySessionOverview,
    sessionTrend: [],
    heatmap: [],
    sessions: [],
    notice: '当前未配置 Supabase，本地模式无法读取全体用户数据、行为事件和学习会话。下方数据仅用于查看当前用户口径样例。',
  };
};

const rpc = async <T,>(name: string, args: Record<string, unknown>, fallback: T): Promise<T> => {
  if (!isSupabaseConfigured || !supabase) return fallback;

  try {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    return (data ?? fallback) as T;
  } catch (error) {
    console.warn(`Failed to call admin analytics RPC: ${name}`, error);
    return fallback;
  }
};

const rangeArgs = (filters: Pick<AdminAnalyticsFilters, 'startDate' | 'endDate'>) => ({
  start_date: filters.startDate,
  end_date: filters.endDate,
});

const isMissingRpcError = (error: unknown) => {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const code = typeof record.code === 'string' ? record.code : '';
  const message = typeof record.message === 'string' ? record.message : '';
  return code === 'PGRST202' || message.includes('schema cache');
};

export const checkIsAdmin = async (): Promise<AdminStatus> => {
  if (!isSupabaseConfigured || !supabase) {
    return {
      isAdmin: true,
      isCloudMode: false,
      reason: '本地模式没有全体用户权限校验，仅可查看当前用户样例。',
    };
  }

  const { data, error } = await supabase.rpc('is_admin_user');
  if (error) {
    if (isMissingRpcError(error)) {
      const { data: legacyData, error: legacyError } = await supabase.rpc('is_admin');
      if (!legacyError) {
        return { isAdmin: Boolean(legacyData), isCloudMode: true };
      }
    }

    console.warn('Failed to check admin status', error);
    return { isAdmin: false, isCloudMode: true, reason: error.message };
  }

  return { isAdmin: Boolean(data), isCloudMode: true };
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const asArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(asRecord) : [];

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const s = (value: unknown) => typeof value === 'string' ? value : '';

const msToIso = (value: unknown) => {
  const next = n(value);
  return next > 0 ? new Date(next).toISOString() : null;
};

const riskTagLabel: Record<string, string> = {
  long_inactive: '长期未活跃',
  summary_missing: '总结缺失',
  low_accuracy: '正确率下降',
  frequent_delete: '频繁删除',
  data_anomaly: '数据异常',
};

const statusLabel: Record<string, AdminUserActivity['status']> = {
  high_activity: '高活跃',
  stable_activity: '稳定活跃',
  low_activity: '低活跃',
  silent: '长期未活跃',
  no_records: '数据异常',
};

const eventLabel: Record<string, string> = {
  page_view: '页面访问',
  record_create: '新增记录',
  record_update: '更新记录',
  record_delete: '删除记录',
  record_restore: '恢复记录',
  exercise_start: '开始练习',
  exercise_submit: '提交练习',
  material_open: '打开素材',
  material_search: '搜索素材',
  material_filter_apply: '筛选素材',
  summary_open: '打开总结',
  summary_save: '保存总结',
  import_data: '导入数据',
  export_data: '导出数据',
  sync_start: '开始同步',
  sync_success: '同步成功',
  sync_failed: '同步失败',
  login: '登录',
  logout: '退出登录',
  error: '错误事件',
};

const pageLabel: Record<string, string> = {
  '/': '仪表盘',
  '/login': '登录页',
  '/exercises': '题目练习',
  '/materials': '素材积累',
  '/summaries': '每日总结',
  '/statistics': '统计分析',
  '/admin/analytics': '用户行为分析',
  '/sync': '数据同步',
  '/accounts': '账户管理',
  '/trash': '回收站',
};

const recordTypeLabel: Record<string, string> = {
  exercise: '练习记录',
  material: '素材记录',
  summary: '每日总结',
};

const generatedCloudEmailPattern = /^user-[a-f0-9]{64}@answer-record\.invalid$/i;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

const getDisplayUsername = (username: unknown, userId: unknown) => {
  const candidate = s(username).trim();
  if (candidate && !generatedCloudEmailPattern.test(candidate) && !uuidPattern.test(candidate)) {
    return candidate;
  }

  return s(userId).slice(0, 8) || '未知用户';
};

const getMetadataText = (metadata: Record<string, unknown>, key: string) => {
  const value = metadata[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
};

export const getAdminPageLabel = (page?: string | null) => {
  const normalized = (page || '').replace(/\/$/, '') || '/';
  if (normalized.startsWith('/admin/users/')) {
    return '用户详情';
  }
  return pageLabel[normalized] || page || '未知页面';
};

export const getAdminRecordTypeLabel = (recordType?: string | null) =>
  recordType ? (recordTypeLabel[recordType] || recordType) : '';

const buildRecordHint = (event: Pick<AdminUserEvent, 'recordType' | 'metadata'>) => {
  const metadata = event.metadata ?? {};
  const pieces = [
    getMetadataText(metadata, 'date'),
    getMetadataText(metadata, 'type'),
    getMetadataText(metadata, 'category'),
  ].filter(Boolean);

  return pieces.length > 0 ? `（${pieces.join(' · ')}）` : '';
};

export const describeAdminEvent = (event: Pick<AdminUserEvent, 'eventName' | 'page' | 'recordType' | 'metadata'>) => {
  const metadata = event.metadata ?? {};
  const recordLabel = getAdminRecordTypeLabel(event.recordType) || '记录';
  const recordHint = buildRecordHint(event);
  const page = getAdminPageLabel(event.page);
  const errorMessage = getMetadataText(metadata, 'errorMessage') || getMetadataText(metadata, 'error');

  switch (event.eventName) {
    case 'page_view':
      return `访问了${page}`;
    case 'record_create':
      return `新增了${recordLabel}${recordHint}`;
    case 'record_update':
      return `更新了${recordLabel}${recordHint}`;
    case 'record_delete':
      return `${metadata.hardDelete ? '彻底删除了' : '删除了'}${recordLabel}${recordHint}`;
    case 'record_restore':
      return `从回收站恢复了${recordLabel}${recordHint}`;
    case 'exercise_start':
      return `开始练习${recordHint}`;
    case 'exercise_submit':
      return `提交了练习${recordHint}`;
    case 'material_open':
      return `打开了素材${recordHint}`;
    case 'material_search':
      return '搜索了素材';
    case 'material_filter_apply':
      return '筛选了素材';
    case 'summary_open':
      return `打开了每日总结${recordHint}`;
    case 'summary_save':
      return `保存了每日总结${recordHint}`;
    case 'import_data':
      return `导入了数据${getMetadataText(metadata, 'recordCount') ? `（${getMetadataText(metadata, 'recordCount')} 条）` : ''}`;
    case 'export_data':
      return '导出了数据';
    case 'sync_start':
      return '开始同步数据';
    case 'sync_success':
      return '数据同步成功';
    case 'sync_failed':
      return `数据同步失败${errorMessage ? `：${errorMessage}` : ''}`;
    case 'login':
      return '登录了系统';
    case 'logout':
      return '退出了系统';
    case 'session_start':
      return '开始了一次学习会话';
    case 'session_end':
      return '结束了一次学习会话';
    case 'error':
      return `发生错误${errorMessage ? `：${errorMessage}` : ''}`;
    default:
      return eventLabel[event.eventName] || event.eventName || '未知操作';
  }
};

const mapOverview = (rawValue: unknown): AdminOverview => {
  const raw = asRecord(rawValue);
  return {
    ...emptyOverview,
    totalUsers: n(raw.total_users),
    activeUsers: n(raw.active_users),
    silentUsers: n(raw.silent_users),
    totalRecords: n(raw.total_records),
    exerciseRecords: n(raw.exercise_records),
    materialRecords: n(raw.material_records),
    summaryRecords: n(raw.summary_records),
    averageRecordsPerUser: n(raw.average_records_per_active_user),
    totalQuestions: n(raw.total_questions),
    averageAccuracy: n(raw.average_accuracy),
    deletedRecords: n(raw.deleted_records),
    lastRecordAt: msToIso(raw.latest_activity_ms),
  };
};

const mapStructure = (rawValue: unknown): AdminRecordStructure => {
  const raw = asRecord(rawValue);
  const recordBreakdown = asArray(raw.record_type_breakdown);
  const recordTotal = recordBreakdown.reduce((sum, item) => sum + n(item.record_count), 0);
  const materialBreakdown = asArray(raw.material_category_breakdown);
  const materialTotal = materialBreakdown.reduce((sum, item) => sum + n(item.record_count), 0);

  return {
    recordTypeShare: [
      { name: '练习记录', value: n(raw.exercise_records), percent: recordTotal > 0 ? (n(raw.exercise_records) / recordTotal) * 100 : 0 },
      { name: '素材记录', value: n(raw.material_records), percent: recordTotal > 0 ? (n(raw.material_records) / recordTotal) * 100 : 0 },
      { name: '总结记录', value: n(raw.summary_records), percent: recordTotal > 0 ? (n(raw.summary_records) / recordTotal) * 100 : 0 },
    ],
    questionTypeStats: asArray(raw.exercise_type_breakdown).map(item => ({
      name: s(item.type) || '未分类',
      totalQuestions: n(item.total_questions),
      correctQuestions: n(item.correct_questions),
      accuracy: n(item.average_accuracy),
      records: n(item.record_count),
    })),
    materialCategoryStats: materialBreakdown.map(item => ({
      name: s(item.category) || '未分类',
      records: n(item.record_count),
      percent: materialTotal > 0 ? (n(item.record_count) / materialTotal) * 100 : 0,
    })),
    summaryStats: {
      summaryDays: n(raw.completed_summary_records),
      completionRate: n(raw.total_records) > 0 ? (n(raw.summary_records) / n(raw.total_records)) * 100 : 0,
      averageLength: n(raw.average_summary_content_length),
    },
  };
};

const mapDailyActivity = (rows: unknown): AdminDailyActivity[] =>
  asArray(rows).map(row => ({
    date: s(row.date),
    activeUsers: n(row.active_users),
    records: n(row.record_count),
    exerciseRecords: n(row.exercise_records),
    materialRecords: n(row.material_records),
    summaryRecords: n(row.summary_records),
    totalQuestions: n(row.total_questions),
    averageAccuracy: n(row.average_accuracy),
    recordsPerUser: n(row.average_records_per_active_user),
    activeDurationMs: n(row.total_active_duration_ms),
    sessionCount: n(row.session_count),
    eventCount: n(row.event_count),
  }));

const mapUserActivity = (rows: unknown): AdminUserActivity[] =>
  asArray(rows).map(row => {
    const rawTags = Array.isArray(row.risk_tags) ? row.risk_tags.map(String) : [];
    const riskTags = rawTags.map(tag => riskTagLabel[tag] || tag);
    return {
      userId: s(row.user_id),
      username: getDisplayUsername(row.username, row.user_id),
      lastActiveAt: msToIso(row.latest_activity_ms),
      activeDays: n(row.active_days),
      streakDays: n(row.active_days),
      totalRecords: n(row.record_count),
      exerciseRecords: n(row.exercise_records),
      materialRecords: n(row.material_records),
      summaryRecords: n(row.summary_records),
      totalQuestions: n(row.total_questions),
      averageAccuracy: n(row.average_accuracy),
      deletedRecords: n(row.deleted_records),
      eventCount: n(row.event_count),
      sessionCount: n(row.session_count),
      activeDurationMs: n(row.total_active_duration_ms),
      riskTags,
      status: statusLabel[s(row.status)] || (riskTags.includes('长期未活跃') ? '长期未活跃' : '低活跃'),
    };
  });

export const fetchAdminActivityOverview = (filters: AdminAnalyticsFilters) =>
  rpc<unknown>('get_admin_activity_overview', rangeArgs(filters), null).then(mapOverview);

export const fetchAdminDailyActivity = (filters: AdminAnalyticsFilters) =>
  rpc<unknown>('get_admin_daily_activity', rangeArgs(filters), []).then(mapDailyActivity);

export const fetchAdminUserActivity = (filters: AdminAnalyticsFilters) =>
  rpc<unknown>('get_admin_user_activity', rangeArgs(filters), []).then(mapUserActivity);

export const fetchAdminEventOverview = (filters: AdminAnalyticsFilters) =>
  rpc<unknown>('get_admin_event_overview', rangeArgs(filters), null).then((value) => {
    const raw = asRecord(value);
    return {
      eventCount: n(raw.total_events),
      pageViews: n(raw.page_views),
      recordMutations: n(raw.record_creates) + n(raw.record_updates) + n(raw.record_deletes),
      syncFailures: n(raw.sync_failures),
      errorEvents: n(raw.error_events),
      activeEventUsers: n(raw.active_users),
    };
  });

export const fetchAdminFeatureUsage = (filters: AdminAnalyticsFilters) =>
  rpc<unknown>('get_admin_feature_usage', rangeArgs(filters), null).then((value) =>
    asArray(asRecord(value).features).map(item => ({
      name: eventLabel[s(item.event_name)] || s(item.event_name) || '未知功能',
      eventName: s(item.event_name),
      count: n(item.event_count),
      users: n(item.user_count),
    }))
  );

export const fetchAdminBehaviorFunnel = (filters: AdminAnalyticsFilters) =>
  rpc<unknown>('get_admin_behavior_funnel', rangeArgs(filters), null).then((value) => {
    const rows = asArray(asRecord(value).steps);
    const firstUsers = n(rows[0]?.user_count) || 1;
    return rows.map(item => ({
      step: eventLabel[s(item.step_name)] || s(item.step_name),
      count: n(item.event_count),
      users: n(item.user_count),
      conversionRate: firstUsers > 0 ? (n(item.user_count) / firstUsers) * 100 : 0,
    }));
  });

export const fetchAdminErrorEvents = (filters: AdminAnalyticsFilters) =>
  rpc<unknown>('get_admin_error_events', rangeArgs(filters), null).then((value) =>
    asArray(asRecord(value).recent_events).map(item => {
      const metadata = asRecord(item.metadata);
      return {
        id: s(item.id),
        userId: s(item.user_id),
        username: getDisplayUsername(item.username, item.user_id),
        eventTimeMs: n(item.event_time_ms),
        page: s(item.page),
        message: s(metadata.errorMessage) || s(metadata.error) || s(item.event_name),
        source: s(item.source),
      };
    })
  );

export const fetchAdminUserEventTimeline = (userId: string, filters: AdminAnalyticsFilters) =>
  rpc<unknown>('get_admin_user_event_timeline', { user_id: userId, ...rangeArgs(filters) }, null).then((value) => {
    const raw = asRecord(value);
    const username = getDisplayUsername(raw.username, raw.user_id || userId);
    return asArray(raw.events).map(item => {
      const event: AdminUserEvent = {
        id: s(item.id),
        userId,
        username: getDisplayUsername(item.username || username, userId),
        eventName: s(item.event_name),
        actionText: '',
        eventTimeMs: n(item.event_time_ms),
        localDate: s(item.local_date),
        page: s(item.page),
        recordType: s(item.record_type) || null,
        recordId: s(item.record_id) || null,
        metadata: asRecord(item.metadata),
      };
      return {
        ...event,
        actionText: describeAdminEvent(event),
      };
    });
  });

export const fetchAdminSessionOverview = (filters: AdminAnalyticsFilters) =>
  rpc<unknown>('get_admin_session_overview', rangeArgs(filters), null).then((value) => {
    const raw = asRecord(value);
    return {
      sessionCount: n(raw.session_count),
      activeUsers: n(raw.active_users),
      averageDurationMs: n(raw.average_duration_ms),
      averageActiveDurationMs: n(raw.average_active_duration_ms),
      totalActiveDurationMs: n(raw.total_active_duration_ms),
      averageEventsPerSession: n(raw.average_event_count),
      averageRecordsPerSession: n(raw.record_count) / Math.max(n(raw.session_count), 1),
    };
  });

export const fetchAdminSessionTrend = (filters: AdminAnalyticsFilters) =>
  rpc<unknown>('get_admin_session_trend', rangeArgs(filters), []).then((value) =>
    asArray(value).map(item => ({
      date: s(item.date),
      sessionCount: n(item.session_count),
      activeDurationMs: n(item.total_active_duration_ms),
      averageActiveDurationMs: n(item.session_count) > 0 ? n(item.total_active_duration_ms) / n(item.session_count) : 0,
      eventCount: n(item.event_count),
      recordCount: n(item.record_count),
    }))
  );

export const fetchAdminActiveTimeHeatmap = (filters: AdminAnalyticsFilters) =>
  rpc<unknown>('get_admin_active_time_heatmap', rangeArgs(filters), null).then((value) =>
    asArray(asRecord(value).cells).map(item => ({
      weekday: n(item.day_of_week),
      hour: n(item.hour),
      activeDurationMs: n(item.total_active_duration_ms),
      eventCount: n(item.event_count),
      sessionCount: n(item.session_count),
    }))
  );

export const fetchAdminUserSessions = (userId: string, filters: AdminAnalyticsFilters) =>
  rpc<unknown>('get_admin_user_sessions', { user_id: userId, ...rangeArgs(filters) }, null).then((value) =>
    asArray(asRecord(value).sessions).map(item => ({
      id: s(item.id),
      userId,
      username: getDisplayUsername(item.username, userId),
      startedAtMs: n(item.started_at_ms),
      endedAtMs: item.ended_at_ms === null || item.ended_at_ms === undefined ? null : n(item.ended_at_ms),
      durationMs: n(item.duration_ms),
      activeDurationMs: n(item.active_duration_ms),
      idleDurationMs: n(item.idle_duration_ms),
      pageCount: n(item.page_count),
      eventCount: n(item.event_count),
      recordCount: n(item.record_count),
      completedRecordCount: n(item.completed_record_count),
    }))
  );

export const fetchCloudAdminAnalytics = async (
  filters: AdminAnalyticsFilters,
  selectedUserId?: string,
): Promise<AdminAnalyticsBundle> => {
  const status = await checkIsAdmin();
  if (!status.isAdmin) {
    return {
      status,
      overview: emptyOverview,
      dailyActivity: [],
      structure: mapStructure(null),
      users: [],
      eventOverview: emptyEventOverview,
      featureUsage: [],
      funnel: [],
      errors: [],
      timeline: [],
      sessionOverview: emptySessionOverview,
      sessionTrend: [],
      heatmap: [],
      sessions: [],
      notice: status.reason || '当前用户没有管理员权限。',
    };
  }

  const [
    rawOverview,
    dailyActivity,
    users,
    eventOverview,
    featureUsage,
    funnel,
    errors,
    sessionOverview,
    sessionTrend,
    heatmap,
  ] = await Promise.all([
    rpc<unknown>('get_admin_activity_overview', rangeArgs(filters), null),
    fetchAdminDailyActivity(filters),
    fetchAdminUserActivity(filters),
    fetchAdminEventOverview(filters),
    fetchAdminFeatureUsage(filters),
    fetchAdminBehaviorFunnel(filters),
    fetchAdminErrorEvents(filters),
    fetchAdminSessionOverview(filters),
    fetchAdminSessionTrend(filters),
    fetchAdminActiveTimeHeatmap(filters),
  ]);

  const overview = mapOverview(rawOverview);
  const structure = mapStructure(rawOverview);

  const targetUserId = selectedUserId || users[0]?.userId || '';
  const [timeline, sessions] = targetUserId
    ? await Promise.all([
        fetchAdminUserEventTimeline(targetUserId, filters),
        fetchAdminUserSessions(targetUserId, filters),
      ])
    : [[], []] as [AdminUserEvent[], AdminUserSession[]];

  return {
    status,
    overview,
    dailyActivity,
    structure,
    users,
    eventOverview,
    featureUsage,
    funnel,
    errors,
    timeline,
    sessionOverview,
    sessionTrend,
    heatmap,
    sessions,
  };
};

const csvEscape = (value: unknown) => {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

export const downloadAdminRowsCsv = (
  rows: Array<Record<string, unknown>>,
  fileName: string,
) => {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const csv = [
    columns.map(csvEscape).join(','),
    ...rows.map(row => columns.map(column => csvEscape(row[column])).join(',')),
  ].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const userExportRows = (users: AdminUserActivity[]) => users.map(user => ({
  用户名: user.username,
  用户ID: user.userId,
  最近活跃时间: user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleString() : '',
  活跃天数: user.activeDays,
  连续活跃天数: user.streakDays,
  总记录数: user.totalRecords,
  练习数: user.exerciseRecords,
  素材数: user.materialRecords,
  总结数: user.summaryRecords,
  总做题量: user.totalQuestions,
  平均正确率: formatPercent(user.averageAccuracy),
  删除记录数: user.deletedRecords,
  行为事件数: user.eventCount,
  会话数: user.sessionCount,
  有效时长: formatDuration(user.activeDurationMs),
  用户状态: user.status,
  风险标签: user.riskTags.join('、'),
}));

export const downloadAdminWorkbook = (
  bundle: AdminAnalyticsBundle,
  fileName: string,
) => {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(userExportRows(bundle.users)), '用户列表');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bundle.dailyActivity.map(row => ({
    日期: row.date,
    活跃用户数: row.activeUsers,
    新增记录数: row.records,
    练习记录数: row.exerciseRecords,
    素材记录数: row.materialRecords,
    总结记录数: row.summaryRecords,
    总做题量: row.totalQuestions,
    平均正确率: formatPercent(row.averageAccuracy),
    人均记录数: row.recordsPerUser.toFixed(1),
    有效时长: formatDuration(row.activeDurationMs),
  }))), '每日趋势');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bundle.featureUsage.map(row => ({
    功能: row.name,
    事件: row.eventName,
    次数: row.count,
    用户数: row.users,
  }))), '功能使用');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bundle.errors.map(row => ({
    用户名: row.username,
    用户ID: row.userId,
    时间: new Date(row.eventTimeMs).toLocaleString(),
    页面: row.page,
    来源: row.source,
    错误信息: row.message,
  }))), '错误事件');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bundle.sessions.map(row => ({
    用户名: row.username,
    用户ID: row.userId,
    开始时间: new Date(row.startedAtMs).toLocaleString(),
    结束时间: row.endedAtMs ? new Date(row.endedAtMs).toLocaleString() : '',
    总时长: formatDuration(row.durationMs),
    有效时长: formatDuration(row.activeDurationMs),
    空闲时长: formatDuration(row.idleDurationMs),
    页面数: row.pageCount,
    操作数: row.eventCount,
    产出记录数: row.recordCount,
  }))), '会话记录');

  XLSX.writeFile(workbook, fileName);
};

export const filterAdminUsers = (
  users: AdminUserActivity[],
  filters: AdminAnalyticsFilters,
) => {
  const search = filters.search.trim().toLowerCase();

  return users.filter((user) => {
    const matchesSearch = !search
      || user.username.toLowerCase().includes(search)
      || user.userId.toLowerCase().includes(search);
    const matchesStatus = filters.userStatus === 'all'
      || (filters.userStatus === 'high_active' && user.riskTags.includes('高活跃'))
      || (filters.userStatus === 'stable_active' && user.riskTags.includes('稳定活跃'))
      || (filters.userStatus === 'low_active' && user.riskTags.includes('低活跃'))
      || (filters.userStatus === 'silent' && user.riskTags.includes('长期未活跃'))
      || (filters.userStatus === 'risk' && user.riskTags.some(tag => ['总结缺失', '频繁删除', '正确率下降', '数据异常'].includes(tag)));

    return matchesSearch && matchesStatus;
  });
};

export const normalizeRpcUserActivity = (rows: AdminUserActivity[]) =>
  rows.map(row => ({
    ...row,
    username: toStringValue(row.username) || row.userId,
    riskTags: Array.isArray(row.riskTags) ? row.riskTags : [],
  }));
