import React, { useRef, useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import * as XLSX from 'xlsx';
import { Download, Upload, AlertCircle } from 'lucide-react';
import { formatDate } from '../lib/utils';
import { Modal } from '../components/ui/Modal';

export function DataSync() {
  const { currentUser, exercises, materials, summaries, importData } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<'append' | 'overwrite'>('append');
  const [status, setStatus] = useState<{ type: 'success'|'error'|'info', msg: string } | null>(null);
  
  const [isConfirmingOverwrite, setIsConfirmingOverwrite] = useState(false);
  const [progress, setProgress] = useState<{ current: number, total: number, label: string } | null>(null);

  const getMyData = () => {
    return {
      exercises: exercises.filter(x => x.userId === currentUser?.id && !x.deletedAt).map(x => ({
        '日期': x.date, '题型': x.type, '总题数': x.totalQuestions, '正确数': x.correctQuestions, '用时': x.timeSpent
      })),
      materials: materials.filter(x => x.userId === currentUser?.id && !x.deletedAt).map(x => ({
        '日期': x.date, '分类': x.category, '主题内容': x.summary
      })),
      summaries: summaries.filter(x => x.userId === currentUser?.id && !x.deletedAt).map(x => ({
        '日期': x.date, '概述文字': x.content
      }))
    };
  };

  const handleExport = () => {
    const data = getMyData();
    const wb = XLSX.utils.book_new();
    
    // Exercise Sheet
    const ws1 = XLSX.utils.json_to_sheet(data.exercises.length ? data.exercises : [{ '日期':'样例 2024-01-01', '题型':'政治理论', '总题数': 10, '正确数': 8, '用时':'10:00' }]);
    XLSX.utils.book_append_sheet(wb, ws1, "题目练习");
    
    // Materials Sheet
    const ws2 = XLSX.utils.json_to_sheet(data.materials.length ? data.materials : [{ '日期': '样例 2024-01-01', '分类':'经济', '主题内容':'宏观调控基本知识' }]);
    XLSX.utils.book_append_sheet(wb, ws2, "素材积累");
    
    // Summaries Sheet
    const ws3 = XLSX.utils.json_to_sheet(data.summaries.length ? data.summaries : [{ '日期': '样例 2024-01-01', '概述文字':'今日复习顺利' }]);
    XLSX.utils.book_append_sheet(wb, ws3, "每日总结");

    const fileName = `公考学习记录_${formatDate(new Date())}.xlsx`;
    XLSX.writeFile(wb, fileName);
    setStatus({ type: 'success', msg: `数据已成功导出为 ${fileName}` });
  };

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ '日期':'2024-01-01', '题型':'政治理论', '总题数': 10, '正确数': 8, '用时':'10:00' }]), "题目练习");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ '日期': '2024-01-01', '分类':'经济', '主题内容':'概括一句话' }]), "素材积累");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ '日期': '2024-01-01', '概述文字':'今日总结反思...' }]), "每日总结");
    XLSX.writeFile(wb, "公考记录_导入模板.xlsx");
  };

  const handleImportBtnClick = () => {
    if (importMode === 'overwrite') {
      setIsConfirmingOverwrite(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    processFile(file);
  };

  const processFile = async (file: File) => {
    setStatus(null);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        let newEx: any[] = [];
        let newMat: any[] = [];
        let newSum: any[] = [];

        // Parse Exercises
        if (workbook.SheetNames.includes("题目练习")) {
          const rawEx = XLSX.utils.sheet_to_json<any>(workbook.Sheets["题目练习"]);
          newEx = rawEx.filter(r => r['日期'] && !String(r['日期']).includes('样例')).map(r => ({
            date: r['日期'], type: r['题型'], totalQuestions: Number(r['总题数']), correctQuestions: Number(r['正确数']), timeSpent: String(r['用时'] || '')
          }));
        }
        
        // Parse Materials
        if (workbook.SheetNames.includes("素材积累")) {
          const rawMat = XLSX.utils.sheet_to_json<any>(workbook.Sheets["素材积累"]);
          newMat = rawMat.filter(r => r['日期'] && !String(r['日期']).includes('样例')).map(r => ({
            date: r['日期'], category: r['分类'], summary: r['主题内容']
          }));
        }

        // Parse Summaries
        if (workbook.SheetNames.includes("每日总结")) {
          const rawSum = XLSX.utils.sheet_to_json<any>(workbook.Sheets["每日总结"]);
          newSum = rawSum.filter(r => r['日期'] && !String(r['日期']).includes('样例')).map(r => ({
            date: r['日期'], content: r['概述文字']
          }));
        }

        const totalRecords = newEx.length + newMat.length + newSum.length;

        if (totalRecords === 0) {
          throw new Error('未找到有效数据，确保日期不含有"样例"字样，且工作表名称一致。');
        }

        setProgress({ current: 0, total: totalRecords, label: '解析完成，准备导入...' });

        let currentCount = 0;
        
        // Simulation of real-time processing to provide feedback
        for (let i = 0; i < newEx.length; i++) {
          currentCount++;
          if (currentCount % 5 === 0 || i === newEx.length - 1) {
            setProgress({ current: currentCount, total: totalRecords, label: `正在导入题目练习 (${i + 1}/${newEx.length})...` });
            await new Promise(res => setTimeout(res, 10)); // Yield to allow UI update
          }
        }

        for (let i = 0; i < newMat.length; i++) {
          currentCount++;
          if (currentCount % 5 === 0 || i === newMat.length - 1) {
            setProgress({ current: currentCount, total: totalRecords, label: `正在导入素材积累 (${i + 1}/${newMat.length})...` });
            await new Promise(res => setTimeout(res, 10)); // Yield to allow UI update
          }
        }

        for (let i = 0; i < newSum.length; i++) {
          currentCount++;
          if (currentCount % 5 === 0 || i === newSum.length - 1) {
            setProgress({ current: currentCount, total: totalRecords, label: `正在导入每日总结 (${i + 1}/${newSum.length})...` });
            await new Promise(res => setTimeout(res, 10)); // Yield to allow UI update
          }
        }

        importData(newEx, newMat, newSum, importMode);
        setStatus({ type: 'success', msg: `导入成功！共导入记录：练习 ${newEx.length}条, 素材 ${newMat.length}条, 总结 ${newSum.length}条。` });
        
      } catch (err: any) {
        setStatus({ type: 'error', msg: `导入失败: ${err.message}` });
      } finally {
        setProgress(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">数据导入与导出</h1>
      
      {status && (
        <div className={`p-4 rounded-lg flex items-start space-x-3 ${status.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{status.msg}</p>
        </div>
      )}

      {progress && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-indigo-100 flex flex-col space-y-3">
          <div className="flex justify-between items-center text-sm font-medium">
            <span className="text-indigo-700">{progress.label}</span>
            <span className="text-slate-500">{progress.current} / {progress.total}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div 
              className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300 ease-out" 
              style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
            ></div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export Panel */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-4">
            <Download className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">导出数据</h2>
          <p className="text-sm text-slate-500 mb-6 flex-1 text-left w-full">
            将当前账号的题目练习、素材积累和每日总结导出为 Excel 文件保存到本地，以便备份或离线分析。
          </p>
          <button 
            onClick={handleExport}
            className="w-full bg-slate-50 hover:bg-slate-100 text-indigo-600 font-medium py-3 rounded-xl transition-colors border border-slate-200"
          >
            导出所有数据
          </button>
        </div>

        {/* Import Panel */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-4">
            <Upload className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">导入数据</h2>
          <p className="text-sm text-slate-500 mb-4 flex-1 text-left w-full">
            你可以下载标准模板，按格式填写后批量导入数据。
            <br/>
            <button onClick={handleDownloadTemplate} className="text-indigo-600 hover:underline mt-2 font-medium">下载标准 Excel 模板</button>
          </p>

          <div className="w-full text-left bg-slate-50 p-4 rounded-xl mb-6 space-y-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">导入模式</label>
            <div className="flex flex-col space-y-2">
              <label className="flex items-center space-x-3 cursor-pointer group">
                <input type="radio" checked={importMode === 'append'} onChange={() => setImportMode('append')} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">追加 (保留现有数据)</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer group">
                <input type="radio" checked={importMode === 'overwrite'} onChange={() => setImportMode('overwrite')} className="w-4 h-4 text-red-600 border-slate-300 focus:ring-red-500" />
                <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">覆盖 (清空现有数据)</span>
              </label>
            </div>
          </div>

          <input 
            type="file" 
            accept=".xlsx, .xls" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button 
            onClick={handleImportBtnClick}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-colors shadow-sm shadow-indigo-200"
            disabled={!!progress}
          >
            {progress ? '正在导入...' : '选择文件并导入'}
          </button>
        </div>
      </div>

      <Modal isOpen={isConfirmingOverwrite} onClose={() => {
        setIsConfirmingOverwrite(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }} title="警告：数据覆盖确认">
        <div className="space-y-4">
          <div className="flex items-start space-x-3 text-red-600 bg-red-50 p-4 rounded-xl border border-red-100">
            <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium leading-relaxed">
              您选择了<strong>「覆盖」</strong>模式。此操作将<strong>清空当前账号的所有现有数据</strong>，替换为您选择的 Excel 文件中的内容。
              此操作一旦提交，可能无法还原。您确定要继续吗？
            </p>
          </div>
          <div className="pt-2 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={() => {
                setIsConfirmingOverwrite(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }} 
              className="px-5 py-2.5 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors"
            >
              取消并保留数据
            </button>
            <button 
              type="button"
              onClick={() => {
                setIsConfirmingOverwrite(false);
                fileInputRef.current?.click();
              }} 
              className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl shadow-sm shadow-red-200 hover:bg-red-700 transition-colors"
            >
              确认覆盖数据
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
