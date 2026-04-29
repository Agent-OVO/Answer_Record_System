import React, { useMemo, useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { QUESTION_TYPES, MATERIAL_CATEGORIES } from '../types';
import { subDays, isAfter, isBefore, parseISO } from 'date-fns';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line,
  PieChart, Pie, Cell
} from 'recharts';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899'];

export function Statistics() {
  const { currentUser, exercises, materials } = useAppContext();
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'custom'>('thisMonth');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const filteredData = useMemo(() => {
    let startStr = '1970-01-01';
    let endStr = '2099-12-31';
    const now = new Date();
    
    const formatDateObj = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (dateRange === 'week') {
      startStr = formatDateObj(subDays(now, 7));
      endStr = formatDateObj(now);
    } else if (dateRange === 'month') {
      startStr = formatDateObj(subDays(now, 30));
      endStr = formatDateObj(now);
    } else if (dateRange === 'custom') {
      startStr = customStart || '1970-01-01';
      endStr = customEnd || '2099-12-31';
    }

    const isMatch = (dateStr: string) => dateStr >= startStr && dateStr <= endStr;

    const fEx = exercises.filter(e => e.userId === currentUser?.id && !e.deletedAt && isMatch(e.date));
    const fMat = materials.filter(m => m.userId === currentUser?.id && !m.deletedAt && isMatch(m.date));

    return { fEx, fMat };
  }, [exercises, materials, currentUser?.id, dateRange, customStart, customEnd]);

  // Chart 1: Exercise volume by type
  const volumeData = useMemo(() => {
    let allTotal = 0;
    const data = QUESTION_TYPES.map(type => {
      const typeEx = filteredData.fEx.filter(e => e.type === type);
      const total = typeEx.reduce((acc, curr) => acc + curr.totalQuestions, 0);
      allTotal += total;
      return { name: type, count: total };
    }).filter(d => d.count > 0);

    return data.map(d => ({
      ...d,
      percent: allTotal > 0 ? ((d.count / allTotal) * 100).toFixed(1) + '%' : '0%'
    }));
  }, [filteredData.fEx]);

  // Chart 2: Accuracy trend by day (Avg across all types for simplicity, or grouped)
  const accuracyTrendData = useMemo(() => {
    const dates = Array.from(new Set(filteredData.fEx.map(e => e.date))).sort();
    return dates.map((date: string) => {
      const dayEx = filteredData.fEx.filter(e => e.date === date);
      let tQ = 0, cQ = 0;
      dayEx.forEach(e => { tQ += e.totalQuestions; cQ += e.correctQuestions; });
      return {
        date: date.substring(5), // MM-DD
        Accuracy: tQ > 0 ? (cQ / tQ) * 100 : 0
      };
    });
  }, [filteredData.fEx]);

  // Chart 3: Materials by Category
  const materialData = useMemo(() => {
    let allTotal = 0;
    const data = MATERIAL_CATEGORIES.map(cat => {
      const count = filteredData.fMat.filter(m => m.category === cat).length;
      allTotal += count;
      return { name: cat, value: count };
    }).filter(d => d.value > 0);

    return data.map(d => ({
      ...d,
      percent: allTotal > 0 ? ((d.value / allTotal) * 100).toFixed(1) + '%' : '0%'
    }));
  }, [filteredData.fMat]);

  const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 text-sm min-w-[120px]">
          <p className="font-bold text-slate-800 mb-2">{label}</p>
          <div className="flex justify-between items-center mb-1">
            <span className="text-slate-500">数量:</span>
            <span className="text-indigo-600 font-bold">{data.count} 题</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">占比:</span>
            <span className="text-slate-700 font-medium">{data.percent}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 text-sm min-w-[140px]">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: payload[0].payload.fill || payload[0].fill }}></div>
            <p className="font-bold text-slate-800">{data.name}</p>
          </div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-slate-500">数量:</span>
            <span className="text-slate-800 font-bold">{data.value} 条</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">占比:</span>
            <span className="text-slate-700 font-medium">{data.percent}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-900">统计分析</h1>
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-slate-100">
          <select 
            value={dateRange} 
            onChange={(e) => setDateRange(e.target.value as any)}
            className="border-none bg-slate-50 rounded-lg text-sm px-3 py-2 text-slate-700 font-medium focus:ring-0 focus:outline-none appearance-none cursor-pointer hover:bg-slate-100 transition-colors"
          >
            <option value="week">近7天</option>
            <option value="month">近30天</option>
            <option value="custom">自定义范围</option>
          </select>
          {dateRange === 'custom' && (
            <>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-32 bg-slate-50 border-none rounded-lg text-sm px-3 py-2 focus:ring-2 focus:ring-indigo-500" />
              <span className="text-slate-400">-</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-32 bg-slate-50 border-none rounded-lg text-sm px-3 py-2 focus:ring-2 focus:ring-indigo-500" />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[350px]">
          <h2 className="text-lg font-bold text-slate-900 mb-6">各题型做题数量对比</h2>
          {volumeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={volumeData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{fill: '#64748B', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{fill: '#64748B', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
                <Tooltip content={<CustomBarTooltip />} cursor={{fill: '#F8FAFC'}} />
                <Bar dataKey="count" name="总题数" fill="#4F46E5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-slate-400 py-20 italic text-sm">暂无数据</p>}
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[350px]">
          <h2 className="text-lg font-bold text-slate-900 mb-6">做题正确率变化趋势 (%)</h2>
          {accuracyTrendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={accuracyTrendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{fill: '#64748B', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
                <YAxis domain={[0, 100]} tick={{fill: '#64748B', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
                <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'}} />
                <Line type="monotone" dataKey="Accuracy" name="正确率 %" stroke="#10b981" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-slate-400 py-20 italic text-sm">暂无数据</p>}
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[350px]">
          <h2 className="text-lg font-bold text-slate-900 mb-6">素材积累分类占比</h2>
          {materialData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
               <PieChart>
                <Pie data={materialData} cx="50%" cy="50%" innerRadius={70} outerRadius={105} paddingAngle={4} dataKey="value" stroke="none">
                  {materialData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} />
                <Legend iconType="circle" wrapperStyle={{fontSize: '12px', color: '#64748B'}} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-slate-400 py-20 italic text-sm">暂无数据</p>}
        </div>
      </div>
    </div>
  );
}
