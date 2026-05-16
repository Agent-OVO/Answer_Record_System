import React, { useMemo, useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { MATERIAL_CATEGORIES, QUESTION_TYPES } from '../types';
import { subDays } from 'date-fns';
import { normalizeDateRange } from '../lib/utils';
import {
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

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899'];

type DateRange = 'week' | 'month' | 'custom';

export function Statistics() {
  const { currentUser, exercises, materials } = useAppContext();
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const customDateRange = useMemo(
    () => normalizeDateRange(customStart, customEnd),
    [customEnd, customStart],
  );

  const filteredData = useMemo(() => {
    let startStr = '1970-01-01';
    let endStr = '2099-12-31';
    const now = new Date();

    const formatDateObj = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (dateRange === 'week') {
      startStr = formatDateObj(subDays(now, 7));
      endStr = formatDateObj(now);
    } else if (dateRange === 'month') {
      startStr = formatDateObj(subDays(now, 30));
      endStr = formatDateObj(now);
    } else if (dateRange === 'custom') {
      startStr = customDateRange.startDate || '1970-01-01';
      endStr = customDateRange.endDate || '2099-12-31';
    }

    const isMatch = (dateStr: string) => dateStr >= startStr && dateStr <= endStr;

    return {
      exercises: exercises.filter(record => record.userId === currentUser?.id && !record.deletedAt && isMatch(record.date)),
      materials: materials.filter(record => record.userId === currentUser?.id && !record.deletedAt && isMatch(record.date)),
    };
  }, [customDateRange.endDate, customDateRange.startDate, currentUser?.id, dateRange, exercises, materials]);

  const volumeData = useMemo(() => {
    let allTotal = 0;

    const data = QUESTION_TYPES.map((questionType) => {
      const count = filteredData.exercises
        .filter(record => record.type === questionType)
        .reduce((sum, record) => sum + record.totalQuestions, 0);

      allTotal += count;
      return { name: questionType, count };
    }).filter(item => item.count > 0);

    return data.map(item => ({
      ...item,
      percent: allTotal > 0 ? `${((item.count / allTotal) * 100).toFixed(1)}%` : '0%',
    }));
  }, [filteredData.exercises]);

  const accuracyTrendData = useMemo(() => {
    const dates = Array.from(new Set(filteredData.exercises.map(record => record.date))).sort();

    return dates.map((date) => {
      const dateStr = String(date);
      const dayRecords = filteredData.exercises.filter(record => record.date === date);
      let totalQuestions = 0;
      let correctQuestions = 0;

      dayRecords.forEach((record) => {
        totalQuestions += record.totalQuestions;
        correctQuestions += record.correctQuestions;
      });

      return {
        date: dateStr.substring(5),
        accuracy: totalQuestions > 0 ? (correctQuestions / totalQuestions) * 100 : 0,
      };
    });
  }, [filteredData.exercises]);

  const materialData = useMemo(() => {
    let allTotal = 0;

    const data = MATERIAL_CATEGORIES.map((category) => {
      const value = filteredData.materials.filter(record => record.category === category).length;
      allTotal += value;
      return { name: category, value };
    }).filter(item => item.value > 0);

    return data.map(item => ({
      ...item,
      percent: allTotal > 0 ? `${((item.value / allTotal) * 100).toFixed(1)}%` : '0%',
    }));
  }, [filteredData.materials]);

  const chartCardClass = 'min-h-[320px] rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:min-h-[350px] sm:p-6';
  const chartHeightClass = 'h-[240px] sm:h-[280px]';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">统计分析</h1>
        <div className="flex w-full flex-col gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm sm:w-auto sm:flex-row sm:items-center">
          <select
            value={dateRange}
            onChange={(event) => setDateRange(event.target.value as DateRange)}
            className="w-full cursor-pointer appearance-none rounded-lg border-none bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-0 sm:w-auto"
          >
            <option value="week">近 7 天</option>
            <option value="month">近 30 天</option>
            <option value="custom">自定义范围</option>
          </select>

          {dateRange === 'custom' && (
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <input
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
                className="w-full rounded-lg border-none bg-slate-50 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 sm:w-36"
              />
              <span className="hidden text-slate-400 sm:inline">-</span>
              <input
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
                className="w-full rounded-lg border-none bg-slate-50 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 sm:w-36"
              />
            </div>
          )}
        </div>
      </div>

      {dateRange === 'custom' && customDateRange.wasReversed && (
        <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          已按较早日期到较晚日期自动统计。
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={chartCardClass}>
          <h2 className="mb-5 text-lg font-bold text-slate-900 sm:mb-6">各题型做题量对比</h2>
          {volumeData.length > 0 ? (
            <div className={chartHeightClass}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#64748B', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tickMargin={10}
                  />
                  <YAxis tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} dx={-10} />
                  <Tooltip
                    formatter={(value: number) => [`${value} 题`, '数量']}
                    labelFormatter={(value) => `题型：${value}`}
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Bar dataKey="count" name="数量" fill="#4F46E5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-20 text-center text-sm italic text-slate-400">暂无数据</p>
          )}
        </div>

        <div className={chartCardClass}>
          <h2 className="mb-5 text-lg font-bold text-slate-900 sm:mb-6">做题正确率变化趋势 (%)</h2>
          {accuracyTrendData.length > 0 ? (
            <div className={chartHeightClass}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={accuracyTrendData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#64748B', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tickMargin={10}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: '#64748B', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    dx={-10}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value.toFixed(1)}%`, '正确率']}
                    labelFormatter={(value) => `日期：${value}`}
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    name="正确率"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-20 text-center text-sm italic text-slate-400">暂无数据</p>
          )}
        </div>

        <div className={`${chartCardClass} lg:col-span-2`}>
          <h2 className="mb-5 text-lg font-bold text-slate-900 sm:mb-6">素材积累分类占比</h2>
          {materialData.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,360px)_1fr] lg:items-center">
              <div className={chartHeightClass}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={materialData}
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={92}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                    >
                      {materialData.map((entry, index) => (
                        <Cell key={`${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`${value} 条`, '数量']}
                      contentStyle={{
                        borderRadius: '12px',
                        border: 'none',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {materialData.map((item, index) => (
                  <div key={item.name} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="font-semibold text-slate-800">{item.name}</span>
                      </div>
                      <span className="font-semibold text-slate-900">{item.value} 条</span>
                    </div>
                    <p className="mt-2 text-slate-500">占比 {item.percent}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-20 text-center text-sm italic text-slate-400">暂无数据</p>
          )}
        </div>
      </div>
    </div>
  );
}
