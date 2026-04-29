import React, { useState, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { formatDate } from '../lib/utils';
import { Modal } from '../components/ui/Modal';
import { QUESTION_TYPES, type QuestionType, type ExerciseRecord } from '../types';
import { Plus, Edit2, Trash2, Activity, CheckCircle, Clock } from 'lucide-react';

export function Exercises() {
  const { currentUser, exercises, addExercise, updateExercise, deleteExercise } = useAppContext();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Filters
  const [filterType, setFilterType] = useState<string>('All');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  // Form State
  const [date, setDate] = useState(formatDate(new Date()));
  const [type, setType] = useState<QuestionType>('政治理论');
  const [totalQ, setTotalQ] = useState<number | string>('');
  const [correctQ, setCorrectQ] = useState<number | string>('');
  const [timeSpent, setTimeSpent] = useState('');

  const myExercises = useMemo(() => 
    exercises.filter(e => e.userId === currentUser?.id && !e.deletedAt)
      .filter(e => filterType === 'All' ? true : e.type === filterType)
      .filter(e => filterStartDate ? e.date >= filterStartDate : true)
      .filter(e => filterEndDate ? e.date <= filterEndDate : true)
      .sort((a, b) => b.createdAt - a.createdAt),
  [exercises, currentUser?.id, filterType, filterStartDate, filterEndDate]);

  const summaryStats = useMemo(() => {
    let totalEx = 0;
    let totalQ = 0;
    let totalC = 0;
    let totalSecs = 0;

    myExercises.forEach(ex => {
      totalEx += 1;
      totalQ += ex.totalQuestions || 0;
      totalC += ex.correctQuestions || 0;
      
      if (ex.timeSpent) {
        const parts = ex.timeSpent.split(':').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          totalSecs += parts[0] * 60 + parts[1];
        } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
          totalSecs += parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
      }
    });

    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = Math.floor(totalSecs % 60);
    const timeFormatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    const avgCorrect = totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0;

    return { totalEx, avgCorrect, timeFormatted };
  }, [myExercises]);

  const openForm = (record?: ExerciseRecord) => {
    if (record) {
      setEditingId(record.id);
      setDate(record.date);
      setType(record.type);
      setTotalQ(record.totalQuestions);
      setCorrectQ(record.correctQuestions);
      setTimeSpent(record.timeSpent);
    } else {
      setEditingId(null);
      setDate(formatDate(new Date()));
      setType('政治理论');
      setTotalQ('');
      setCorrectQ('');
      setTimeSpent('');
    }
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      date,
      type,
      totalQuestions: Number(totalQ),
      correctQuestions: Number(correctQ),
      timeSpent
    };
    if (editingId) {
      updateExercise(editingId, data);
    } else {
      addExercise(data);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">题目练习记录</h1>
        <button
          onClick={() => openForm()}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm shadow-indigo-200 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>添加记​​录</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">总练习记录</p>
            <p className="text-2xl font-bold text-slate-900">{summaryStats.totalEx} <span className="text-sm font-medium text-slate-500 normal-case">次</span></p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">平均正确率</p>
            <p className="text-2xl font-bold text-slate-900">{summaryStats.avgCorrect}%</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">总用时</p>
            <p className="text-2xl font-bold text-slate-900 tracking-tight font-mono">{summaryStats.timeFormatted}</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-500 uppercase tracking-wide pr-2">题型筛选</label>
          <select 
            value={filterType} 
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-50 border-none rounded-lg text-sm px-3 py-2 pr-8 focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium text-slate-700"
          >
            <option value="All">全部题型</option>
            {QUESTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-500 uppercase tracking-wide pr-2">日期筛选</label>
          <input 
            type="date" 
            value={filterStartDate} 
            onChange={e => setFilterStartDate(e.target.value)}
            className="bg-slate-50 border-none rounded-lg text-sm px-3 py-2 focus:ring-2 focus:ring-indigo-500 shadow-none font-medium text-slate-700 w-[140px]"
          />
          <span className="text-slate-400">-</span>
          <input 
            type="date" 
            value={filterEndDate} 
            onChange={e => setFilterEndDate(e.target.value)}
            className="bg-slate-50 border-none rounded-lg text-sm px-3 py-2 focus:ring-2 focus:ring-indigo-500 shadow-none font-medium text-slate-700 w-[140px]"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 tracking-wider uppercase">日期</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 tracking-wider uppercase">题型</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 tracking-wider uppercase text-center">总题数</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 tracking-wider uppercase text-center">做对题数</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 tracking-wider uppercase text-center">正确率</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 tracking-wider uppercase text-center">做题用时</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 tracking-wider uppercase text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {myExercises.length > 0 ? myExercises.map(ex => (
                <tr key={ex.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-6 py-4 text-sm font-medium text-slate-700">{ex.date}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">
                    <span className="inline-flex px-2.5 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold">
                      {ex.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 text-center font-mono">{ex.totalQuestions}</td>
                  <td className="px-6 py-4 text-sm text-slate-600 text-center font-mono">{ex.correctQuestions}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-slate-900 text-center">
                    <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg text-xs tracking-wide">
                      {ex.totalQuestions > 0 ? Math.round((ex.correctQuestions / ex.totalQuestions) * 100) : 0}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 text-center font-mono">{ex.timeSpent || '--:--'}</td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => openForm(ex)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors inline-block" title="编辑">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        if (confirm('确定要删除这条记录吗？(可前往回收站恢复)')) deleteExercise(ex.id)
                      }} 
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-block" title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                         <Plus className="w-6 h-6 text-slate-400" />
                      </div>
                      <p className="font-medium text-slate-600">暂无相关练习记录，快去添加吧！</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? '编辑练习记录' : '新增练习记录'}>
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">练习日期 <span className="text-red-500">*</span></label>
            <input required type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 text-slate-900 transition-shadow" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">题目类型 <span className="text-red-500">*</span></label>
            <select required value={type} onChange={e => setType(e.target.value as QuestionType)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 text-slate-900 transition-shadow pr-10 cursor-pointer">
              {QUESTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">总题数 <span className="text-red-500">*</span></label>
              <input required type="number" min="1" value={totalQ} onChange={e => setTotalQ(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 font-mono text-slate-900 transition-shadow" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">做对题数 <span className="text-red-500">*</span></label>
              <input required type="number" min="0" max={totalQ || undefined} value={correctQ} onChange={e => setCorrectQ(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 font-mono text-slate-900 transition-shadow" />
            </div>
          </div>
          {totalQ !== '' && correctQ !== '' && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3 text-sm text-emerald-800 flex justify-between items-center">
              <span className="font-medium">当前正确率</span>
              <span className="font-bold text-lg">{Number(totalQ) > 0 ? Math.round((Number(correctQ) / Number(totalQ)) * 100) : 0}%</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">做题用时 (分:秒)</label>
            <input type="text" placeholder="例如 15:30" pattern="^\d+:[0-5]\d$" title="请使用 分:秒 格式" value={timeSpent} onChange={e => setTimeSpent(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 font-mono text-slate-900 transition-shadow" />
          </div>
          <div className="pt-2 flex justify-end gap-3">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">取消</button>
            <button type="submit" className="px-5 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-xl shadow-sm shadow-indigo-200 hover:bg-indigo-700 transition-colors">保存</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
