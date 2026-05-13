import React, { useMemo, useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { formatDate } from '../lib/utils';
import { Modal } from '../components/ui/Modal';
import { QUESTION_TYPES, type ExerciseRecord, type QuestionType } from '../types';
import { Activity, CheckCircle, Clock, Edit2, Plus, Trash2 } from 'lucide-react';
import { exerciseInputSchema, formatZodError } from '../lib/recordSchemas';

const defaultQuestionType = QUESTION_TYPES[0] as QuestionType;

export function Exercises() {
  const { currentUser, exercises, addExercise, updateExercise, deleteExercise } = useAppContext();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [filterType, setFilterType] = useState<string>('All');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  const [date, setDate] = useState(formatDate(new Date()));
  const [type, setType] = useState<QuestionType>(defaultQuestionType);
  const [totalQ, setTotalQ] = useState<number | string>('');
  const [correctQ, setCorrectQ] = useState<number | string>('');
  const [timeSpent, setTimeSpent] = useState('');
  const [formError, setFormError] = useState('');

  const myExercises = useMemo(
    () =>
      exercises
        .filter((exercise) => exercise.userId === currentUser?.id && !exercise.deletedAt)
        .filter((exercise) => (filterType === 'All' ? true : exercise.type === filterType))
        .filter((exercise) => (filterStartDate ? exercise.date >= filterStartDate : true))
        .filter((exercise) => (filterEndDate ? exercise.date <= filterEndDate : true))
        .sort((a, b) => b.createdAt - a.createdAt),
    [currentUser?.id, exercises, filterEndDate, filterStartDate, filterType],
  );

  const summaryStats = useMemo(() => {
    let totalEx = 0;
    let totalQuestions = 0;
    let totalCorrect = 0;
    let totalSecs = 0;

    myExercises.forEach((exercise) => {
      totalEx += 1;
      totalQuestions += exercise.totalQuestions || 0;
      totalCorrect += exercise.correctQuestions || 0;

      if (exercise.timeSpent) {
        const parts = exercise.timeSpent.split(':').map(Number);
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
    const avgCorrect = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    return { totalEx, avgCorrect, timeFormatted };
  }, [myExercises]);

  const getAccuracy = (record: ExerciseRecord) =>
    record.totalQuestions > 0 ? Math.round((record.correctQuestions / record.totalQuestions) * 100) : 0;

  const resetForm = () => {
    setEditingId(null);
    setDate(formatDate(new Date()));
    setType(defaultQuestionType);
    setTotalQ('');
    setCorrectQ('');
    setTimeSpent('');
    setFormError('');
  };

  const openForm = (record?: ExerciseRecord) => {
    setFormError('');

    if (record) {
      setEditingId(record.id);
      setDate(record.date);
      setType(record.type);
      setTotalQ(record.totalQuestions);
      setCorrectQ(record.correctQuestions);
      setTimeSpent(record.timeSpent);
    } else {
      resetForm();
    }

    setIsModalOpen(true);
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();

    const result = exerciseInputSchema.safeParse({
      date,
      type,
      totalQuestions: totalQ,
      correctQuestions: correctQ,
      timeSpent,
    });

    if (!result.success) {
      setFormError(formatZodError(result.error));
      return;
    }

    if (editingId) {
      updateExercise(editingId, result.data);
    } else {
      addExercise(result.data);
    }

    setIsModalOpen(false);
    resetForm();
  };

  const handleDelete = (id: string) => {
    if (confirm('确定删除这条练习记录吗？删除后仍可在回收站中恢复。')) {
      deleteExercise(id);
    }
  };

  const emptyState = (
    <div className="flex flex-col items-center justify-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50">
        <Plus className="h-6 w-6 text-slate-400" />
      </div>
      <p className="font-medium text-slate-600">暂无符合条件的练习记录。</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">题目练习记录</h1>
        <button
          onClick={() => openForm()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 font-medium text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-700 sm:w-auto"
        >
          <Plus className="h-5 w-5" />
          <span>新增记录</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">练习次数</p>
            <p className="text-2xl font-bold text-slate-900">{summaryStats.totalEx}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
            <CheckCircle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">平均正确率</p>
            <p className="text-2xl font-bold text-slate-900">{summaryStats.avgCorrect}%</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="rounded-xl bg-amber-50 p-3 text-amber-600">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">累计用时</p>
            <p className="font-mono text-2xl font-bold tracking-tight text-slate-900">{summaryStats.timeFormatted}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <label className="pr-2 text-sm font-semibold uppercase tracking-wide text-slate-500">题型</label>
            <select
              value={filterType}
              onChange={(event) => setFilterType(event.target.value)}
              className="w-full cursor-pointer rounded-lg border-none bg-slate-50 px-3 py-2 pr-8 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 sm:w-auto"
            >
              <option value="All">全部题型</option>
              {QUESTION_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <label className="pr-2 text-sm font-semibold uppercase tracking-wide text-slate-500">日期</label>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="date"
                value={filterStartDate}
                onChange={(event) => setFilterStartDate(event.target.value)}
                className="w-full rounded-lg border-none bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 shadow-none focus:ring-2 focus:ring-indigo-500 sm:w-[140px]"
              />
              <span className="hidden text-slate-400 sm:inline">-</span>
              <input
                type="date"
                value={filterEndDate}
                onChange={(event) => setFilterEndDate(event.target.value)}
                className="w-full rounded-lg border-none bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 shadow-none focus:ring-2 focus:ring-indigo-500 sm:w-[140px]"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 md:hidden">
        {myExercises.length > 0 ? (
          myExercises.map((record) => (
            <div key={record.id} className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{record.date}</p>
                <span className="inline-flex shrink-0 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                  {record.type}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">总题数</p>
                  <p className="mt-1 font-mono text-lg font-bold text-slate-900">{record.totalQuestions}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">做对题数</p>
                  <p className="mt-1 font-mono text-lg font-bold text-slate-900">{record.correctQuestions}</p>
                </div>
                <div className="rounded-xl bg-emerald-50 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">正确率</p>
                  <p className="mt-1 text-lg font-bold text-emerald-800">{getAccuracy(record)}%</p>
                </div>
                <div className="rounded-xl bg-amber-50 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">用时</p>
                  <p className="mt-1 font-mono text-lg font-bold text-amber-900">{record.timeSpent || '--:--'}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => openForm(record)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-indigo-600"
                  title="编辑"
                >
                  <Edit2 className="h-4 w-4" />
                  <span>编辑</span>
                </button>
                <button
                  onClick={() => handleDelete(record.id)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
                  title="删除"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>删除</span>
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white px-6 py-16 text-center text-slate-500 shadow-sm">
            {emptyState}
          </div>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">日期</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">题型</th>
                <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">总题数</th>
                <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">做对题数</th>
                <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">正确率</th>
                <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">用时</th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {myExercises.length > 0 ? (
                myExercises.map((record) => (
                  <tr key={record.id} className="group transition-colors hover:bg-slate-50/80">
                    <td className="px-6 py-4 text-sm font-medium text-slate-700">{record.date}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">
                      <span className="inline-flex rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                        {record.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center font-mono text-sm text-slate-600">{record.totalQuestions}</td>
                    <td className="px-6 py-4 text-center font-mono text-sm text-slate-600">{record.correctQuestions}</td>
                    <td className="px-6 py-4 text-center text-sm font-semibold text-slate-900">
                      <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs tracking-wide text-emerald-700">
                        {getAccuracy(record)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center font-mono text-sm text-slate-500">{record.timeSpent || '--:--'}</td>
                    <td className="space-x-2 px-6 py-4 text-right">
                      <button
                        onClick={() => openForm(record)}
                        className="inline-block rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                        title="编辑"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(record.id)}
                        className="inline-block rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-slate-500">
                    {emptyState}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? '编辑练习记录' : '新增练习记录'}>
        <form onSubmit={handleSave} className="space-y-5">
          {formError && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {formError}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              练习日期 <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-900 transition-shadow focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              题型 <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={type}
              onChange={(event) => setType(event.target.value as QuestionType)}
              className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-10 text-slate-900 transition-shadow focus:ring-2 focus:ring-indigo-500"
            >
              {QUESTION_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                总题数 <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="number"
                min="1"
                value={totalQ}
                onChange={(event) => setTotalQ(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 font-mono text-slate-900 transition-shadow focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                做对题数 <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="number"
                min="0"
                max={totalQ || undefined}
                value={correctQ}
                onChange={(event) => setCorrectQ(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 font-mono text-slate-900 transition-shadow focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {totalQ !== '' && correctQ !== '' && (
            <div className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span className="font-medium">当前正确率</span>
              <span className="text-lg font-bold">{Number(totalQ) > 0 ? Math.round((Number(correctQ) / Number(totalQ)) * 100) : 0}%</span>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">用时 (mm:ss 或 hh:mm:ss)</label>
            <input
              type="text"
              placeholder="15:30"
              value={timeSpent}
              onChange={(event) => setTimeSpent(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 font-mono text-slate-900 transition-shadow focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex flex-col-reverse justify-end gap-3 pt-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="w-full rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 sm:w-auto"
            >
              取消
            </button>
            <button
              type="submit"
              className="w-full rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-700 sm:w-auto"
            >
              保存
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
