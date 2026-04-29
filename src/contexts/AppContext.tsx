import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { differenceInDays } from 'date-fns';
import { User, ExerciseRecord, MaterialRecord, DailySummary, BaseRecord } from '../types';
import { generateId } from '../lib/utils';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

type RecordKind = 'exercise' | 'material' | 'summary';

interface AppContextType {
  currentUser: User | null;
  accounts: AccountSummary[];
  hasAccounts: boolean;
  isCloudMode: boolean;
  isAuthLoading: boolean;
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
  deleteExercise: (id: string) => void;

  addMaterial: (data: Omit<MaterialRecord, 'id' | 'userId' | 'createdAt'>) => void;
  updateMaterial: (id: string, data: Partial<MaterialRecord>) => void;
  deleteMaterial: (id: string) => void;

  addSummary: (data: Omit<DailySummary, 'id' | 'userId' | 'createdAt'>) => void;
  updateSummary: (id: string, data: Partial<DailySummary>) => void;
  deleteSummary: (id: string) => void;

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

type StudyRecordRow = {
  id: string;
  user_id: string;
  record_type: RecordKind;
  record_date: string;
  data: Record<string, unknown>;
  created_at_ms: number | string;
  deleted_at_ms: number | string | null;
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

const localArray = <T,>(key: string) => {
  if (isSupabaseConfigured) return [];
  return readJson<T[]>(localStorage, key) || [];
};

const toNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') return undefined;
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
};

const sessionToUser = (session: Session | null): User | null => {
  const authUser = session?.user;
  if (!authUser) return null;

  return {
    id: authUser.id,
    username: authUser.email || authUser.user_metadata?.username || authUser.id,
  };
};

const rowToRecord = (row: StudyRecordRow) => {
  const base = {
    id: row.id,
    userId: row.user_id,
    date: row.record_date,
    createdAt: toNumber(row.created_at_ms) || Date.now(),
    deletedAt: toNumber(row.deleted_at_ms),
  };

  return {
    ...base,
    ...row.data,
  };
};

const toCloudRow = (recordType: RecordKind, record: BaseRecord, userId: string) => {
  const { id, date, createdAt, deletedAt, userId: _localUserId, ...data } = record as BaseRecord & Record<string, unknown>;
  return {
    id,
    user_id: userId,
    record_type: recordType,
    record_date: date,
    data,
    created_at_ms: createdAt,
    deleted_at_ms: deletedAt ?? null,
  };
};

const upsertRecord = <T extends BaseRecord>(records: T[], next: T) => {
  return records.some(record => record.id === next.id)
    ? records.map(record => record.id === next.id ? next : record)
    : [next, ...records];
};

const sortByCreatedAtDesc = <T extends BaseRecord>(records: T[]) => {
  return [...records].sort((a, b) => b.createdAt - a.createdAt);
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(() => isSupabaseConfigured ? null : getStoredCurrentUser());
  const [accounts, setAccounts] = useState<AccountSummary[]>(() => isSupabaseConfigured ? [] : getAccountSummaries());
  const [isAuthLoading, setIsAuthLoading] = useState(isSupabaseConfigured);

  const [exercises, setExercises] = useState<ExerciseRecord[]>(() => localArray<ExerciseRecord>('exercises'));
  const [materials, setMaterials] = useState<MaterialRecord[]>(() => localArray<MaterialRecord>('materials'));
  const [summaries, setSummaries] = useState<DailySummary[]>(() => localArray<DailySummary>('summaries'));

  const applyCloudRows = useCallback((rows: StudyRecordRow[]) => {
    const nextExercises: ExerciseRecord[] = [];
    const nextMaterials: MaterialRecord[] = [];
    const nextSummaries: DailySummary[] = [];

    rows.forEach(row => {
      if (row.record_type === 'exercise') nextExercises.push(rowToRecord(row) as ExerciseRecord);
      if (row.record_type === 'material') nextMaterials.push(rowToRecord(row) as MaterialRecord);
      if (row.record_type === 'summary') nextSummaries.push(rowToRecord(row) as DailySummary);
    });

    setExercises(sortByCreatedAtDesc(nextExercises));
    setMaterials(sortByCreatedAtDesc(nextMaterials));
    setSummaries(sortByCreatedAtDesc(nextSummaries));
  }, []);

  const upsertCloudRowInState = useCallback((row: StudyRecordRow) => {
    if (row.record_type === 'exercise') {
      setExercises(prev => upsertRecord(prev, rowToRecord(row) as ExerciseRecord));
    }
    if (row.record_type === 'material') {
      setMaterials(prev => upsertRecord(prev, rowToRecord(row) as MaterialRecord));
    }
    if (row.record_type === 'summary') {
      setSummaries(prev => upsertRecord(prev, rowToRecord(row) as DailySummary));
    }
  }, []);

  const removeCloudRowFromState = useCallback((row: Pick<StudyRecordRow, 'id' | 'record_type'>) => {
    if (row.record_type === 'exercise') setExercises(prev => prev.filter(record => record.id !== row.id));
    if (row.record_type === 'material') setMaterials(prev => prev.filter(record => record.id !== row.id));
    if (row.record_type === 'summary') setSummaries(prev => prev.filter(record => record.id !== row.id));
  }, []);

  const loadCloudRecords = useCallback(async (userId: string) => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from('study_records')
      .select('id,user_id,record_type,record_date,data,created_at_ms,deleted_at_ms')
      .eq('user_id', userId)
      .order('created_at_ms', { ascending: false });

    if (error) {
      console.error('Failed to load cloud records', error);
      return;
    }

    applyCloudRows((data || []) as StudyRecordRow[]);
  }, [applyCloudRows]);

  const syncCloudRecord = useCallback(async (recordType: RecordKind, record: BaseRecord) => {
    if (!supabase || !currentUser) return;

    const { error } = await supabase
      .from('study_records')
      .upsert(toCloudRow(recordType, record, currentUser.id), { onConflict: 'id' });

    if (error) console.error('Failed to sync cloud record', error);
  }, [currentUser]);

  const deleteCloudRecord = useCallback(async (id: string) => {
    if (!supabase || !currentUser) return;

    const { error } = await supabase
      .from('study_records')
      .delete()
      .eq('id', id)
      .eq('user_id', currentUser.id);

    if (error) console.error('Failed to delete cloud record', error);
  }, [currentUser]);

  const syncCloudImport = useCallback(async (
    nextExercises: ExerciseRecord[],
    nextMaterials: MaterialRecord[],
    nextSummaries: DailySummary[],
    mode: 'append' | 'overwrite'
  ) => {
    if (!supabase || !currentUser) return;

    if (mode === 'overwrite') {
      const { error } = await supabase
        .from('study_records')
        .delete()
        .eq('user_id', currentUser.id)
        .in('record_type', ['exercise', 'material', 'summary']);

      if (error) {
        console.error('Failed to clear cloud records before import', error);
        return;
      }
    }

    const rows = [
      ...nextExercises.map(record => toCloudRow('exercise', record, currentUser.id)),
      ...nextMaterials.map(record => toCloudRow('material', record, currentUser.id)),
      ...nextSummaries.map(record => toCloudRow('summary', record, currentUser.id)),
    ];

    if (rows.length === 0) return;

    const { error } = await supabase
      .from('study_records')
      .upsert(rows, { onConflict: 'id' });

    if (error) console.error('Failed to import cloud records', error);
  }, [currentUser]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    let isMounted = true;

    const applySession = async (session: Session | null) => {
      const nextUser = sessionToUser(session);
      if (!isMounted) return;

      setCurrentUser(nextUser);
      setAccounts(nextUser ? [{
        username: nextUser.username,
        createdAt: session?.user.created_at ? new Date(session.user.created_at).getTime() : Date.now(),
      }] : []);

      if (nextUser) {
        await loadCloudRecords(nextUser.id);
      } else {
        setExercises([]);
        setMaterials([]);
        setSummaries([]);
      }
    };

    supabase.auth.getSession()
      .then(({ data }) => applySession(data.session))
      .catch(error => console.error('Failed to restore Supabase session', error))
      .finally(() => {
        if (isMounted) setIsAuthLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session);
      setIsAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadCloudRecords]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !currentUser) return;

    const channel = supabase
      .channel(`study-records:${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'study_records',
          filter: `user_id=eq.${currentUser.id}`,
        },
        payload => {
          if (payload.eventType === 'DELETE') {
            removeCloudRowFromState(payload.old as Pick<StudyRecordRow, 'id' | 'record_type'>);
            return;
          }

          upsertCloudRowInState(payload.new as StudyRecordRow);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUser, removeCloudRowFromState, upsertCloudRowInState]);

  useEffect(() => {
    if (isSupabaseConfigured) return;

    const now = Date.now();
    const isExpired = (deletedAt?: number) => deletedAt && differenceInDays(now, deletedAt) > 30;

    setExercises(prev => prev.filter(record => !isExpired(record.deletedAt)));
    setMaterials(prev => prev.filter(record => !isExpired(record.deletedAt)));
    setSummaries(prev => prev.filter(record => !isExpired(record.deletedAt)));
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) localStorage.setItem('exercises', JSON.stringify(exercises));
  }, [exercises]);

  useEffect(() => {
    if (!isSupabaseConfigured) localStorage.setItem('materials', JSON.stringify(materials));
  }, [materials]);

  useEffect(() => {
    if (!isSupabaseConfigured) localStorage.setItem('summaries', JSON.stringify(summaries));
  }, [summaries]);

  const login = async (username: string, password: string, remember: boolean) => {
    const normalizedUsername = username.trim();

    if (isSupabaseConfigured) {
      if (!supabase) return false;

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedUsername,
        password,
      });

      if (error) {
        console.error('Supabase login failed', error);
        return false;
      }

      const nextUser = sessionToUser(data.session);
      if (nextUser) {
        setCurrentUser(nextUser);
        setAccounts([{
          username: nextUser.username,
          createdAt: data.session?.user.created_at ? new Date(data.session.user.created_at).getTime() : Date.now(),
        }]);
        await loadCloudRecords(nextUser.id);
      }

      return true;
    }

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
    if (!normalizedUsername) return { success: false, message: isSupabaseConfigured ? '请输入邮箱' : '请输入账号名' };
    if (password.length < 6) return { success: false, message: '密码至少需要 6 位' };

    if (isSupabaseConfigured) {
      if (!supabase) return { success: false, message: 'Supabase 未配置' };

      const { data, error } = await supabase.auth.signUp({
        email: normalizedUsername,
        password,
        options: {
          data: {
            username: normalizedUsername,
          },
        },
      });

      if (error) return { success: false, message: error.message };
      if (!data.session) {
        return {
          success: false,
          message: '账号已创建。当前 Supabase 项目开启了邮箱确认，请先完成邮箱验证后再登录。',
        };
      }

      const nextUser = sessionToUser(data.session);
      if (nextUser) {
        setCurrentUser(nextUser);
        setAccounts([{
          username: nextUser.username,
          createdAt: data.session.user.created_at ? new Date(data.session.user.created_at).getTime() : Date.now(),
        }]);
        await loadCloudRecords(nextUser.id);
      }

      return { success: true };
    }

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

    if (isSupabaseConfigured) {
      if (!supabase) return { success: false, message: 'Supabase 未配置' };
      if (username !== currentUser?.username) return { success: false, message: '只能修改当前云端账号的密码' };

      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { success: false, message: error.message };
      return { success: true };
    }

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
    if (isSupabaseConfigured) {
      return { success: false, message: '云端账号删除需要在 Supabase 控制台中操作' };
    }

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
    if (isSupabaseConfigured && supabase) {
      setExercises([]);
      setMaterials([]);
      setSummaries([]);
      void supabase.auth.signOut();
    }
  };

  const addExercise = (data: Omit<ExerciseRecord, 'id' | 'userId' | 'createdAt'>) => {
    if (!currentUser) return;

    const nextRecord = { ...data, id: generateId(), userId: currentUser.id, createdAt: Date.now() } as ExerciseRecord;
    setExercises(prev => [nextRecord, ...prev]);
    void syncCloudRecord('exercise', nextRecord);
  };

  const updateExercise = (id: string, data: Partial<ExerciseRecord>) => {
    setExercises(prev => prev.map(record => {
      if (record.id !== id) return record;
      const nextRecord = { ...record, ...data };
      void syncCloudRecord('exercise', nextRecord);
      return nextRecord;
    }));
  };

  const deleteExercise = (id: string) => {
    setExercises(prev => prev.map(record => {
      if (record.id !== id) return record;
      const nextRecord = { ...record, deletedAt: Date.now() };
      void syncCloudRecord('exercise', nextRecord);
      return nextRecord;
    }));
  };

  const addMaterial = (data: Omit<MaterialRecord, 'id' | 'userId' | 'createdAt'>) => {
    if (!currentUser) return;

    const nextRecord = { ...data, id: generateId(), userId: currentUser.id, createdAt: Date.now() } as MaterialRecord;
    setMaterials(prev => [nextRecord, ...prev]);
    void syncCloudRecord('material', nextRecord);
  };

  const updateMaterial = (id: string, data: Partial<MaterialRecord>) => {
    setMaterials(prev => prev.map(record => {
      if (record.id !== id) return record;
      const nextRecord = { ...record, ...data };
      void syncCloudRecord('material', nextRecord);
      return nextRecord;
    }));
  };

  const deleteMaterial = (id: string) => {
    setMaterials(prev => prev.map(record => {
      if (record.id !== id) return record;
      const nextRecord = { ...record, deletedAt: Date.now() };
      void syncCloudRecord('material', nextRecord);
      return nextRecord;
    }));
  };

  const addSummary = (data: Omit<DailySummary, 'id' | 'userId' | 'createdAt'>) => {
    if (!currentUser) return;

    const nextRecord = { ...data, id: generateId(), userId: currentUser.id, createdAt: Date.now() } as DailySummary;
    setSummaries(prev => [nextRecord, ...prev]);
    void syncCloudRecord('summary', nextRecord);
  };

  const updateSummary = (id: string, data: Partial<DailySummary>) => {
    setSummaries(prev => prev.map(record => {
      if (record.id !== id) return record;
      const nextRecord = { ...record, ...data };
      void syncCloudRecord('summary', nextRecord);
      return nextRecord;
    }));
  };

  const deleteSummary = (id: string) => {
    setSummaries(prev => prev.map(record => {
      if (record.id !== id) return record;
      const nextRecord = { ...record, deletedAt: Date.now() };
      void syncCloudRecord('summary', nextRecord);
      return nextRecord;
    }));
  };

  const restoreRecord = (type: string, id: string) => {
    if (type === 'exercises') {
      setExercises(prev => prev.map(record => {
        if (record.id !== id) return record;
        const nextRecord = { ...record, deletedAt: undefined };
        void syncCloudRecord('exercise', nextRecord);
        return nextRecord;
      }));
    }
    if (type === 'materials') {
      setMaterials(prev => prev.map(record => {
        if (record.id !== id) return record;
        const nextRecord = { ...record, deletedAt: undefined };
        void syncCloudRecord('material', nextRecord);
        return nextRecord;
      }));
    }
    if (type === 'summaries') {
      setSummaries(prev => prev.map(record => {
        if (record.id !== id) return record;
        const nextRecord = { ...record, deletedAt: undefined };
        void syncCloudRecord('summary', nextRecord);
        return nextRecord;
      }));
    }
  };

  const hardDeleteRecord = (type: string, id: string) => {
    if (type === 'exercises') setExercises(prev => prev.filter(record => record.id !== id));
    if (type === 'materials') setMaterials(prev => prev.filter(record => record.id !== id));
    if (type === 'summaries') setSummaries(prev => prev.filter(record => record.id !== id));
    void deleteCloudRecord(id);
  };

  const importData = (newExers: ExerciseRecord[], newMats: MaterialRecord[], newSums: DailySummary[], mode: 'append' | 'overwrite') => {
    if (!currentUser) return;

    const prepData = <T extends BaseRecord>(data: T[]) =>
      data.map(record => ({ ...record, userId: currentUser.id, id: generateId(), createdAt: Date.now(), deletedAt: undefined }));

    const preparedExercises = prepData(newExers) as ExerciseRecord[];
    const preparedMaterials = prepData(newMats) as MaterialRecord[];
    const preparedSummaries = prepData(newSums) as DailySummary[];

    if (mode === 'overwrite') {
      setExercises(prev => [...prev.filter(record => record.userId !== currentUser.id), ...preparedExercises]);
      setMaterials(prev => [...prev.filter(record => record.userId !== currentUser.id), ...preparedMaterials]);
      setSummaries(prev => [...prev.filter(record => record.userId !== currentUser.id), ...preparedSummaries]);
    } else {
      setExercises(prev => [...preparedExercises, ...prev]);
      setMaterials(prev => [...preparedMaterials, ...prev]);
      setSummaries(prev => [...preparedSummaries, ...prev]);
    }

    void syncCloudImport(preparedExercises, preparedMaterials, preparedSummaries, mode);
  };

  return (
    <AppContext.Provider value={{
      currentUser,
      accounts,
      hasAccounts: isSupabaseConfigured ? true : accounts.length > 0,
      isCloudMode: isSupabaseConfigured,
      isAuthLoading,
      login,
      logout,
      createAccount,
      updatePassword,
      deleteAccount,
      exercises,
      materials,
      summaries,
      addExercise,
      updateExercise,
      deleteExercise,
      addMaterial,
      updateMaterial,
      deleteMaterial,
      addSummary,
      updateSummary,
      deleteSummary,
      restoreRecord,
      hardDeleteRecord,
      importData,
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
