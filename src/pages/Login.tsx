import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { hasAccounts, isCloudMode, login, createAccount } = useAppContext();
  const navigate = useNavigate();
  const isRegistering = isCloudMode ? authMode === 'register' : !hasAccounts;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    
    try {
      if (isRegistering) {
        if (password !== confirmPassword) {
          setError('两次输入的密码不一致');
          return;
        }

        const result = await createAccount(username, password);
        if (!result.success) {
          setError(result.message || '初始化账号失败');
          return;
        }

        if (isCloudMode) {
          const success = await login(username, password, true);
          if (success) {
            navigate('/');
          } else {
            setError('账号已创建，但自动登录失败。请切换到登录后重试。');
          }
          return;
        }
      }

      const success = await login(username, password, remember || !hasAccounts);
      if (success) {
        navigate('/');
      } else {
        setError('账号或密码错误');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
          {isCloudMode
            ? (isRegistering ? '创建云端账户' : '登录云端账户')
            : hasAccounts ? '公考学习记录系统' : '初始化本地账户'}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          {isCloudMode
            ? '多端登录后会同步题目、素材和每日总结'
            : hasAccounts ? '每日点滴，汇聚成考公路上的基石' : '首次使用需要在当前浏览器创建管理员账号'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm border border-slate-100 sm:rounded-2xl sm:px-10">
          {isCloudMode && (
            <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${authMode === 'login' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                登录
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('register')}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${authMode === 'register' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                注册
              </button>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700">{isCloudMode ? '邮箱' : '账号'}</label>
              <div className="mt-1">
                <input
                  type={isCloudMode ? 'email' : 'text'}
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete={isCloudMode ? 'email' : 'username'}
                  className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">密码</label>
              <div className="mt-1">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete={isRegistering ? 'new-password' : 'current-password'}
                  className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>

            {isRegistering && (
              <div>
                <label className="block text-sm font-medium text-slate-700">确认密码</label>
                <div className="mt-1">
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
              </div>
            )}

            {!isCloudMode && hasAccounts && (
              <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-900">
                  自动登录
                </label>
              </div>
            </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
              >
                {isSubmitting ? '处理中...' : isRegistering ? '创建并进入' : '登录'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
