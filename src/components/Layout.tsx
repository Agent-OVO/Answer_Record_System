import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { 
  LayoutDashboard, 
  BookOpenCheck, 
  Library, 
  CalendarDays, 
  BarChart3, 
  RefreshCcw, 
  Trash2,
  LogOut,
  Palette,
  Check,
  User,
  X,
  UsersRound,
  Activity
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ANALYTICS_EVENTS } from '../lib/analyticsTracker';

const themes = [
  { id: 'qinglu', name: '青绿山水', color: '#5cb3b3' },
  { id: 'dansha', name: '朱砂秋色', color: '#d04d55' },
  { id: 'shuimo', name: '水墨丹青', color: '#495057' },
  { id: 'tianqing', name: '天青黛蓝', color: '#519fc6' },
];

const appName = '学而录';
const appIconUrl = `${import.meta.env.BASE_URL}icon.svg`;

export function Layout() {
  const { currentUser, isAdmin, logout, trackAnalyticsEvent } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(() => localStorage.getItem('app-theme') || 'qinglu');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('app-theme', currentTheme);
  }, [currentTheme]);

  useEffect(() => {
    trackAnalyticsEvent(ANALYTICS_EVENTS.PAGE_VIEW, {
      page: location.pathname,
      metadata: { pathname: location.pathname },
    });
  }, [location.pathname, trackAnalyticsEvent]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: "仪表盘", shortLabel: "首页" },
    { to: "/exercises", icon: BookOpenCheck, label: "题目练习", shortLabel: "练习" },
    { to: "/materials", icon: Library, label: "素材积累", shortLabel: "素材" },
    { to: "/summaries", icon: CalendarDays, label: "每日总结", shortLabel: "总结" },
    { to: "/statistics", icon: BarChart3, label: "统计分析" },
    { to: "/admin/analytics", icon: Activity, label: "用户行为", adminOnly: true },
    { to: "/sync", icon: RefreshCcw, label: "数据同步" },
    { to: "/accounts", icon: UsersRound, label: "账户管理" },
    { to: "/trash", icon: Trash2, label: "回收站" },
  ];

  const visibleNavItems = navItems.filter(item => !item.adminOnly || isAdmin);
  const bottomNavItems = visibleNavItems.slice(0, 4);

  return (
    <div className="min-h-screen bg-transparent text-slate-800 font-sans flex overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white/80 backdrop-blur-md border-r border-slate-200/50">
        <div className="h-16 flex items-center px-6 border-b border-slate-200/50">
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-xl">
            <img src={appIconUrl} alt="" className="w-8 h-8 rounded-lg shadow-sm" />
            <span>{appName}</span>
          </div>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors",
                isActive 
                  ? "bg-indigo-50/80 text-indigo-700 font-medium shadow-sm border border-indigo-100/50" 
                  : "text-slate-600 hover:bg-slate-200/50 font-medium"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200/50 relative">
          {showThemePicker && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-white/95 backdrop-blur shadow-lg border border-slate-200/60 rounded-xl p-3 z-50 animate-in slide-in-from-bottom-2">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">主题配色</h4>
              <div className="space-y-1">
                {themes.map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setCurrentTheme(t.id);
                      setShowThemePicker(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors hover:bg-slate-50",
                      currentTheme === t.id ? "bg-indigo-50/50 text-indigo-700 font-medium" : "text-slate-600"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: t.color }} />
                      {t.name}
                    </div>
                    {currentTheme === t.id && <Check className="w-4 h-4 text-indigo-600" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 p-2 bg-slate-100/50 rounded-xl relative group">
            <div className="w-10 h-10 rounded-full bg-indigo-100/80 flex items-center justify-center text-indigo-700 font-bold shadow-sm">
              {currentUser?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900 line-clamp-1">{currentUser?.username}</p>
              <p className="text-xs text-slate-500">备考中</p>
            </div>
            <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-100/50 backdrop-blur pl-2 rounded-lg">
              <button 
                onClick={() => setShowThemePicker(!showThemePicker)}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  showThemePicker ? "bg-indigo-100 text-indigo-700" : "text-slate-400 hover:text-indigo-600 hover:bg-white/80"
                )}
                title="切换主题"
              >
                <Palette className="w-4 h-4" />
              </button>
              <button 
                onClick={handleLogout}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-white/80 rounded-lg transition-colors"
                title="退出登录"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-white/40 backdrop-blur-sm relative">
        {/* Mobile Header */}
        <header className="md:hidden h-[env(safe-area-inset-top,0px)] bg-white/90 backdrop-blur-md pt-[env(safe-area-inset-top,0px)]"></header>
        <header className="md:hidden h-14 bg-white/90 backdrop-blur-md border-b border-slate-200/50 flex items-center justify-center px-4 sticky top-0 z-30">
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-lg">
            <img src={appIconUrl} alt="" className="w-7 h-7 rounded-lg shadow-sm" />
            <span>{appName}</span>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pb-20 md:pb-8">
          <Outlet />
        </div>

        {/* Mobile Bottom Tab Bar */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/50 z-40 pb-[env(safe-area-inset-bottom,0px)]">
          <div className="flex justify-around items-center h-14 px-2">
            {bottomNavItems.map((item) => {
              const isActive = location.pathname === item.to;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                    isActive ? "text-indigo-600" : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  <item.icon className={cn("w-5 h-5", isActive ? "fill-indigo-100/50 stroke-[2.5px]" : "")} />
                  <span className="text-[10px] font-medium">{item.shortLabel}</span>
                </NavLink>
              );
            })}
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className={cn(
                "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors text-slate-500 hover:text-slate-900",
                mobileMenuOpen ? "text-indigo-600" : ""
              )}
            >
              <User className={cn("w-5 h-5", mobileMenuOpen ? "fill-indigo-100/50 stroke-[2.5px]" : "")} />
              <span className="text-[10px] font-medium">我的</span>
            </button>
          </div>
        </div>

        {/* Mobile Menu Drawer (我的) */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in" onClick={() => setMobileMenuOpen(false)}>
            <div 
              className="w-full bg-white rounded-t-3xl overflow-hidden animate-in slide-in-from-bottom flex flex-col max-h-[85vh] pb-[env(safe-area-inset-bottom,20px)]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg shadow-sm">
                    {currentUser?.username?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">{currentUser?.username}</h3>
                    <p className="text-xs text-slate-500">保持专注，坚持不懈</p>
                  </div>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="p-2 bg-slate-50 text-slate-500 rounded-full hover:bg-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto p-2">
                <div className="p-2">
                  <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">更多功能</p>
                  <div className="space-y-1">
                    {visibleNavItems.slice(4).map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) => cn(
                          "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors",
                          isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        <div className="p-1.5 bg-slate-50 rounded-lg">
                          <item.icon className="w-5 h-5" />
                        </div>
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                </div>

                <div className="p-2 border-t border-slate-100">
                  <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">主题配色</p>
                  <div className="flex px-3 gap-4 mb-2">
                    {themes.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setCurrentTheme(t.id)}
                        className="flex flex-col items-center gap-1.5"
                      >
                        <div 
                          className={cn(
                            "w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                            currentTheme === t.id ? "border-indigo-600 scale-110" : "border-slate-200 hover:scale-105"
                          )}
                          style={{ backgroundColor: t.color }}
                        >
                          {currentTheme === t.id && <Check className="w-5 h-5 text-white drop-shadow-md" />}
                        </div>
                        <span className={cn("text-[10px]", currentTheme === t.id ? "text-slate-900 font-medium" : "text-slate-500")}>
                          {t.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 border-t border-slate-100 mt-2">
                  <button 
                    onClick={handleLogout}
                    className="w-full flex justify-center items-center gap-2 py-3.5 bg-red-50 text-red-600 font-medium rounded-xl hover:bg-red-100 transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                    退出登录
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
