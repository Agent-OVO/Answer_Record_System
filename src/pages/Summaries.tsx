import React, { useState, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { formatDate } from '../lib/utils';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isSameMonth, isSameDay, parseISO, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight, Edit3, Plus, Trash2 } from 'lucide-react';

export function Summaries() {
  const { currentUser, summaries, exercises, materials, addSummary, updateSummary, deleteSummary } = useAppContext();
  
  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isEditing, setIsEditing] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');

  const selectedDateStr = formatDate(selectedDate);
  
  // Data for selected day
  const dailySummary = useMemo(() => 
    summaries.find(s => s.userId === currentUser?.id && s.date === selectedDateStr && !s.deletedAt),
  [summaries, currentUser?.id, selectedDateStr]);
  
  const dailyExercises = useMemo(() => 
    exercises.filter(e => e.userId === currentUser?.id && e.date === selectedDateStr && !e.deletedAt),
  [exercises, currentUser?.id, selectedDateStr]);
  
  const dailyMaterials = useMemo(() => 
    materials.filter(m => m.userId === currentUser?.id && m.date === selectedDateStr && !m.deletedAt),
  [materials, currentUser?.id, selectedDateStr]);

  // Handle Edit/Save
  const handleEdit = () => {
    setSummaryDraft(dailySummary?.content || '');
    setIsEditing(true);
  };

  const handleSave = () => {
    if (dailySummary) {
      updateSummary(dailySummary.id, { content: summaryDraft });
    } else {
      addSummary({ date: selectedDateStr, content: summaryDraft });
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (dailySummary && confirm('确定清空该日概述？')) {
      deleteSummary(dailySummary.id);
      setIsEditing(false);
    }
  };

  // Calendar logic
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  
  // We want to start the calendar grid from Sunday of the first week
  const startDate = new Date(monthStart);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const endDate = new Date(monthEnd);
  endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

  const allDays = eachDayOfInterval({ start: startDate, end: endDate });

  // Compute activity presence
  const activeDaysSet = useMemo(() => {
    const s = new Set<string>();
    [...exercises, ...materials, ...summaries].forEach(item => {
      if (item.userId === currentUser?.id && !item.deletedAt) s.add(item.date);
    });
    return s;
  }, [exercises, materials, summaries, currentUser?.id]);

  const changeMonth = (diff: number) => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + diff);
    setCurrentDate(d);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">每日总结与日历打卡</h1>
        <p className="text-slate-500 mt-1">选择一天查看当天的所有学习记录，并反思总结。</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Calendar Panel */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 self-start">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900">
              {format(currentDate, 'yyyy年MM月')}
            </h2>
            <div className="flex space-x-2">
              <button onClick={() => changeMonth(-1)} className="p-1.5 hover:bg-slate-50 text-slate-600 rounded-lg transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button onClick={() => setCurrentDate(new Date())} className="text-sm px-3 py-1 font-medium bg-slate-50 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">
                今天
              </button>
              <button onClick={() => changeMonth(1)} className="p-1.5 hover:bg-slate-50 text-slate-600 rounded-lg transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {['日', '一', '二', '三', '四', '五', '六'].map(day => (
              <div key={day} className="text-center text-xs font-semibold text-slate-400 py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {allDays.map((date, i) => {
              const dStr = formatDate(date);
              const isActive = activeDaysSet.has(dStr);
              const isSelected = isSameDay(date, selectedDate);
              const isCurrMonth = isSameMonth(date, currentDate);
              
              return (
                <button
                  key={i}
                  onClick={() => {
                    setSelectedDate(date);
                    setIsEditing(false);
                  }}
                  className={`flex flex-col items-center justify-center h-12 rounded-xl transition-all ${
                    !isCurrMonth ? 'opacity-40' : ''
                  } ${
                    isSelected 
                      ? 'border-indigo-500 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-500' 
                      : 'border-transparent hover:bg-slate-50'
                  }`}
                >
                  <span className={`text-sm font-medium ${isToday(date) ? 'text-indigo-600' : 'text-slate-700'}`}>
                    {date.getDate()}
                  </span>
                  <div className="w-full flex justify-center mt-1 h-1.5">
                    {isActive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Info Panel */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col min-h-[400px]">
          <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-4 mb-4">
            {format(selectedDate, 'yyyy年 MM月 dd日')} 摘要
          </h3>

          <div className="space-y-6 flex-1">
            {/* Daily Summary */}
            <div className="relative">
              <h4 className="text-sm font-semibold text-slate-500 mb-2 flex justify-between uppercase tracking-wider">
                <span>学习概述</span>
                {!isEditing && (
                  <button onClick={handleEdit} className="text-indigo-600 hover:text-indigo-700 text-xs flex items-center font-medium">
                    {dailySummary ? <><Edit3 className="w-3.5 h-3.5 mr-1" /> 编辑</> : <><Plus className="w-3.5 h-3.5 mr-1" /> 添加</>}
                  </button>
                )}
              </h4>
              
              {isEditing ? (
                <div className="space-y-3">
                  <textarea
                    autoFocus
                    maxLength={100}
                    rows={3}
                    placeholder="今天学得怎么样？(100字以内)"
                    value={summaryDraft}
                    onChange={e => setSummaryDraft(e.target.value)}
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 transition-shadow resize-none"
                  />
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">{summaryDraft.length} / 100</span>
                    <div className="space-x-2">
                       <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-medium transition-colors">取消</button>
                       <button onClick={handleSave} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl shadow-sm shadow-indigo-200 hover:bg-indigo-700 font-medium transition-colors">保存</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 min-h-[4rem] group relative">
                  {dailySummary ? (
                    <>
                      <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{dailySummary.content}</p>
                      <button onClick={handleDelete} className="absolute bottom-3 right-3 p-1.5 bg-white shadow-sm rounded-lg border border-slate-100 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <p className="text-slate-400 text-sm italic py-2">暂无概述</p>
                  )}
                </div>
              )}
            </div>

            {/* Exercise Preview */}
            <div>
              <h4 className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wider">练习统计</h4>
              {dailyExercises.length > 0 ? (
                <ul className="space-y-2">
                  {dailyExercises.map(e => (
                    <li key={e.id} className="flex justify-between items-center text-sm bg-white border border-slate-100 shadow-sm p-3 rounded-xl">
                      <span className="font-semibold text-slate-700">{e.type}</span>
                      <span className="text-slate-500 flex items-center">
                        {e.correctQuestions}/{e.totalQuestions}题 
                        <span className="ml-3 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md text-xs font-bold font-mono">
                          {Math.round((e.correctQuestions / e.totalQuestions) * 100)}%
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400 bg-slate-50 border border-slate-100 p-3 rounded-xl italic">无练习记录</p>
              )}
            </div>

            {/* Material Preview */}
            <div>
              <h4 className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wider">积累素材 ({dailyMaterials.length})</h4>
              {dailyMaterials.length > 0 ? (
                <ul className="space-y-2">
                  {dailyMaterials.map(m => (
                    <li key={m.id} className="text-sm bg-white border border-slate-100 shadow-sm p-3 rounded-xl flex items-start">
                      <span className="font-semibold text-indigo-700 text-[10px] px-1.5 py-0.5 border border-indigo-100 rounded bg-indigo-50 mr-3 flex-shrink-0 mt-0.5">{m.category}</span>
                      <span className="text-slate-700 leading-relaxed max-w-full overflow-hidden text-ellipsis">{m.summary}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400 bg-slate-50 border border-slate-100 p-3 rounded-xl italic">无素材记录</p>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
