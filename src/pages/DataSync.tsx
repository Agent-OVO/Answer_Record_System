import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { formatDate } from '../lib/utils';
import { Modal } from '../components/ui/Modal';
import { ANALYTICS_EVENTS } from '../lib/analyticsTracker';
import {
  downloadRecordsWorkbook,
  downloadTemplateWorkbook,
  parseImportWorkbook,
  type ImportIssue,
  type ImportPreviewData,
} from '../lib/importWorkbook';

type StatusState = {
  type: 'success' | 'error' | 'info';
  title: string;
  msg: string;
};

type ProgressState = {
  current: number;
  total: number;
  label: string;
  detail?: string;
};

const STATUS_STYLES: Record<StatusState['type'], string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  error: 'bg-red-50 text-red-600 border-red-100',
  info: 'bg-sky-50 text-sky-700 border-sky-100',
};

const ISSUE_LABELS: Record<ImportIssue['scope'], string> = {
  workbook: '工作簿',
  exercise: '题目练习',
  material: '素材积累',
  summary: '每日总结',
};

const buildBackupFileName = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');

  return `学而录_覆盖前备份_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.xlsx`;
};

export function DataSync() {
  const { currentUser, exercises, materials, summaries, importData, isCloudMode, trackAnalyticsEvent } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<'append' | 'overwrite'>('append');
  const [status, setStatus] = useState<StatusState | null>(null);
  const [isConfirmingOverwrite, setIsConfirmingOverwrite] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<ImportPreviewData | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const activeData = useMemo(() => ({
    exercises: exercises.filter(record => record.userId === currentUser?.id && !record.deletedAt),
    materials: materials.filter(record => record.userId === currentUser?.id && !record.deletedAt),
    summaries: summaries.filter(record => record.userId === currentUser?.id && !record.deletedAt),
  }), [currentUser?.id, exercises, materials, summaries]);

  const issueSummary = useMemo(() => {
    const issues = preview?.issues || [];
    return {
      errors: issues.filter(issue => issue.severity === 'error'),
      warnings: issues.filter(issue => issue.severity === 'warning'),
    };
  }, [preview]);

  const handleExport = () => {
    const fileName = `学而录_${formatDate(new Date())}.xlsx`;
    downloadRecordsWorkbook(activeData, fileName);
    trackAnalyticsEvent(ANALYTICS_EVENTS.EXPORT_DATA, {
      source: 'data_sync',
      metadata: {
        fileName,
        exerciseCount: activeData.exercises.length,
        materialCount: activeData.materials.length,
        summaryCount: activeData.summaries.length,
      },
    });
    setStatus({
      type: 'success',
      title: '导出完成',
      msg: `当前账号数据已导出为 ${fileName}`,
    });
  };

  const handleDownloadTemplate = () => {
    downloadTemplateWorkbook('学而录_导入模板.xlsx');
    setStatus({
      type: 'info',
      title: '模板已下载',
      msg: '请按模板字段填写数据，再重新上传导入。',
    });
  };

  const handleImportBtnClick = () => {
    if (importMode === 'overwrite') {
      setIsConfirmingOverwrite(true);
      return;
    }

    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setStatus({
        type: 'info',
        title: '正在解析文件',
        msg: `正在读取 ${file.name}，稍后会展示导入预览。`,
      });
      setProgress({
        current: 1,
        total: 2,
        label: '读取文件',
        detail: file.name,
      });

      const previewData = parseImportWorkbook(file.name, await file.arrayBuffer());
      setPreview(previewData);
      setIsPreviewOpen(true);

      if (previewData.hasBlockingIssues) {
        setStatus({
          type: 'error',
          title: '发现阻断问题',
          msg: '请先修正预览中的错误后再重新上传，当前不会写入任何数据。',
        });
      } else {
        setStatus({
          type: 'info',
          title: '预览已生成',
          msg: `已通过基础校验，共识别 ${previewData.totalValid} 条可导入记录。`,
        });
      }
    } catch (error) {
      setStatus({
        type: 'error',
        title: '读取失败',
        msg: error instanceof Error ? error.message : '无法解析当前文件，请检查 Excel 格式后重试。',
      });
    } finally {
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!preview || preview.hasBlockingIssues || preview.totalValid === 0) return;

    const totalSteps = importMode === 'overwrite' ? 3 : 2;

    try {
      setIsImporting(true);

      if (importMode === 'overwrite') {
        const backupFileName = buildBackupFileName();
        setProgress({
          current: 1,
          total: totalSteps,
          label: '生成覆盖前备份',
          detail: backupFileName,
        });
        downloadRecordsWorkbook(activeData, backupFileName);
      }

      setProgress({
        current: importMode === 'overwrite' ? 2 : 1,
        total: totalSteps,
        label: importMode === 'overwrite' ? '安全替换数据中' : '写入数据中',
        detail: importMode === 'overwrite'
          ? (isCloudMode ? '云端覆盖通过单个事务提交，失败会自动回滚。' : '本地数据将基于备份快照安全替换。')
          : '校验通过后开始写入新增记录。',
      });

      const result = await importData(
        preview.exercises,
        preview.materials,
        preview.summaries,
        importMode
      );

      if (!result.success) {
        setStatus({
          type: 'error',
          title: '导入失败',
          msg: result.message,
        });
        return;
      }

      setProgress({
        current: totalSteps,
        total: totalSteps,
        label: '导入完成',
        detail: `${preview.totalValid} 条记录已处理完成。`,
      });

      setStatus({
        type: 'success',
        title: '导入完成',
        msg: importMode === 'overwrite' && result.backupCreated
          ? `${result.message}，并已在替换前自动导出当前数据备份。`
          : result.message,
      });

      setIsPreviewOpen(false);
      setPreview(null);
    } catch (error) {
      setStatus({
        type: 'error',
        title: '导入失败',
        msg: error instanceof Error ? error.message : '导入过程中出现未知错误。',
      });
    } finally {
      setIsImporting(false);
      setProgress(null);
    }
  };

  const closePreview = () => {
    if (isImporting) return;
    setIsPreviewOpen(false);
    setPreview(null);
  };

  const previewCounts = preview ? {
    exercises: preview.exercises.length,
    materials: preview.materials.length,
    summaries: preview.summaries.length,
  } : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">数据导入与导出</h1>
        <p className="mt-1 text-slate-500">
          导入前会先做结构校验与内容预览。覆盖模式下，系统会先导出当前数据备份，再执行安全替换。
        </p>
      </div>

      {status && (
        <div className={`flex items-start gap-3 rounded-2xl border px-4 py-4 ${STATUS_STYLES[status.type]}`}>
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">{status.title}</p>
            <p className="text-sm">{status.msg}</p>
          </div>
        </div>
      )}

      {progress && (
        <div className="flex flex-col space-y-3 rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 text-sm font-medium sm:flex-row sm:items-center sm:justify-between">
            <span className="text-indigo-700">{progress.label}</span>
            <span className="text-slate-500">{progress.current} / {progress.total}</span>
          </div>
          {progress.detail && <p className="text-sm text-slate-500">{progress.detail}</p>}
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-2.5 rounded-full bg-indigo-600 transition-all duration-300 ease-out"
              style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center self-center rounded-full bg-indigo-50 text-indigo-600">
            <Download className="h-6 w-6" />
          </div>
          <h2 className="mb-2 text-lg font-bold text-slate-900">导出数据</h2>
          <p className="mb-6 flex-1 text-left text-sm text-slate-500">
            将当前账号的题目练习、素材积累和每日总结导出为 Excel 文件，方便备份、迁移或离线分析。
          </p>
          <button
            onClick={handleExport}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 font-medium text-indigo-600 transition-colors hover:bg-slate-100"
          >
            导出当前账号数据
          </button>
        </div>

        <div className="flex flex-col rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center self-center rounded-full bg-indigo-50 text-indigo-600">
            <Upload className="h-6 w-6" />
          </div>
          <h2 className="mb-2 text-lg font-bold text-slate-900">导入数据</h2>
          <p className="mb-4 flex-1 text-left text-sm text-slate-500">
            建议先下载标准模板并按字段填写。上传后系统会先做预览和校验，通过后才允许真正导入。
          </p>

          <button onClick={handleDownloadTemplate} className="mb-4 text-left text-sm font-medium text-indigo-600 hover:underline">
            下载标准 Excel 模板
          </button>

          <div className="mb-6 w-full rounded-xl bg-slate-50 p-4 text-left">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">导入模式</label>
            <div className="mt-3 flex flex-col gap-2">
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  checked={importMode === 'append'}
                  onChange={() => setImportMode('append')}
                  className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-700">追加导入，保留现有数据</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  checked={importMode === 'overwrite'}
                  onChange={() => setImportMode('overwrite')}
                  className="h-4 w-4 border-slate-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm text-slate-700">覆盖导入，替换当前账号全部数据</span>
              </label>
            </div>
          </div>

          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button
            onClick={handleImportBtnClick}
            className="w-full rounded-xl bg-indigo-600 py-3 font-medium text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-700"
            disabled={isImporting}
          >
            {isImporting ? '导入处理中...' : '选择文件并开始预览'}
          </button>
        </div>
      </div>

      <Modal
        isOpen={isConfirmingOverwrite}
        onClose={() => {
          setIsConfirmingOverwrite(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
        title="警告：覆盖导入"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-red-600">
            <ShieldAlert className="mt-0.5 h-6 w-6 flex-shrink-0" />
            <p className="text-sm font-medium leading-relaxed">
              覆盖导入会替换当前账号现有的题目练习、素材积累和每日总结。继续前，系统会先导出一份当前数据备份，之后再进入文件预览。
            </p>
          </div>
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setIsConfirmingOverwrite(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                setIsConfirmingOverwrite(false);
                fileInputRef.current?.click();
              }}
              className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-red-200 transition-colors hover:bg-red-700"
            >
              继续并选择文件
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isPreviewOpen}
        onClose={closePreview}
        title={preview ? `导入预览：${preview.fileName}` : '导入预览'}
        size="xl"
      >
        {preview && (
          <div className="space-y-6">
            <div className={`rounded-2xl border px-4 py-4 ${
              preview.hasBlockingIssues
                ? 'border-red-100 bg-red-50 text-red-600'
                : 'border-emerald-100 bg-emerald-50 text-emerald-700'
            }`}>
              <div className="flex items-start gap-3">
                {preview.hasBlockingIssues ? (
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
                )}
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">
                    {preview.hasBlockingIssues ? '当前文件还有错误，暂时不能导入' : '当前文件已通过基础校验，可以继续导入'}
                  </p>
                  <p>
                    {importMode === 'overwrite'
                      ? (isCloudMode
                        ? '覆盖导入会先导出当前数据备份，再通过单个云端事务替换记录；事务失败时云端数据会自动回滚。'
                        : '覆盖导入会先导出当前数据备份，再安全替换本地记录。')
                      : '追加导入只会新增这批记录，不会删除你现有的数据。'}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">可导入记录</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{preview.totalValid}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">错误数量</p>
                <p className="mt-2 text-2xl font-bold text-red-600">{issueSummary.errors.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">警告数量</p>
                <p className="mt-2 text-2xl font-bold text-amber-600">{issueSummary.warnings.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">当前模式</p>
                <p className="mt-2 text-lg font-bold text-slate-900">{importMode === 'overwrite' ? '覆盖导入' : '追加导入'}</p>
              </div>
            </div>

            {importMode === 'overwrite' && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">当前账号将被替换的现有记录</p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-600">
                    练习记录 <span className="ml-2 font-semibold text-slate-900">{activeData.exercises.length}</span>
                  </div>
                  <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-600">
                    素材记录 <span className="ml-2 font-semibold text-slate-900">{activeData.materials.length}</span>
                  </div>
                  <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-600">
                    每日总结 <span className="ml-2 font-semibold text-slate-900">{activeData.summaries.length}</span>
                  </div>
                </div>
              </div>
            )}

            {previewCounts && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">题目练习</h3>
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{previewCounts.exercises} 条</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {preview.exercises.slice(0, 4).map((record, index) => (
                      <div key={`${record.date}-${record.type}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                        <p className="font-semibold text-slate-800">{record.type}</p>
                        <p className="mt-1 text-slate-500">{record.date}</p>
                        <p className="mt-2 text-slate-600">总题数 {record.totalQuestions}，做对 {record.correctQuestions}{record.timeSpent ? `，用时 ${record.timeSpent}` : ''}</p>
                      </div>
                    ))}
                    {preview.exercises.length === 0 && <p className="text-sm text-slate-400">本次不包含练习记录。</p>}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">素材积累</h3>
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{previewCounts.materials} 条</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {preview.materials.slice(0, 4).map((record, index) => (
                      <div key={`${record.date}-${record.category}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                        <p className="font-semibold text-slate-800">{record.category}</p>
                        <p className="mt-1 text-slate-500">{record.date}</p>
                        <p className="mt-2 whitespace-pre-wrap text-slate-600">{record.summary}</p>
                      </div>
                    ))}
                    {preview.materials.length === 0 && <p className="text-sm text-slate-400">本次不包含素材记录。</p>}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">每日总结</h3>
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{previewCounts.summaries} 条</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {preview.summaries.slice(0, 4).map((record, index) => (
                      <div key={`${record.date}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                        <p className="font-semibold text-slate-800">{record.date}</p>
                        <p className="mt-2 whitespace-pre-wrap text-slate-600">{record.content}</p>
                      </div>
                    ))}
                    {preview.summaries.length === 0 && <p className="text-sm text-slate-400">本次不包含每日总结。</p>}
                  </div>
                </div>
              </div>
            )}

            {preview.issues.length > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-slate-500" />
                  <h3 className="font-semibold text-slate-900">校验结果</h3>
                </div>
                <ul className="mt-4 space-y-3">
                  {preview.issues.slice(0, 10).map((issue, index) => (
                    <li
                      key={`${issue.scope}-${issue.row || index}-${issue.message}`}
                      className={`rounded-xl border px-4 py-3 text-sm ${
                        issue.severity === 'error'
                          ? 'border-red-100 bg-red-50 text-red-600'
                          : 'border-amber-100 bg-amber-50 text-amber-700'
                      }`}
                    >
                      <p className="font-medium">
                        {ISSUE_LABELS[issue.scope]}
                        {issue.row ? ` · 第 ${issue.row} 行` : ''}
                      </p>
                      <p className="mt-1">{issue.message}</p>
                    </li>
                  ))}
                </ul>
                {preview.issues.length > 10 && (
                  <p className="mt-3 text-sm text-slate-400">其余 {preview.issues.length - 10} 条问题已省略，请优先修复以上内容。</p>
                )}
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closePreview}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                关闭预览
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={preview.hasBlockingIssues || isImporting}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
              >
                {preview.hasBlockingIssues ? '请先修复错误' : isImporting ? '导入中...' : '确认导入'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
