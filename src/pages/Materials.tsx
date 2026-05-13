import React, { useState, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { formatDate } from '../lib/utils';
import { Modal } from '../components/ui/Modal';
import { MATERIAL_CATEGORIES, type MaterialCategory, type MaterialRecord } from '../types';
import { Plus, Edit2, Trash2, Search, Library, LayoutGrid, List } from 'lucide-react';
import { formatZodError, materialInputSchema } from '../lib/recordSchemas';

const CATEGORY_THEMES: Record<MaterialCategory, {
  badge: string;
  gridBorder: string;
  listBorder: string;
  hover: string;
  active: string;
}> = {
  '经济': { 
    badge: 'bg-teal-50 border-teal-200 text-teal-700', 
    gridBorder: 'border-t-4 border-t-teal-400 border-x border-b border-slate-200/60',
    listBorder: 'border-l-4 border-l-teal-400 border-y border-r border-slate-200/60',
    hover: 'hover:border-teal-300 hover:bg-teal-50/40', 
    active: 'border-teal-400 ring-1 ring-teal-400 bg-teal-50/20' 
  },
  '政治': { 
    badge: 'bg-rose-50 border-rose-200 text-rose-700', 
    gridBorder: 'border-t-4 border-t-rose-400 border-x border-b border-slate-200/60',
    listBorder: 'border-l-4 border-l-rose-400 border-y border-r border-slate-200/60',
    hover: 'hover:border-rose-300 hover:bg-rose-50/40', 
    active: 'border-rose-400 ring-1 ring-rose-400 bg-rose-50/20' 
  },
  '文化': { 
    badge: 'bg-purple-50 border-purple-200 text-purple-700', 
    gridBorder: 'border-t-4 border-t-purple-400 border-x border-b border-slate-200/60',
    listBorder: 'border-l-4 border-l-purple-400 border-y border-r border-slate-200/60',
    hover: 'hover:border-purple-300 hover:bg-purple-50/40', 
    active: 'border-purple-400 ring-1 ring-purple-400 bg-purple-50/20' 
  },
  '社会': { 
    badge: 'bg-amber-50 border-amber-200 text-amber-700', 
    gridBorder: 'border-t-4 border-t-amber-400 border-x border-b border-slate-200/60',
    listBorder: 'border-l-4 border-l-amber-400 border-y border-r border-slate-200/60',
    hover: 'hover:border-amber-300 hover:bg-amber-50/40', 
    active: 'border-amber-400 ring-1 ring-amber-400 bg-amber-50/20' 
  },
  '生态': { 
    badge: 'bg-emerald-50 border-emerald-200 text-emerald-700', 
    gridBorder: 'border-t-4 border-t-emerald-400 border-x border-b border-slate-200/60',
    listBorder: 'border-l-4 border-l-emerald-400 border-y border-r border-slate-200/60',
    hover: 'hover:border-emerald-300 hover:bg-emerald-50/40', 
    active: 'border-emerald-400 ring-1 ring-emerald-400 bg-emerald-50/20' 
  },
  '党建': { 
    badge: 'bg-red-50 border-red-200 text-red-700', 
    gridBorder: 'border-t-4 border-t-red-400 border-x border-b border-slate-200/60',
    listBorder: 'border-l-4 border-l-red-400 border-y border-r border-slate-200/60',
    hover: 'hover:border-red-300 hover:bg-red-50/40', 
    active: 'border-red-400 ring-1 ring-red-400 bg-red-50/20' 
  },
  '国防': { 
    badge: 'bg-slate-100 border-slate-300 text-slate-700', 
    gridBorder: 'border-t-4 border-t-slate-400 border-x border-b border-slate-200/60',
    listBorder: 'border-l-4 border-l-slate-400 border-y border-r border-slate-200/60',
    hover: 'hover:border-slate-300 hover:bg-slate-50/40', 
    active: 'border-slate-400 ring-1 ring-slate-400 bg-slate-100/30' 
  },
  '外交': { 
    badge: 'bg-sky-50 border-sky-200 text-sky-700', 
    gridBorder: 'border-t-4 border-t-sky-400 border-x border-b border-slate-200/60',
    listBorder: 'border-l-4 border-l-sky-400 border-y border-r border-slate-200/60',
    hover: 'hover:border-sky-300 hover:bg-sky-50/40', 
    active: 'border-sky-400 ring-1 ring-sky-400 bg-sky-50/20' 
  },
};

export function Materials() {
  const { currentUser, materials, addMaterial, updateMaterial, deleteMaterial } = useAppContext();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Bulk Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState<Set<string>>(new Set());
  const [isBulkCategoryModalOpen, setIsBulkCategoryModalOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState<MaterialCategory>('经济');

  // Filters
  const [filterCategories, setFilterCategories] = useState<Set<string>>(new Set());
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date-desc'|'date-asc'|'summary-asc'|'summary-desc'>('date-desc');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Form State
  const [date, setDate] = useState(formatDate(new Date()));
  const [category, setCategory] = useState<MaterialCategory>('经济');
  const [summary, setSummary] = useState('');
  const [formError, setFormError] = useState('');

  const myMaterials = useMemo(() => 
    materials.filter(m => m.userId === currentUser?.id && !m.deletedAt)
      .filter(m => filterCategories.size === 0 ? true : filterCategories.has(m.category))
      .filter(m => filterStartDate ? m.date >= filterStartDate : true)
      .filter(m => filterEndDate ? m.date <= filterEndDate : true)
      .filter(m => {
        if (!searchQuery.trim()) return true;
        return m.summary.toLowerCase().includes(searchQuery.trim().toLowerCase());
      })
      .sort((a, b) => {
        if (sortBy === 'date-desc') return new Date(b.date).getTime() - new Date(a.date).getTime() || b.createdAt - a.createdAt;
        if (sortBy === 'date-asc') return new Date(a.date).getTime() - new Date(b.date).getTime() || a.createdAt - b.createdAt;
        if (sortBy === 'summary-asc') return a.summary.localeCompare(b.summary);
        if (sortBy === 'summary-desc') return b.summary.localeCompare(a.summary);
        return 0;
      }),
  [materials, currentUser?.id, filterCategories, filterStartDate, filterEndDate, searchQuery, sortBy]);

  const toggleCategoryFilter = (cat: string) => {
    const next = new Set(filterCategories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setFilterCategories(next);
  };

  const openForm = (record?: MaterialRecord) => {
    setFormError('');
    if (record) {
      setEditingId(record.id);
      setDate(record.date);
      setCategory(record.category);
      setSummary(record.summary);
    } else {
      setEditingId(null);
      setDate(formatDate(new Date()));
      setCategory('经济');
      setSummary('');
    }
    setIsModalOpen(true);
  };

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const result = materialInputSchema.safeParse({ date, category, summary });

    if (!result.success) {
      setFormError(formatZodError(result.error));
      return;
    }

    if (editingId) updateMaterial(editingId, result.data);
    else addMaterial(result.data);

    setFormError('');
    setIsModalOpen(false);
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === myMaterials.length && myMaterials.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(myMaterials.map(m => m.id)));
    }
  };

  const handleBulkDelete = () => {
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 条素材吗？`)) return;
    selectedIds.forEach(id => deleteMaterial(id));
    setSelectedIds(new Set());
  };

  const handleBulkCategorySave = (e: React.FormEvent) => {
    e.preventDefault();
    const currentSelected = new Set(selectedIds);
    selectedIds.forEach(id => updateMaterial(id, { category: bulkCategory }));
    setIsBulkCategoryModalOpen(false);
    setSelectedIds(new Set());
    
    setRecentlyUpdatedIds(currentSelected);
    setTimeout(() => {
      setRecentlyUpdatedIds(new Set());
    }, 2000); // 2 second visual feedback
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">素材积累</h1>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              title="网格视图"
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              title="列表视图"
            >
              <List className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={() => openForm()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm shadow-indigo-200 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>积累素材</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-sm font-semibold text-slate-500 uppercase tracking-wide min-w-fit pr-2">分类选项</label>
            <div className="flex flex-wrap gap-2">
              {MATERIAL_CATEGORIES.map(cat => {
                const isSelected = filterCategories.has(cat);
                const theme = CATEGORY_THEMES[cat];
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategoryFilter(cat)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                      isSelected 
                        ? theme.badge 
                        : 'bg-white/80 border-slate-200/60 text-slate-600 hover:bg-slate-100/50'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
              {filterCategories.size > 0 && (
                <button onClick={() => setFilterCategories(new Set())} className="text-sm text-slate-400 hover:text-slate-600 font-medium px-2 transition-colors">清除</button>
              )}
            </div>
          </div>
          
          {myMaterials.length > 0 && (
            <label className="flex items-center space-x-2 cursor-pointer bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={selectedIds.size === myMaterials.length && myMaterials.length > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
              />
              <span className="text-sm font-medium text-slate-700">全选</span>
            </label>
          )}
        </div>

        <div className="flex flex-col gap-4 pt-4 border-t border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 text-slate-400" />
              <input
                type="text"
                placeholder="搜索主题内容..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 transition-shadow outline-none"
              />
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-500 uppercase tracking-wide">排序</span>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow cursor-pointer"
              >
                <option value="date-desc">日期 (最新到最旧)</option>
                <option value="date-asc">日期 (最旧到最新)</option>
                <option value="summary-asc">摘要内容 (A-Z)</option>
                <option value="summary-desc">摘要内容 (Z-A)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold text-slate-500 uppercase tracking-wide pr-2">日期筛选</label>
              <input 
                type="date" 
                value={filterStartDate} 
                onChange={e => setFilterStartDate(e.target.value)}
                className="bg-slate-50 border border-slate-100 rounded-lg text-sm px-3 py-2 focus:ring-2 focus:ring-indigo-500 shadow-none outline-none"
              />
              <span className="text-slate-400">-</span>
              <input 
                type="date" 
                value={filterEndDate} 
                onChange={e => setFilterEndDate(e.target.value)}
                className="bg-slate-50 border border-slate-100 rounded-lg text-sm px-3 py-2 focus:ring-2 focus:ring-indigo-500 shadow-none outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 sticky top-6 z-10 shadow-sm animate-in fade-in slide-in-from-bottom-2">
          <div className="text-sm font-medium text-indigo-800">
            已选择 <span className="font-bold text-lg">{selectedIds.size}</span> 项素材
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => setIsBulkCategoryModalOpen(true)}
              className="px-4 py-2 bg-white text-indigo-600 text-sm font-medium border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors"
            >
              修改分类
            </button>
            <button 
              onClick={handleBulkDelete}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 shadow-sm shadow-red-200 transition-colors"
            >
              批量删除
            </button>
          </div>
        </div>
      )}

      <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" : "flex flex-col gap-4"}>
        {myMaterials.map(mat => {
          const isUpdated = recentlyUpdatedIds.has(mat.id);
          const isSelected = selectedIds.has(mat.id);
          const theme = CATEGORY_THEMES[mat.category];

          return (
            <div 
              key={mat.id} 
              className={`bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border p-6 transition-all relative group cursor-default ${
                isUpdated ? 'border-emerald-400 ring-2 ring-emerald-400 bg-emerald-50/30' : 
                isSelected ? `${theme.activeRing} ${viewMode === 'grid' ? theme.gridBorder : theme.listBorder}` : `${viewMode === 'grid' ? theme.gridBorder : theme.listBorder} ${theme.hover}`
              } ${viewMode === 'list' ? 'flex flex-row items-center gap-6 p-4' : ''}`}
            >
              <div className={viewMode === 'grid' ? "absolute top-6 right-6" : "flex flex-shrink-0 items-center justify-center pl-2"}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(mat.id)}
                  className="w-5 h-5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
              </div>
              
              <div className={`flex flex-col ${viewMode === 'list' ? 'flex-1' : ''}`}>
                <div className={`flex justify-between items-start ${viewMode === 'grid' ? 'mb-4 pr-8' : 'mb-2'}`}>
                  <span className={`inline-flex px-2.5 py-1 ${isUpdated ? 'bg-emerald-100 border-emerald-200 text-emerald-800' : theme.badge} border rounded-lg text-xs font-semibold transition-colors duration-500`}>
                    {mat.category}
                  </span>
                </div>
                
                <div className="text-xs text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded-md inline-block mb-3 w-fit">
                  {mat.date}
                </div>

                <div className="text-slate-700 text-sm leading-relaxed mb-4 w-full">
                  {mat.summary.length > 80 && !expandedIds.has(mat.id) ? (
                    <>
                      <span className="whitespace-pre-wrap block">{mat.summary.slice(0, 80)}...</span>
                      <button onClick={(e) => toggleExpand(mat.id, e)} className="text-indigo-600 hover:text-indigo-700 font-medium text-xs mt-1.5 focus:outline-none">阅读更多</button>
                    </>
                  ) : (
                    <>
                      <span className="whitespace-pre-wrap block">{mat.summary}</span>
                      {mat.summary.length > 80 && (
                        <button onClick={(e) => toggleExpand(mat.id, e)} className="text-indigo-600 hover:text-indigo-700 font-medium text-xs mt-1.5 focus:outline-none">收起</button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className={`${viewMode === 'list' ? 'relative opacity-100 block' : 'absolute bottom-4 right-4 opacity-0 group-hover:opacity-100'} transition-opacity flex space-x-2 bg-white/90 backdrop-blur pl-2 rounded-l-lg`}>
                <button onClick={() => openForm(mat)} className="p-2 text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors" title="编辑">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => { if(confirm('确定删除素材？')) deleteMaterial(mat.id) }} 
                  className="p-2 text-slate-400 bg-white border border-slate-100 rounded-lg hover:text-red-600 hover:border-red-100 hover:bg-red-50 transition-colors" title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {myMaterials.length === 0 && (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-500 bg-white rounded-2xl border border-slate-100 border-dashed">
            <Library className="w-12 h-12 text-slate-300 mb-4" />
            <p className="font-medium text-slate-600">暂无素材积累记录，快去积累吧！</p>
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? '编辑素材' : '新增素材'}>
        <form onSubmit={handleSave} className="space-y-5">
          {formError && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {formError}
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">日期 <span className="text-red-500">*</span></label>
            <input required type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 transition-shadow" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">分类 <span className="text-red-500">*</span></label>
            <select required value={category} onChange={e => setCategory(e.target.value as MaterialCategory)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 transition-shadow">
              {MATERIAL_CATEGORIES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">主题内容 (一句话概括) <span className="text-red-500">*</span></label>
            <textarea 
              required 
              rows={4} 
              placeholder="记录名言警句、热点词汇或答题金句..."
              value={summary} 
              onChange={e => setSummary(e.target.value)} 
              maxLength={500}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none text-slate-900 transition-shadow" 
            />
            <p className="mt-2 text-right text-xs text-slate-400">{summary.trim().length} / 500</p>
          </div>
          <div className="pt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">取消</button>
            <button type="submit" className="px-5 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-xl shadow-sm shadow-indigo-200 hover:bg-indigo-700 transition-colors">保存</button>
          </div>
        </form>
      </Modal>
      <Modal isOpen={isBulkCategoryModalOpen} onClose={() => setIsBulkCategoryModalOpen(false)} title="批量修改分类">
        <form onSubmit={handleBulkCategorySave} className="space-y-5">
          <div>
            <p className="text-sm text-slate-600 mb-4">
              将选中的 {selectedIds.size} 项素材修改为以下分类：
            </p>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">分类 <span className="text-red-500">*</span></label>
            <select required value={bulkCategory} onChange={e => setBulkCategory(e.target.value as MaterialCategory)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 transition-shadow">
              {MATERIAL_CATEGORIES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="pt-2 flex justify-end gap-3">
            <button type="button" onClick={() => setIsBulkCategoryModalOpen(false)} className="px-5 py-2.5 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">取消</button>
            <button type="submit" className="px-5 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-xl shadow-sm shadow-indigo-200 hover:bg-indigo-700 transition-colors">保存更改</button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
