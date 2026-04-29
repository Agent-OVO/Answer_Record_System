import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, ExerciseRecord, MaterialRecord, DailySummary, BaseRecord } from '../types';
import { generateId } from '../lib/utils';
import { differenceInDays } from 'date-fns';

interface AppContextType {
  currentUser: User | null;
  accounts: AccountSummary[];
  hasAccounts: boolean;
  login: (username: string, password: string, remember: boolean) => Promise<boolean>;
  logout: () => void;
  createAccount: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  updatePassword: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  deleteAccount: (username: string) => { success: boolean; message?: string };
  
  exercises: ExerciseRecord[];
  materials: MaterialRecord[];
  summaries: DailySummary[];
  
  addExercise: (data: Omit<ExerciseRecord, 'id' | 'userId' | 'createdAt'>) => void;
  updateExercise: (id: string, data: Partial<ExerciseRecord>) => void;
  deleteExercise: (id: string) => void; // Soft delete
  
  addMaterial: (data: Omit<MaterialRecord, 'id' | 'userId' | 'createdAt'>) => void;
  updateMaterial: (id: string, data: Partial<MaterialRecord>) => void;
  deleteMaterial: (id: string) => void; // Soft delete
  
  addSummary: (data: Omit<DailySummary, 'id' | 'userId' | 'createdAt'>) => void;
  updateSummary: (id: string, data: Partial<DailySummary>) => void;
  deleteSummary: (id: string) => void; // Soft delete

  restoreRecord: (type: 'exercises' | 'materials' | 'summaries', id: string) => void;
  hardDeleteRecord: (type: 'exercises' | 'materials' | 'summaries', id: string) => void;
  
  importData: (exercises: ExerciseRecord[], materials: MaterialRecord[], summaries: DailySummary[], mode: 'append' | 'overwrite') => void;
}

type LocalAccount = {
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
};

type AccountSummary = {
  username: string;
  createdAt: number;
};

const ACCOUNTS_STORAGE_KEY = 'answerRecordSystem.accounts';
const CURRENT_USER_STORAGE_KEY = 'currentUser';
const HASH_ITERATIONS = 120000;

const readJson = <T,>(storage: Storage, key: string): T | null => {
  try {
    const value = storage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
};

const writeAccounts = (accounts: LocalAccount[]) => {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
};

const getLocalAccounts = () => {
  const savedAccounts = readJson<LocalAccount[]>(localStorage, ACCOUNTS_STORAGE_KEY);
  if (!Array.isArray(savedAccounts)) return [];

  return savedAccounts.filter(account =>
    typeof account.username === 'string'
    && typeof account.passwordHash === 'string'
    && typeof account.salt === 'string'
    && typeof account.createdAt === 'number'
  );
};

const getAccountSummaries = () => {
  return getLocalAccounts().map(({ username, createdAt }) => ({ username, createdAt }));
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const createSalt = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
};

const hashPassword = async (password: string, salt: string) => {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: HASH_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return bytesToBase64(new Uint8Array(bits));
};

const getStoredCurrentUser = () => {
  const accounts = getLocalAccounts();
  const isKnownUser = (user: User | null): user is User =>
    Boolean(user && accounts.some(account => account.username === user.username));

  const saved = readJson<User>(localStorage, CURRENT_USER_STORAGE_KEY);
  if (isKnownUser(saved)) return saved;
  localStorage.removeItem(CURRENT_USER_STORAGE_KEY);

  const sessionSaved = readJson<User>(sessionStorage, CURRENT_USER_STORAGE_KEY);
  if (isKnownUser(sessionSaved)) return sessionSaved;
  sessionStorage.removeItem(CURRENT_USER_STORAGE_KEY);

  return null;
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(getStoredCurrentUser);
  const [accounts, setAccounts] = useState<AccountSummary[]>(getAccountSummaries);

  const [exercises, setExercises] = useState<ExerciseRecord[]>(() => JSON.parse(localStorage.getItem('exercises') || '[]'));
  const [materials, setMaterials] = useState<MaterialRecord[]>(() => JSON.parse(localStorage.getItem('materials') || '[]'));
  const [summaries, setSummaries] = useState<DailySummary[]>(() => JSON.parse(localStorage.getItem('summaries') || '[]'));

  // Cleanup effect for 30-day trash
  useEffect(() => {
    const now = Date.now();
    const isExpired = (deletedAt?: number) => deletedAt && differenceInDays(now, deletedAt) > 30;
    
    setExercises(prev => prev.filter(r => !isExpired(r.deletedAt)));
    setMaterials(prev => prev.filter(r => !isExpired(r.deletedAt)));
    setSummaries(prev => prev.filter(r => !isExpired(r.deletedAt)));
  }, []);

  // Persistence
  useEffect(() => { localStorage.setItem('exercises', JSON.stringify(exercises)); }, [exercises]);
  useEffect(() => { localStorage.setItem('materials', JSON.stringify(materials)); }, [materials]);
  useEffect(() => { localStorage.setItem('summaries', JSON.stringify(summaries)); }, [summaries]);

  const login = async (username: string, password: string, remember: boolean) => {
    const normalizedUsername = username.trim();
    const account = getLocalAccounts().find(localAccount => localAccount.username === normalizedUsername);

    if (account && await hashPassword(password, account.salt) === account.passwordHash) {
      const userObj = { id: account.username, username: account.username };
      setCurrentUser(userObj);
      if (remember) {
        localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(userObj));
        sessionStorage.removeItem(CURRENT_USER_STORAGE_KEY);
      } else {
        sessionStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(userObj));
        localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
      }
      return true;
    }
    return false;
  };

  const createAccount = async (username: string, password: string) => {
    const normalizedUsername = username.trim();
    if (!normalizedUsername) return { success: false, message: '请输入账号名' };
    if (password.length < 6) return { success: false, message: '密码至少需要 6 位' };

    const currentAccounts = getLocalAccounts();
    if (currentAccounts.some(account => account.username === normalizedUsername)) {
      return { success: false, message: '账号已存在' };
    }

    const salt = createSalt();
    const nextAccounts = [
      ...currentAccounts,
      {
        username: normalizedUsername,
        passwordHash: await hashPassword(password, salt),
        salt,
        createdAt: Date.now(),
      },
    ];
    writeAccounts(nextAccounts);
    setAccounts(getAccountSummaries());
    return { success: true };
  };

  const updatePassword = async (username: string, password: string) => {
    if (password.length < 6) return { success: false, message: '密码至少需要 6 位' };

    const currentAccounts = getLocalAccounts();
    const account = currentAccounts.find(item => item.username === username);
    if (!account) return { success: false, message: '账号不存在' };

    const salt = createSalt();
    const passwordHash = await hashPassword(password, salt);
    writeAccounts(currentAccounts.map(item => item.username === username
      ? { ...item, salt, passwordHash }
      : item
    ));
    return { success: true };
  };

  const deleteAccount = (username: string) => {
    const currentAccounts = getLocalAccounts();
    if (currentAccounts.length <= 1) {
      return { success: false, message: '至少需要保留一个账号' };
    }
    if (currentUser?.username === username) {
      return { success: false, message: '不能删除当前登录账号' };
    }

    writeAccounts(currentAccounts.filter(account => account.username !== username));
    setAccounts(getAccountSummaries());
    return { success: true };
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    sessionStorage.removeItem(CURRENT_USER_STORAGE_KEY);
  };

  const addExercise = (data: any) => {
    if (!currentUser) return;
    setExercises(prev => [{ ...data, id: generateId(), userId: currentUser.id, createdAt: Date.now() }, ...prev]);
  };
  const updateExercise = (id: string, data: any) => {
    setExercises(prev => prev.map(e => e.id === id ? { ...e, ...data } : e));
  };
  const deleteExercise = (id: string) => {
    setExercises(prev => prev.map(e => e.id === id ? { ...e, deletedAt: Date.now() } : e));
  };

  const addMaterial = (data: any) => {
    if (!currentUser) return;
    setMaterials(prev => [{ ...data, id: generateId(), userId: currentUser.id, createdAt: Date.now() }, ...prev]);
  };
  const updateMaterial = (id: string, data: any) => {
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, ...data } : m));
  };
  const deleteMaterial = (id: string) => {
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, deletedAt: Date.now() } : m));
  };

  const addSummary = (data: any) => {
    if (!currentUser) return;
    setSummaries(prev => [{ ...data, id: generateId(), userId: currentUser.id, createdAt: Date.now() }, ...prev]);
  };
  const updateSummary = (id: string, data: any) => {
    setSummaries(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
  };
  const deleteSummary = (id: string) => {
    setSummaries(prev => prev.map(s => s.id === id ? { ...s, deletedAt: Date.now() } : s));
  };

  const restoreRecord = (type: string, id: string) => {
    if (type === 'exercises') setExercises(prev => prev.map(e => e.id === id ? { ...e, deletedAt: undefined } : e));
    if (type === 'materials') setMaterials(prev => prev.map(m => m.id === id ? { ...m, deletedAt: undefined } : m));
    if (type === 'summaries') setSummaries(prev => prev.map(s => s.id === id ? { ...s, deletedAt: undefined } : s));
  };

  const hardDeleteRecord = (type: string, id: string) => {
    if (type === 'exercises') setExercises(prev => prev.filter(e => e.id !== id));
    if (type === 'materials') setMaterials(prev => prev.filter(m => m.id !== id));
    if (type === 'summaries') setSummaries(prev => prev.filter(s => s.id !== id));
  };

  const importData = (newExers: ExerciseRecord[], newMats: MaterialRecord[], newSums: DailySummary[], mode: 'append' | 'overwrite') => {
    if (!currentUser) return;
    
    // Auto-assign to current user
    const prepData = <T extends BaseRecord>(data: T[]) => 
      data.map(d => ({ ...d, userId: currentUser.id, id: generateId(), createdAt: Date.now(), deletedAt: undefined }));

    if (mode === 'overwrite') {
      setExercises(prev => [...prev.filter(e => e.userId !== currentUser.id), ...prepData(newExers)]);
      setMaterials(prev => [...prev.filter(m => m.userId !== currentUser.id), ...prepData(newMats)]);
      setSummaries(prev => [...prev.filter(s => s.userId !== currentUser.id), ...prepData(newSums)]);
    } else {
      setExercises(prev => [...prepData(newExers), ...prev]);
      setMaterials(prev => [...prepData(newMats), ...prev]);
      setSummaries(prev => [...prepData(newSums), ...prev]);
    }
  };

  return (
    <AppContext.Provider value={{
      currentUser, accounts, hasAccounts: accounts.length > 0, login, logout, createAccount, updatePassword, deleteAccount,
      exercises, materials, summaries,
      addExercise, updateExercise, deleteExercise,
      addMaterial, updateMaterial, deleteMaterial,
      addSummary, updateSummary, deleteSummary,
      restoreRecord, hardDeleteRecord,
      importData
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
}
