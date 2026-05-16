import React, { useState } from 'react';
import { KeyRound, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { useAppContext } from '../contexts/AppContext';

export function Accounts() {
  const { accounts, currentUser, isCloudMode, createAccount, updatePassword, deleteAccount } = useAppContext();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingUsername, setEditingUsername] = useState<string | null>(null);
  const [nextPassword, setNextPassword] = useState('');
  const [nextPasswordConfirm, setNextPasswordConfirm] = useState('');

  const handleCreateAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);

    if (password !== confirmPassword) {
      setStatus({ type: 'error', message: '两次输入的密码不一致' });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createAccount(username, password);
      if (!result.success) {
        setStatus({ type: 'error', message: result.message || '账号创建失败' });
        return;
      }

      setUsername('');
      setPassword('');
      setConfirmPassword('');
      setStatus({ type: 'success', message: '账号已创建' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPasswordModal = (targetUsername: string) => {
    setEditingUsername(targetUsername);
    setNextPassword('');
    setNextPasswordConfirm('');
    setStatus(null);
  };

  const handleUpdatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingUsername) return;

    if (nextPassword !== nextPasswordConfirm) {
      setStatus({ type: 'error', message: '两次输入的密码不一致' });
      return;
    }

    const result = await updatePassword(editingUsername, nextPassword);
    if (!result.success) {
      setStatus({ type: 'error', message: result.message || '密码修改失败' });
      return;
    }

    setEditingUsername(null);
    setStatus({ type: 'success', message: '密码已更新' });
  };

  const handleDeleteAccount = (targetUsername: string) => {
    if (!confirm(`确定移除账号「${targetUsername}」吗？该账号的本地学习记录也会一并删除。`)) return;

    const result = deleteAccount(targetUsername);
    if (!result.success) {
      setStatus({ type: 'error', message: result.message || '账号移除失败' });
      return;
    }

    setStatus({ type: 'success', message: '账号已移除' });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">账户管理</h1>
        <p className="text-slate-500 mt-1">
          {isCloudMode ? '云端账户用于多端登录与数据同步。' : '本地浏览器账户，仅用于当前设备的轻量访问控制。'}
        </p>
      </div>

      {status && (
        <div className={`p-4 rounded-xl text-sm font-medium border ${
          status.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
            : 'bg-red-50 text-red-600 border-red-100'
        }`}>
          {status.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">{isCloudMode ? '云端账户' : '本地账户'}</h2>
            <span className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-full px-3 py-1">
              {accounts.length} 个账号
            </span>
          </div>

          <ul className="divide-y divide-slate-100">
            {accounts.map(account => (
              <li key={account.username} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                    {account.username[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900 truncate">{account.username}</p>
                      {account.username === currentUser?.username && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">
                          <ShieldCheck className="w-3 h-3" />
                          当前
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      创建于 {new Date(account.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openPasswordModal(account.username)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                  >
                    <KeyRound className="w-4 h-4" />
                    改密
                  </button>
                  <button
                    onClick={() => handleDeleteAccount(account.username)}
                    disabled={isCloudMode || account.username === currentUser?.username || accounts.length <= 1}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                  >
                    <Trash2 className="w-4 h-4" />
                    移除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {isCloudMode ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-5 self-start">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              <h2 className="font-bold text-slate-900">云端同步已启用</h2>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              当前项目使用 Supabase Auth 管理账户。新增账户请退出登录后在登录页注册；删除账户需要在 Supabase 控制台中完成。
            </p>
            <button
              type="button"
              onClick={() => currentUser?.username && openPasswordModal(currentUser.username)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-colors shadow-sm shadow-indigo-200"
            >
              修改当前账号密码
            </button>
          </div>
        ) : (
        <form onSubmit={handleCreateAccount} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-5 self-start">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-900">添加账号</h2>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">账号名</label>
            <input
              required
              value={username}
              onChange={event => setUsername(event.target.value)}
              autoComplete="off"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 text-slate-900 transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">密码</label>
            <input
              required
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="new-password"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 text-slate-900 transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">确认密码</label>
            <input
              required
              type="password"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 text-slate-900 transition-shadow"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium py-3 rounded-xl transition-colors shadow-sm shadow-indigo-200"
          >
            {isSubmitting ? '创建中...' : '创建账号'}
          </button>
        </form>
        )}
      </div>

      <Modal isOpen={Boolean(editingUsername)} onClose={() => setEditingUsername(null)} title="修改密码">
        <form onSubmit={handleUpdatePassword} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">账号</label>
            <input
              disabled
              value={editingUsername || ''}
              className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">新密码</label>
            <input
              required
              type="password"
              value={nextPassword}
              onChange={event => setNextPassword(event.target.value)}
              autoComplete="new-password"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 text-slate-900 transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">确认新密码</label>
            <input
              required
              type="password"
              value={nextPasswordConfirm}
              onChange={event => setNextPasswordConfirm(event.target.value)}
              autoComplete="new-password"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 text-slate-900 transition-shadow"
            />
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <button type="button" onClick={() => setEditingUsername(null)} className="px-5 py-2.5 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
              取消
            </button>
            <button type="submit" className="px-5 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-xl shadow-sm shadow-indigo-200 hover:bg-indigo-700 transition-colors">
              保存
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
