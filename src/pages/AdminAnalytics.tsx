import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Clock,
  Download,
  FileSpreadsheet,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  Timer,
  UserRound,
  UsersRound,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAppContext } from '../contexts/AppContext';
import { ANALYTICS_EVENTS } from '../lib/analyticsTracker';
import {
  buildLocalAdminAnalytics,
  createDefaultAdminFilters,
  downloadAdminRowsCsv,
  downloadAdminWorkbook,
  fetchCloudAdminAnalytics,
  filterAdminUsers,
  formatDuration,
  formatPercent,
  getAdminPageLabel,
  getAdminRecordTypeLabel,
  resolveDateRange,
  type AdminAnalyticsBundle,
  type AdminAnalyticsFilters,
  type AdminRangePreset,
  type AdminUserActivity,
} from '../lib/adminAnalytics';

const COLORS = ['#337a7a', '#d04d55', '#519fc6', '#22c55e', '#f97316', '#a855f7', '#64748b'];
const CHART_INITIAL_DIMENSION = { width: 1, height: 1 };

type TabKey = 'overview' | 'users' | 'records' | 'events' | 'sessions' | 'exports';

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: '总览' },
  { key: 'users', label: '用户' },
  { key: 'records', label: '记录' },
  { key: 'events', label: '行为' },
  { key: 'sessions', label: '会话' },
  { key: 'exports', label: '导出' },
];

const presetLabels: Record<AdminRangePreset, string> = {
  today: '今日',
  week: '近 7 天',
  month: '近 30 天',
  custom: '自定义',
};

const riskClass = (tag: string) => {
  if (tag.includes('高活跃')) return 'border-emerald-100 bg-emerald-50 text-emerald-700';
  if (tag.includes('稳定')) return 'border-sky-100 bg-sky-50 text-sky-700';
  if (tag.includes('低活跃')) return 'border-amber-100 bg-amber-50 text-amber-700';
  if (tag.includes('未活跃') || tag.includes('下降') || tag.includes('异常') || tag.includes('删除')) {
    return 'border-red-100 bg-red-50 text-red-600';
  }
  return 'border-slate-100 bg-slate-50 text-slate-600';
};

const numberText = (value: number, digits = 0) =>
  Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: digits }) : '0';

const formatDateTime = (value?: string | number | null) => {
  if (!value) return '-';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

const activeRatio = (value: number, max: number) => {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
};

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 break-words text-2xl font-bold text-slate-900">{value}</p>
        </div>
        <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {hint && <p className="mt-3 text-xs leading-5 text-slate-500">{hint}</p>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-sm font-medium text-slate-400">
      {text}
    </div>
  );
}

function UserTags({ user }: { user: AdminUserActivity }) {
  const tags = user.riskTags.length > 0 ? user.riskTags : [user.status];
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map(tag => (
        <span key={tag} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${riskClass(tag)}`}>
          {tag}
        </span>
      ))}
    </div>
  );
}

export function AdminAnalytics() {
  const {
    currentUser,
    exercises,
    materials,
    summaries,
    isCloudMode,
    isAdmin,
    isAdminLoading,
    trackAnalyticsEvent,
  } = useAppContext();
  const navigate = useNavigate();
  const { userId } = useParams();
  const [filters, setFilters] = useState<AdminAnalyticsFilters>(() => createDefaultAdminFilters());
  const [bundle, setBundle] = useState<AdminAnalyticsBundle | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(userId ? 'users' : 'overview');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!currentUser || isAdminLoading) return;

      setIsLoading(true);
      setError('');
      try {
        const nextBundle = isCloudMode
          ? await fetchCloudAdminAnalytics(filters, userId)
          : buildLocalAdminAnalytics({ currentUser, exercises, materials, summaries }, filters);

        if (isMounted) setBundle(nextBundle);
      } catch (loadError) {
        console.error('Failed to load admin analytics', loadError);
        if (isMounted) setError(loadError instanceof Error ? loadError.message : '用户行为分析数据加载失败');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [
    currentUser,
    exercises,
    filters,
    isAdminLoading,
    isCloudMode,
    materials,
    summaries,
    userId,
  ]);

  const filteredUsers = useMemo(
    () => bundle ? filterAdminUsers(bundle.users, filters) : [],
    [bundle, filters],
  );

  const selectedUser = useMemo(() => {
    if (!bundle) return null;
    if (userId) return bundle.users.find(user => user.userId === userId) || null;
    return filteredUsers[0] || null;
  }, [bundle, filteredUsers, userId]);

  const maxHeatmapValue = useMemo(
    () => Math.max(0, ...(bundle?.heatmap.map(cell => cell.activeDurationMs) || [])),
    [bundle],
  );

  const handlePreset = (preset: AdminRangePreset) => {
    const range = resolveDateRange(preset, filters.startDate, filters.endDate);
    setFilters(prev => ({ ...prev, preset, ...range }));
  };

  const handleDownloadWorkbook = () => {
    if (!bundle) return;
    const fileName = `学而录_用户行为分析_${filters.startDate}_${filters.endDate}.xlsx`;
    downloadAdminWorkbook({ ...bundle, users: filteredUsers }, fileName);
    trackAnalyticsEvent(ANALYTICS_EVENTS.EXPORT_DATA, {
      source: 'admin_analytics',
      metadata: { fileName, exportType: 'workbook' },
    });
  };

  const handleDownloadUsersCsv = () => {
    const fileName = `学而录_用户列表_${filters.startDate}_${filters.endDate}.csv`;
    downloadAdminRowsCsv(filteredUsers.map(user => ({
      用户名: user.username,
      用户ID: user.userId,
      最近活跃时间: formatDateTime(user.lastActiveAt),
      活跃天数: user.activeDays,
      连续活跃天数: user.streakDays,
      总记录数: user.totalRecords,
      练习数: user.exerciseRecords,
      素材数: user.materialRecords,
      总结数: user.summaryRecords,
      总做题量: user.totalQuestions,
      平均正确率: formatPercent(user.averageAccuracy),
      删除记录数: user.deletedRecords,
      用户状态: user.status,
      风险标签: user.riskTags.join('、'),
    })), fileName);
    trackAnalyticsEvent(ANALYTICS_EVENTS.EXPORT_DATA, {
      source: 'admin_analytics',
      metadata: { fileName, exportType: 'users_csv' },
    });
  };

  if (isAdminLoading || (isLoading && !bundle)) {
    return (
      <div className="flex min-h-[360px] items-center justify-center text-sm font-medium text-slate-500">
        正在加载用户行为分析...
      </div>
    );
  }

  if (isCloudMode && !isAdmin) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-xl font-bold text-slate-900">无权限访问用户行为分析</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          当前用户不是管理员。管理员身份需要在 Supabase 的 `admin_users` 表中手动配置。
        </p>
      </div>
    );
  }

  const overview = bundle?.overview;
  const dailyActivity = bundle?.dailyActivity || [];
  const structure = bundle?.structure;
  const userRows = filteredUsers;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          {userId && (
            <button
              onClick={() => navigate('/admin/analytics')}
              className="mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              返回总览
            </button>
          )}
          <h1 className="text-2xl font-bold text-slate-900">{userId ? '用户详情' : '用户行为分析'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {userId && selectedUser ? `${selectedUser.username} · ${selectedUser.userId}` : '全体用户聚合、行为事件、学习会话与异常风险'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
          <button
            onClick={handleDownloadWorkbook}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-700"
          >
            <Download className="h-4 w-4" />
            导出 Excel
          </button>
        </div>
      </div>

      {(bundle?.notice || error) && (
        <div className={`flex items-start gap-3 rounded-2xl border px-4 py-4 text-sm ${
          error ? 'border-red-100 bg-red-50 text-red-600' : 'border-amber-100 bg-amber-50 text-amber-700'
        }`}>
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <p className="leading-6">{error || bundle?.notice}</p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(presetLabels) as AdminRangePreset[]).map(preset => (
              <button
                key={preset}
                onClick={() => handlePreset(preset)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                  filters.preset === preset
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                    : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {presetLabels[preset]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_auto_auto_auto] md:items-center">
            <input
              type="date"
              value={filters.startDate}
              onChange={event => setFilters(prev => ({ ...prev, preset: 'custom', startDate: event.target.value }))}
              className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="date"
              value={filters.endDate}
              onChange={event => setFilters(prev => ({ ...prev, preset: 'custom', endDate: event.target.value }))}
              className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={filters.recordType}
              onChange={event => setFilters(prev => ({ ...prev, recordType: event.target.value as AdminAnalyticsFilters['recordType'] }))}
              className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">全部记录</option>
              <option value="exercise">练习记录</option>
              <option value="material">素材记录</option>
              <option value="summary">总结记录</option>
            </select>
            <select
              value={filters.userStatus}
              onChange={event => setFilters(prev => ({ ...prev, userStatus: event.target.value as AdminAnalyticsFilters['userStatus'] }))}
              className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">全部用户</option>
              <option value="high_active">高活跃</option>
              <option value="stable_active">稳定活跃</option>
              <option value="low_active">低活跃</option>
              <option value="silent">长期未活跃</option>
              <option value="risk">风险用户</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={filters.search}
            onChange={event => setFilters(prev => ({ ...prev, search: event.target.value }))}
            placeholder="搜索用户名或用户 ID"
            className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {overview && activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="总用户数" value={numberText(overview.totalUsers)} hint="历史有记录或管理员可见账号" icon={UsersRound} />
            <MetricCard label="活跃用户数" value={numberText(overview.activeUsers)} hint="周期内存在有效学习记录" icon={UserRound} />
            <MetricCard label="沉默用户数" value={numberText(overview.silentUsers)} hint="历史有记录但周期内无有效记录" icon={AlertTriangle} />
            <MetricCard label="总记录数" value={numberText(overview.totalRecords)} hint="不含回收站中的删除记录" icon={FileSpreadsheet} />
            <MetricCard label="练习记录数" value={numberText(overview.exerciseRecords)} icon={BarChart3} />
            <MetricCard label="素材记录数" value={numberText(overview.materialRecords)} icon={FileSpreadsheet} />
            <MetricCard label="总结记录数" value={numberText(overview.summaryRecords)} icon={Filter} />
            <MetricCard label="平均正确率" value={formatPercent(overview.averageAccuracy)} hint={`${numberText(overview.totalQuestions)} 道题`} icon={BarChart3} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">每日活跃与记录趋势</h2>
              {dailyActivity.length > 0 ? (
                <div className="mt-5 h-[320px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={CHART_INITIAL_DIMENSION}>
                    <AreaChart data={dailyActivity} margin={{ left: -24, right: 12, top: 10 }}>
                      <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={value => String(value).slice(5)} />
                      <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="records" name="新增记录" stroke="#337a7a" fill="#337a7a" fillOpacity={0.18} />
                      <Line type="monotone" dataKey="activeUsers" name="活跃用户" stroke="#d04d55" strokeWidth={2.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState text="暂无趋势数据" />
              )}
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">风险用户</h2>
              <div className="mt-5 space-y-3">
                {userRows.filter(user => user.riskTags.length > 0).slice(0, 6).map(user => (
                  <button
                    key={user.userId}
                    onClick={() => navigate(`/admin/users/${user.userId}`)}
                    className="w-full rounded-xl border border-slate-100 bg-slate-50 p-4 text-left transition-colors hover:bg-slate-100"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{user.username}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDateTime(user.lastActiveAt)}</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {user.totalRecords} 条
                      </span>
                    </div>
                    <div className="mt-3">
                      <UserTags user={user} />
                    </div>
                  </button>
                ))}
                {userRows.filter(user => user.riskTags.length > 0).length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">暂无风险用户</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-6">
          {selectedUser && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="用户记录数" value={numberText(selectedUser.totalRecords)} icon={FileSpreadsheet} />
              <MetricCard label="用户活跃天数" value={numberText(selectedUser.activeDays)} icon={UserRound} />
              <MetricCard label="用户有效时长" value={formatDuration(selectedUser.activeDurationMs)} icon={Timer} />
              <MetricCard label="用户平均正确率" value={formatPercent(selectedUser.averageAccuracy)} icon={BarChart3} />
            </div>
          )}

          <div className="hidden overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm xl:block">
            <table className="w-full min-w-[980px] text-left">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">用户</th>
                  <th className="px-5 py-4">最近活跃</th>
                  <th className="px-5 py-4 text-right">活跃天数</th>
                  <th className="px-5 py-4 text-right">总记录数</th>
                  <th className="px-5 py-4 text-right">总做题量</th>
                  <th className="px-5 py-4 text-right">平均正确率</th>
                  <th className="px-5 py-4">状态</th>
                  <th className="px-5 py-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {userRows.map(user => (
                  <tr key={user.userId} className="hover:bg-slate-50/80">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{user.username}</p>
                      <p className="mt-1 max-w-[220px] truncate text-xs text-slate-500">{user.userId}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{formatDateTime(user.lastActiveAt)}</td>
                    <td className="px-5 py-4 text-right font-mono text-sm text-slate-700">{user.activeDays}</td>
                    <td className="px-5 py-4 text-right font-mono text-sm text-slate-700">{user.totalRecords}</td>
                    <td className="px-5 py-4 text-right font-mono text-sm text-slate-700">{user.totalQuestions}</td>
                    <td className="px-5 py-4 text-right text-sm font-semibold text-slate-900">{formatPercent(user.averageAccuracy)}</td>
                    <td className="px-5 py-4"><UserTags user={user} /></td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => navigate(`/admin/users/${user.userId}`)}
                        className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
                      >
                        查看详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-4 xl:hidden">
            {userRows.map(user => (
              <button
                key={user.userId}
                onClick={() => navigate(`/admin/users/${user.userId}`)}
                className="w-full rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{user.username}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{user.userId}</p>
                  </div>
                  <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">{user.totalRecords} 条</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">活跃天数</p>
                    <p className="mt-1 font-bold text-slate-900">{user.activeDays}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">做题量</p>
                    <p className="mt-1 font-bold text-slate-900">{user.totalQuestions}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">正确率</p>
                    <p className="mt-1 font-bold text-slate-900">{formatPercent(user.averageAccuracy, 0)}</p>
                  </div>
                </div>
                <div className="mt-4"><UserTags user={user} /></div>
              </button>
            ))}
          </div>

          {userRows.length === 0 && <EmptyState text="暂无符合筛选条件的用户" />}
        </div>
      )}

      {activeTab === 'records' && structure && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">记录类型占比</h2>
            {structure.recordTypeShare.some(item => item.value > 0) ? (
              <div className="mt-5 h-[300px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={CHART_INITIAL_DIMENSION}>
                  <PieChart>
                    <Pie data={structure.recordTypeShare} dataKey="value" innerRadius={68} outerRadius={104} paddingAngle={4}>
                      {structure.recordTypeShare.map((entry, index) => (
                        <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`${value} 条`, '记录数']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState text="暂无记录结构数据" />
            )}
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">题型正确率对比</h2>
            {structure.questionTypeStats.length > 0 ? (
              <div className="mt-5 h-[300px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={CHART_INITIAL_DIMENSION}>
                  <BarChart data={structure.questionTypeStats} margin={{ left: -24, right: 12 }}>
                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                    <Tooltip formatter={(value: number, name: string) => [name === 'accuracy' ? formatPercent(value) : value, name === 'accuracy' ? '正确率' : '做题量']} />
                    <Bar dataKey="totalQuestions" name="做题量" fill="#519fc6" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="accuracy" name="正确率" fill="#22c55e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState text="暂无题型表现数据" />
            )}
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm xl:col-span-2">
            <h2 className="text-lg font-bold text-slate-900">素材分类与总结完成</h2>
            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {structure.materialCategoryStats.map(item => (
                  <div key={item.name} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <p className="font-semibold text-slate-800">{item.name}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{item.records}</p>
                    <p className="mt-1 text-xs text-slate-500">占比 {formatPercent(item.percent)}</p>
                  </div>
                ))}
                {structure.materialCategoryStats.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400 md:col-span-2 xl:col-span-4">暂无素材分类数据</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-600">总结完成率</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">{formatPercent(structure.summaryStats.completionRate)}</p>
                <p className="mt-2 text-sm text-slate-500">平均长度 {numberText(structure.summaryStats.averageLength, 1)} 字</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'events' && bundle && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="行为事件数" value={numberText(bundle.eventOverview.eventCount)} icon={BarChart3} />
            <MetricCard label="页面访问" value={numberText(bundle.eventOverview.pageViews)} icon={FileSpreadsheet} />
            <MetricCard label="记录操作" value={numberText(bundle.eventOverview.recordMutations)} icon={Filter} />
            <MetricCard label="同步失败" value={numberText(bundle.eventOverview.syncFailures)} icon={AlertTriangle} />
            <MetricCard label="错误事件" value={numberText(bundle.eventOverview.errorEvents)} icon={ShieldAlert} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">功能使用频率</h2>
              {bundle.featureUsage.length > 0 ? (
                <div className="mt-5 h-[320px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={CHART_INITIAL_DIMENSION}>
                    <BarChart data={bundle.featureUsage.slice(0, 10)} layout="vertical" margin={{ left: 40, right: 16 }}>
                      <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 12, fill: '#64748B' }} />
                      <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 12, fill: '#64748B' }} />
                      <Tooltip />
                      <Bar dataKey="count" name="次数" fill="#337a7a" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState text="暂无行为事件数据" />
              )}
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">行为漏斗</h2>
              <div className="mt-5 space-y-4">
                {bundle.funnel.map(step => (
                  <div key={step.step}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-slate-700">{step.step}</span>
                      <span className="font-mono text-slate-500">{step.users} 用户 · {formatPercent(step.conversionRate)}</span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.max(3, step.conversionRate)}%` }} />
                    </div>
                  </div>
                ))}
                {bundle.funnel.length === 0 && <EmptyState text="暂无漏斗数据" />}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">近期错误事件</h2>
              <div className="mt-5 space-y-3">
                {bundle.errors.slice(0, 8).map(item => (
                  <div key={item.id} className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-red-700">{item.message}</p>
                      <span className="shrink-0 text-xs text-red-500">{formatDateTime(item.eventTimeMs)}</span>
                    </div>
                    <p className="mt-2 text-red-500">{getAdminPageLabel(item.page)} · {item.username}</p>
                  </div>
                ))}
                {bundle.errors.length === 0 && <EmptyState text="暂无错误事件" />}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">用户行为时间线</h2>
              <div className="mt-5 max-h-[440px] space-y-3 overflow-y-auto pr-1">
                {bundle.timeline.slice(0, 30).map(item => (
                  <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-slate-800">{item.actionText}</p>
                      <span className="shrink-0 text-xs text-slate-500">{formatDateTime(item.eventTimeMs)}</span>
                    </div>
                    <p className="mt-2 text-slate-500">
                      {getAdminPageLabel(item.page)}
                      {item.recordType ? ` · ${getAdminRecordTypeLabel(item.recordType)}` : ''}
                    </p>
                  </div>
                ))}
                {bundle.timeline.length === 0 && <EmptyState text="暂无用户时间线数据" />}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sessions' && bundle && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="会话次数" value={numberText(bundle.sessionOverview.sessionCount)} icon={Clock} />
            <MetricCard label="会话用户数" value={numberText(bundle.sessionOverview.activeUsers)} icon={UsersRound} />
            <MetricCard label="平均有效时长" value={formatDuration(bundle.sessionOverview.averageActiveDurationMs)} icon={Timer} />
            <MetricCard label="总有效时长" value={formatDuration(bundle.sessionOverview.totalActiveDurationMs)} icon={Timer} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">会话有效时长趋势</h2>
              {bundle.sessionTrend.length > 0 ? (
                <div className="mt-5 h-[300px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={CHART_INITIAL_DIMENSION}>
                    <LineChart data={bundle.sessionTrend} margin={{ left: -24, right: 12 }}>
                      <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={value => String(value).slice(5)} />
                      <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                      <Tooltip formatter={(value: number, name: string) => [name === 'activeDurationMs' ? formatDuration(value) : value, name === 'activeDurationMs' ? '有效时长' : '会话数']} />
                      <Line type="monotone" dataKey="activeDurationMs" name="有效时长" stroke="#337a7a" strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="sessionCount" name="会话数" stroke="#d04d55" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState text="暂无会话趋势数据" />
              )}
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">活跃时段热力图</h2>
              <div className="mt-5 grid grid-cols-6 gap-1.5">
                {bundle.heatmap.filter(cell => cell.hour % 4 === 0).map(cell => (
                  <div
                    key={`${cell.weekday}-${cell.hour}`}
                    title={`周${cell.weekday} ${cell.hour}:00 · ${formatDuration(cell.activeDurationMs)}`}
                    className="h-9 rounded-md border border-slate-100"
                    style={{
                      backgroundColor: `rgba(51, 122, 122, ${0.08 + activeRatio(cell.activeDurationMs, maxHeatmapValue) / 120})`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">用户会话记录</h2>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">开始时间</th>
                    <th className="px-3 py-3">结束时间</th>
                    <th className="px-3 py-3 text-right">有效时长</th>
                    <th className="px-3 py-3 text-right">页面数</th>
                    <th className="px-3 py-3 text-right">操作数</th>
                    <th className="px-3 py-3 text-right">产出记录数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {bundle.sessions.map(session => (
                    <tr key={session.id}>
                      <td className="px-3 py-3 text-slate-700">{formatDateTime(session.startedAtMs)}</td>
                      <td className="px-3 py-3 text-slate-500">{formatDateTime(session.endedAtMs)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatDuration(session.activeDurationMs)}</td>
                      <td className="px-3 py-3 text-right font-mono text-slate-600">{session.pageCount}</td>
                      <td className="px-3 py-3 text-right font-mono text-slate-600">{session.eventCount}</td>
                      <td className="px-3 py-3 text-right font-mono text-slate-600">{session.recordCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {bundle.sessions.length === 0 && <div className="mt-4"><EmptyState text="暂无用户会话记录" /></div>}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'exports' && bundle && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-indigo-50 p-3 text-indigo-700">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900">完整分析工作簿</h2>
                <p className="mt-1 text-sm text-slate-500">包含用户列表、每日趋势、功能使用、错误事件和会话记录。</p>
              </div>
            </div>
            <button
              onClick={handleDownloadWorkbook}
              className="mt-6 w-full rounded-xl bg-indigo-600 py-3 text-sm font-medium text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-700"
            >
              导出 Excel 工作簿
            </button>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-slate-50 p-3 text-slate-700">
                <Download className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900">当前筛选用户列表</h2>
                <p className="mt-1 text-sm text-slate-500">导出结果与当前日期、搜索和用户状态筛选保持一致。</p>
              </div>
            </div>
            <button
              onClick={handleDownloadUsersCsv}
              className="mt-6 w-full rounded-xl border border-slate-200 bg-slate-50 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              导出 CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
