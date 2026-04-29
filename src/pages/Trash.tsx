import React, { useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { RefreshCcw, Trash2, AlertTriangle } from 'lucide-react';
import { differenceInDays } from 'date-fns';

export function Trash() {
  const { currentUser, exercises, materials, summaries, restoreRecord, hardDeleteRecord } = useAppContext();

  // Combine deleted records
  const trashItems = useMemo(() => {
    const list: any[] = [];
    const now = Date.now();
    exercises.filter(e => e.userId === currentUser?.id && e.deletedAt).forEach(e => {
       const daysLeft = 30 - differenceInDays(now, e.deletedAt!);
       list.push({ ...e, source: 'exercises', label: `练习记录 (${e.type} - ${e.date})`, daysLeft });
    });
    materials.filter(m => m.userId === currentUser?.id && m.deletedAt).forEach(m => {
       const daysLeft = 30 - differenceInDays(now, m.deletedAt!);
       list.push({ ...m, source: 'materials', label: `素材记录 (${m.category} - ${m.date})`, daysLeft });
    });
    summaries.filter(s => s.userId === currentUser?.id && s.deletedAt).forEach(s => {
       const daysLeft = 30 - differenceInDays(now, s.deletedAt!);
       list.push({ ...s, source: 'summaries', label: `每日总结 (${s.date})`, daysLeft });
    });
    return list.sort((a, b) => b.deletedAt - a.deletedAt); // newest deleted first
  }, [exercises, materials, summaries, currentUser]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">回收站</h1>
          <p className="text-slate-500 mt-1">被删除的记录会暂存这里 30 天，到期后自动永久清理。</p>
        </div>
      </div>

      {trashItems.length > 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {trashItems.map((item) => (
              <li key={item.id} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-900">{item.label}</span>
                  <span className="text-xs text-slate-500 mt-1.5 flex items-center">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mr-1.5" />
                    将在 <span className="font-medium text-amber-600 mx-1">{item.daysLeft}</span> 天后永久删除 (删除于 {new Date(item.deletedAt).toLocaleString()})
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => restoreRecord(item.source, item.id)}
                    className="flex items-center text-sm font-medium text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-colors border border-transparent hover:border-indigo-100"
                  >
                    <RefreshCcw className="w-4 h-4 mr-1.5" />
                    恢复
                  </button>
                  <button 
                    onClick={() => { if(confirm('彻底删除将无法找回，确定删除吗？')) hardDeleteRecord(item.source, item.id) }}
                    className="flex items-center text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    彻底删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 border-dashed py-24 flex flex-col items-center justify-center text-slate-400">
          <Trash2 className="w-12 h-12 text-slate-300 mb-4" />
          <p className="text-sm font-medium text-slate-500">回收站是空的</p>
        </div>
      )}
    </div>
  );
}
