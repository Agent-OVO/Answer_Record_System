import React, { useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { formatDate } from '../lib/utils';
import { BookOpenCheck, Library, CalendarDays, TrendingUp } from 'lucide-react';
import { subDays, parseISO, differenceInDays } from 'date-fns';

export function Dashboard() {
  const { currentUser, exercises, materials, summaries } = useAppContext();
  
  const todayStr = formatDate(new Date());

  const todayExercises = useMemo(() => 
    exercises.filter(e => e.userId === currentUser?.id && e.date === todayStr && !e.deletedAt),
  [exercises, currentUser?.id, todayStr]);

  const todayMaterials = useMemo(() => 
    materials.filter(m => m.userId === currentUser?.id && m.date === todayStr && !m.deletedAt),
  [materials, currentUser?.id, todayStr]);

  const todaySummary = useMemo(() => 
    summaries.find(s => s.userId === currentUser?.id && s.date === todayStr && !s.deletedAt),
  [summaries, currentUser?.id, todayStr]);

  const { totalDocs, overallAccuracy } = useMemo(() => {
    let q = 0, c = 0;
    todayExercises.forEach(e => { q += e.totalQuestions; c += e.correctQuestions; });
    return {
      totalDocs: todayExercises.length,
      overallAccuracy: q > 0 ? Math.round((c / q) * 100) : 0
    };
  }, [todayExercises]);

  // Heatmap logic
  const activeDays = useMemo(() => {
    const dates = new Set<string>();
    exercises.filter(e => e.userId === currentUser?.id && !e.deletedAt).forEach(e => dates.add(e.date));
    materials.filter(m => m.userId === currentUser?.id && !m.deletedAt).forEach(m => dates.add(m.date));
    summaries.filter(s => s.userId === currentUser?.id && !s.deletedAt).forEach(s => dates.add(s.date));
    return dates;
  }, [exercises, materials, summaries, currentUser?.id]);

  const heatmapDays = Array.from({ length: 60 }).map((_, i) => {
    const d = subDays(new Date(), 59 - i);
    const dateStr = formatDate(d);
    return { dateStr, active: activeDays.has(dateStr) };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">欢迎回来，{currentUser?.username}</h1>
        <p className="text-slate-500 mt-1">今天是 {todayStr}，来看看今天的学习进展吧。</p>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">今日做题</p>
          <div className="flex items-baseline space-x-2 mt-1">
            <p className="text-3xl font-bold text-slate-900">{totalDocs}</p>
            <span className="text-xs text-slate-400 font-normal">题</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">平均正确率</p>
          <div className="flex items-baseline space-x-1 mt-1">
            <p className="text-3xl font-bold text-indigo-600">{overallAccuracy}</p>
            <span className="text-xs font-normal text-slate-400">%</span>
          </div>
          <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
             <div className="bg-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: `${overallAccuracy}%` }}></div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">今日积累素材</p>
          <div className="flex items-baseline space-x-2 mt-1">
            <p className="text-3xl font-bold text-slate-900">{todayMaterials.length}</p>
            <span className="text-xs text-slate-400 font-normal">条</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">今日总结</p>
            {todaySummary ? (
              <p className="text-sm text-slate-700 font-medium line-clamp-2 mt-2">{todaySummary.content}</p>
            ) : (
              <p className="text-xs text-slate-400 italic mt-2">尚未填写</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="col-span-1 md:col-span-12 lg:col-span-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center space-x-2 mb-6 justify-between">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <span className="w-1 h-4 bg-indigo-600 rounded-full"></span>
              学习打卡热力图
            </h3>
            <div className="text-xs text-slate-400 flex items-center gap-2">
              少 <div className="flex gap-1">
                <div className="w-3 h-3 bg-slate-50 rounded-sm"></div>
                <div className="w-3 h-3 bg-indigo-100 rounded-sm"></div>
                <div className="w-3 h-3 bg-indigo-300 rounded-sm"></div>
                <div className="w-3 h-3 bg-indigo-500 rounded-sm"></div>
                <div className="w-3 h-3 bg-indigo-700 rounded-sm"></div>
              </div> 多
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 justify-start">
            {heatmapDays.map((day, i) => (
              <div
                key={i}
                title={day.dateStr}
                className={`w-4 h-4 rounded-sm ${day.active ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-slate-50 hover:bg-slate-100'} transition-colors`}
              />
            ))}
          </div>
        </div>
        
        <div className="col-span-1 md:col-span-12 lg:col-span-4 bg-indigo-600 p-6 rounded-2xl shadow-lg shadow-indigo-200 text-white flex flex-col min-h-[250px]">
          <div className="flex items-center gap-2 mb-4">
             <CalendarDays className="w-5 h-5" />
             <h3 className="font-bold">今日学习反思</h3>
          </div>
          <div className="flex-1 bg-white/10 rounded-xl p-4 italic text-sm leading-relaxed overflow-hidden">
            {todaySummary?.content ? `"${todaySummary.content}"` : "今天还没有填写反思哦，记得在「每日总结」中记录点滴。"}
          </div>
          <div className="mt-4 flex justify-between items-center">
            <span className="text-xs text-white/70 italic">
              {todaySummary ? `更新于 ${new Date((todaySummary as any).createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : '--'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
