import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { differenceInDays } from 'date-fns';
import { User, ExerciseRecord, MaterialRecord, DailySummary, BaseRecord } from '../types';
import { generateId } from '../lib/utils';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { checkIsAdmin } from '../lib/adminAnalytics';
import {
  ANALYTICS_EVENTS,
  createAnalyticsTracker,
  type AnalyticsEventName,
  type AnalyticsTracker,
  type TrackEventOptions,
} from '../lib/analyticsTracker';
import {
  dailySummaryInputSchema,
  exerciseInputSchema,
  formatZodError,
  materialInputSchema,
  type DailySummaryInput,
  type ExerciseInput,
  type MaterialInput,
} from '../lib/recordSchemas';

type RecordKind = 'exercise' | 'material' | 'summary';

interface AppContextType {
  currentUser: User | null;
  accounts: AccountSummary[];
  hasAccounts: boolean;
  isCloudMode: boolean;
  isAuthLoading: boolean;
  isAdmin: boolean;
  isAdminLoading: boolean;
  trackAnalyticsEvent: (eventName: AnalyticsEventName, options?: TrackEventOptions) => void;
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

  importData: (
    exercises: ExerciseInput[],
    materials: MaterialInput[],
    summaries: DailySummaryInput[],
    mode: 'append' | 'overwrite'
  ) => Promise<{ success: boolean; message: string; backupCreated: boolean }>;
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
const CLOUD_AUTH_EMAIL_DOMAIN = 'answer-record.invalid';

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

const hashText = async (value: string) => {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

const normalizeCloudUsername = (username: string) => username.trim().toLowerCase();

const usernameToCloudEmail = async (username: string) => {
  const hash = await hashText(normalizeCloudUsername(username));
  return `user-${hash}@${CLOUD_AUTH_EMAIL_DOMAIN}`;
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
  const metadataUsername = authUser.user_metadata?.username;
  const username = typeof metadataUsername === 'string' && metadataUsername.trim()
    ? metadataUsername.trim()
    : authUser.email?.endsWith(`@${CLOUD_AUTH_EMAIL_DOMAIN}`)
      ? authUser.id
      : authUser.email || authUser.id;

  return {
    id: authUser.id,
    username,
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

const validateExerciseInputs = (records: ExerciseInput[]) =>
  records.map((record, index) => {
    const result = exerciseInputSchema.safeParse(record);
    if (!result.success) throw new Error(`练习第 ${index + 1} 条：${formatZodError(result.error)}`);
    return result.data;
  });

const validateMaterialInputs = (records: MaterialInput[]) =>
  records.map((record, index) => {
    const result = materialInputSchema.safeParse(record);
    if (!result.success) throw new Error(`素材第 ${index + 1} 条：${formatZodError(result.error)}`);
    return result.data;
  });

const validateSummaryInputs = (records: DailySummaryInput[]) =>
  records.map((record, index) => {
    const result = dailySummaryInputSchema.safeParse(record);
    if (!result.success) throw new Error(`总结第 ${index + 1} 条：${formatZodError(result.error)}`);
    return result.data;
  });

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
  const [isAdmin, setIsAdmin] = useState(!isSupabaseConfigured);
  const [isAdminLoading, setIsAdminLoading] = useState(isSupabaseConfigured);
  const analyticsTrackerRef = useRef<AnalyticsTracker | null>(null);
  const pendingAuthEventRef = useRef<AnalyticsEventName | null>(null);

  const [exercises, setExercises] = useState<ExerciseRecord[]>(() => localArray<ExerciseRecord>('exercises'));
  const [materials, setMaterials] = useState<MaterialRecord[]>(() => localArray<MaterialRecord>('materials'));
  const [summaries, setSummaries] = useState<DailySummary[]>(() => localArray<DailySummary>('summaries'));

  const trackAnalyticsEvent = useCallback((eventName: AnalyticsEventName, options?: TrackEventOptions) => {
    void analyticsTrackerRef.current?.trackEvent(eventName, options);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const previousTracker = analyticsTrackerRef.current;
    analyticsTrackerRef.current = null;

    if (previousTracker) {
      void previousTracker.destroy();
    }

    if (!currentUser) {
      setIsAdmin(false);
      setIsAdminLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const tracker = createAnalyticsTracker({
      userId: currentUser.id,
      appVersion: '0.0.0',
      getPage: () => window.location.hash.replace(/^#/, '') || '/',
    });
    analyticsTrackerRef.current = tracker;
    void tracker.startSession({ username: currentUser.username });

    const pendingAuthEvent = pendingAuthEventRef.current;
    pendingAuthEventRef.current = null;
    if (pendingAuthEvent) {
      void tracker.trackEvent(pendingAuthEvent, {
        metadata: { username: currentUser.username },
        source: 'auth',
      });
    }

    setIsAdminLoading(isSupabaseConfigured);
    if (!isSupabaseConfigured) {
      setIsAdmin(true);
      setIsAdminLoading(false);
    } else {
      checkIsAdmin()
        .then(status => {
          if (isMounted) setIsAdmin(status.isAdmin);
        })
        .catch(error => {
          console.warn('Failed to load admin status', error);
          if (isMounted) setIsAdmin(false);
        })
        .finally(() => {
          if (isMounted) setIsAdminLoading(false);
        });
    }

    return () => {
      isMounted = false;
      if (analyticsTrackerRef.current === tracker) {
        analyticsTrackerRef.current = null;
      }
      void tracker.destroy();
    };
  }, [currentUser?.id, currentUser?.username]);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      trackAnalyticsEvent(ANALYTICS_EVENTS.ERROR, {
        source: 'window_error',
        metadata: {
          errorMessage: event.message,
          filename: event.filename,
          line: event.lineno,
          column: event.colno,
        },
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      trackAnalyticsEvent(ANALYTICS_EVENTS.ERROR, {
        source: 'unhandled_rejection',
        metadata: {
          errorMessage: event.reason instanceof Error ? event.reason.message : String(event.reason),
        },
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, [trackAnalyticsEvent]);

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

    if (error) {
      console.error('Failed to sync cloud record', error);
      void analyticsTrackerRef.current?.trackEvent(ANALYTICS_EVENTS.SYNC_FAILED, {
        source: 'study_records',
        recordType,
        recordId: record.id,
        metadata: { errorMessage: error.message },
      });
      return;
    }

    void analyticsTrackerRef.current?.trackEvent(ANALYTICS_EVENTS.SYNC_SUCCESS, {
      source: 'study_records',
      recordType,
      recordId: record.id,
    });
  }, [currentUser]);

  const deleteCloudRecord = useCallback(async (id: string) => {
    if (!supabase || !currentUser) return;

    const { error } = await supabase
      .from('study_records')
      .delete()
      .eq('id', id)
      .eq('user_id', currentUser.id);

    if (error) {
      console.error('Failed to delete cloud record', error);
      void analyticsTrackerRef.current?.trackEvent(ANALYTICS_EVENTS.SYNC_FAILED, {
        source: 'study_records_delete',
        recordId: id,
        metadata: { errorMessage: error.message },
      });
    }
  }, [currentUser]);

  const syncCloudImport = useCallback(async (
    nextExercises: ExerciseRecord[],
    nextMaterials: MaterialRecord[],
    nextSummaries: DailySummary[],
    mode: 'append' | 'overwrite'
  ) => {
    if (!supabase || !currentUser) return;

    const rows = [
      ...nextExercises.map(record => toCloudRow('exercise', record, currentUser.id)),
      ...nextMaterials.map(record => toCloudRow('material', record, currentUser.id)),
      ...nextSummaries.map(record => toCloudRow('summary', record, currentUser.id)),
    ];

    if (mode === 'overwrite') {
      const { error } = await supabase.rpc('replace_study_records', {
        import_rows: rows,
      });

      if (error) throw error;
      return;
    }

    if (rows.length === 0) return;

    const { error } = await supabase
      .from('study_records')
      .upsert(rows, { onConflict: 'id' });

    if (error) throw error;
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

      const authEmail = await usernameToCloudEmail(normalizedUsername);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });

      if (error) {
        console.error('Supabase login failed', error);
        return false;
      }

      const nextUser = sessionToUser(data.session);
      if (nextUser) {
        pendingAuthEventRef.current = ANALYTICS_EVENTS.LOGIN;
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
      pendingAuthEventRef.current = ANALYTICS_EVENTS.LOGIN;
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
    if (!normalizedUsername) return { success: false, message: isSupabaseConfigured ? '请输入用户名' : '请输入账号名' };
    if (password.length < 6) return { success: false, message: '密码至少需要 6 位' };

    if (isSupabaseConfigured) {
      if (!supabase) return { success: false, message: 'Supabase 未配置' };

      const authEmail = await usernameToCloudEmail(normalizedUsername);
      const { data, error } = await supabase.auth.signUp({
        email: authEmail,
        password,
        options: {
          data: {
            username: normalizedUsername,
            loginName: normalizeCloudUsername(normalizedUsername),
          },
        },
      });

      if (error) return { success: false, message: error.message };
      if (!data.session) {
        return {
          success: false,
          message: '账号已创建，但当前 Supabase 项目仍开启了邮箱确认。请先关闭邮箱确认后再注册或登录。',
        };
      }

      const nextUser = sessionToUser(data.session);
      if (nextUser) {
        pendingAuthEventRef.current = ANALYTICS_EVENTS.LOGIN;
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
    void analyticsTrackerRef.current?.trackEvent(ANALYTICS_EVENTS.LOGOUT, { source: 'auth' });
    void analyticsTrackerRef.current?.endSession({ reason: 'logout' });
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
    void analyticsTrackerRef.current?.recordMutation('create', {
      recordType: 'exercise',
      recordId: nextRecord.id,
      metadata: { date: nextRecord.date, type: nextRecord.type, totalQuestions: nextRecord.totalQuestions },
    });
    void analyticsTrackerRef.current?.trackEvent(ANALYTICS_EVENTS.EXERCISE_SUBMIT, {
      recordType: 'exercise',
      recordId: nextRecord.id,
      metadata: { date: nextRecord.date, type: nextRecord.type },
    });
  };

  const updateExercise = (id: string, data: Partial<ExerciseRecord>) => {
    setExercises(prev => prev.map(record => {
      if (record.id !== id) return record;
      const nextRecord = { ...record, ...data };
      void syncCloudRecord('exercise', nextRecord);
      void analyticsTrackerRef.current?.recordMutation('update', {
        recordType: 'exercise',
        recordId: nextRecord.id,
        metadata: { date: nextRecord.date, type: nextRecord.type },
      });
      return nextRecord;
    }));
  };

  const deleteExercise = (id: string) => {
    setExercises(prev => prev.map(record => {
      if (record.id !== id) return record;
      const nextRecord = { ...record, deletedAt: Date.now() };
      void syncCloudRecord('exercise', nextRecord);
      void analyticsTrackerRef.current?.recordMutation('delete', {
        recordType: 'exercise',
        recordId: nextRecord.id,
        metadata: { date: nextRecord.date, type: nextRecord.type },
      });
      return nextRecord;
    }));
  };

  const addMaterial = (data: Omit<MaterialRecord, 'id' | 'userId' | 'createdAt'>) => {
    if (!currentUser) return;

    const nextRecord = { ...data, id: generateId(), userId: currentUser.id, createdAt: Date.now() } as MaterialRecord;
    setMaterials(prev => [nextRecord, ...prev]);
    void syncCloudRecord('material', nextRecord);
    void analyticsTrackerRef.current?.recordMutation('create', {
      recordType: 'material',
      recordId: nextRecord.id,
      metadata: { date: nextRecord.date, category: nextRecord.category },
    });
  };

  const updateMaterial = (id: string, data: Partial<MaterialRecord>) => {
    setMaterials(prev => prev.map(record => {
      if (record.id !== id) return record;
      const nextRecord = { ...record, ...data };
      void syncCloudRecord('material', nextRecord);
      void analyticsTrackerRef.current?.recordMutation('update', {
        recordType: 'material',
        recordId: nextRecord.id,
        metadata: { date: nextRecord.date, category: nextRecord.category },
      });
      return nextRecord;
    }));
  };

  const deleteMaterial = (id: string) => {
    setMaterials(prev => prev.map(record => {
      if (record.id !== id) return record;
      const nextRecord = { ...record, deletedAt: Date.now() };
      void syncCloudRecord('material', nextRecord);
      void analyticsTrackerRef.current?.recordMutation('delete', {
        recordType: 'material',
        recordId: nextRecord.id,
        metadata: { date: nextRecord.date, category: nextRecord.category },
      });
      return nextRecord;
    }));
  };

  const addSummary = (data: Omit<DailySummary, 'id' | 'userId' | 'createdAt'>) => {
    if (!currentUser) return;

    const nextRecord = { ...data, id: generateId(), userId: currentUser.id, createdAt: Date.now() } as DailySummary;
    setSummaries(prev => [nextRecord, ...prev]);
    void syncCloudRecord('summary', nextRecord);
    void analyticsTrackerRef.current?.recordMutation('create', {
      recordType: 'summary',
      recordId: nextRecord.id,
      metadata: { date: nextRecord.date, contentLength: nextRecord.content.length },
    });
    void analyticsTrackerRef.current?.trackEvent(ANALYTICS_EVENTS.SUMMARY_SAVE, {
      recordType: 'summary',
      recordId: nextRecord.id,
      metadata: { date: nextRecord.date },
    });
  };

  const updateSummary = (id: string, data: Partial<DailySummary>) => {
    setSummaries(prev => prev.map(record => {
      if (record.id !== id) return record;
      const nextRecord = { ...record, ...data };
      void syncCloudRecord('summary', nextRecord);
      void analyticsTrackerRef.current?.recordMutation('update', {
        recordType: 'summary',
        recordId: nextRecord.id,
        metadata: { date: nextRecord.date, contentLength: nextRecord.content.length },
      });
      void analyticsTrackerRef.current?.trackEvent(ANALYTICS_EVENTS.SUMMARY_SAVE, {
        recordType: 'summary',
        recordId: nextRecord.id,
        metadata: { date: nextRecord.date },
      });
      return nextRecord;
    }));
  };

  const deleteSummary = (id: string) => {
    setSummaries(prev => prev.map(record => {
      if (record.id !== id) return record;
      const nextRecord = { ...record, deletedAt: Date.now() };
      void syncCloudRecord('summary', nextRecord);
      void analyticsTrackerRef.current?.recordMutation('delete', {
        recordType: 'summary',
        recordId: nextRecord.id,
        metadata: { date: nextRecord.date },
      });
      return nextRecord;
    }));
  };

  const restoreRecord = (type: string, id: string) => {
    if (type === 'exercises') {
      setExercises(prev => prev.map(record => {
        if (record.id !== id) return record;
        const nextRecord = { ...record, deletedAt: undefined };
        void syncCloudRecord('exercise', nextRecord);
        void analyticsTrackerRef.current?.recordMutation('restore', {
          recordType: 'exercise',
          recordId: nextRecord.id,
          metadata: { date: nextRecord.date, type: nextRecord.type },
        });
        return nextRecord;
      }));
    }
    if (type === 'materials') {
      setMaterials(prev => prev.map(record => {
        if (record.id !== id) return record;
        const nextRecord = { ...record, deletedAt: undefined };
        void syncCloudRecord('material', nextRecord);
        void analyticsTrackerRef.current?.recordMutation('restore', {
          recordType: 'material',
          recordId: nextRecord.id,
          metadata: { date: nextRecord.date, category: nextRecord.category },
        });
        return nextRecord;
      }));
    }
    if (type === 'summaries') {
      setSummaries(prev => prev.map(record => {
        if (record.id !== id) return record;
        const nextRecord = { ...record, deletedAt: undefined };
        void syncCloudRecord('summary', nextRecord);
        void analyticsTrackerRef.current?.recordMutation('restore', {
          recordType: 'summary',
          recordId: nextRecord.id,
          metadata: { date: nextRecord.date },
        });
        return nextRecord;
      }));
    }
  };

  const hardDeleteRecord = (type: string, id: string) => {
    const recordType: RecordKind = type === 'exercises' ? 'exercise' : type === 'materials' ? 'material' : 'summary';
    if (type === 'exercises') setExercises(prev => prev.filter(record => record.id !== id));
    if (type === 'materials') setMaterials(prev => prev.filter(record => record.id !== id));
    if (type === 'summaries') setSummaries(prev => prev.filter(record => record.id !== id));
    void analyticsTrackerRef.current?.recordMutation('delete', {
      recordType,
      recordId: id,
      metadata: { hardDelete: true },
    });
    void deleteCloudRecord(id);
  };

  const importData = async (
    newExers: ExerciseInput[],
    newMats: MaterialInput[],
    newSums: DailySummaryInput[],
    mode: 'append' | 'overwrite'
  ) => {
    if (!currentUser) {
      return {
        success: false,
        message: '请先登录后再导入数据',
        backupCreated: false,
      };
    }

    trackAnalyticsEvent(ANALYTICS_EVENTS.IMPORT_DATA, {
      source: 'data_sync',
      metadata: {
        mode,
        exerciseCount: newExers.length,
        materialCount: newMats.length,
        summaryCount: newSums.length,
      },
    });

    try {
      const validatedExercises = validateExerciseInputs(newExers);
      const validatedMaterials = validateMaterialInputs(newMats);
      const validatedSummaries = validateSummaryInputs(newSums);

      const baseCreatedAt = Date.now();
      let cursor = 0;
      const nextCreatedAt = () => baseCreatedAt + cursor++;

      const prepData = <T extends ExerciseInput | MaterialInput | DailySummaryInput>(data: T[]) =>
        data.map(record => ({
          ...record,
          userId: currentUser.id,
          id: generateId(),
          createdAt: nextCreatedAt(),
          deletedAt: undefined,
        }));

      const preparedExercises = prepData(validatedExercises) as ExerciseRecord[];
      const preparedMaterials = prepData(validatedMaterials) as MaterialRecord[];
      const preparedSummaries = prepData(validatedSummaries) as DailySummary[];

      const nextExercises = sortByCreatedAtDesc(
        mode === 'overwrite'
          ? [...exercises.filter(record => record.userId !== currentUser.id), ...preparedExercises]
          : [...preparedExercises, ...exercises]
      );
      const nextMaterials = sortByCreatedAtDesc(
        mode === 'overwrite'
          ? [...materials.filter(record => record.userId !== currentUser.id), ...preparedMaterials]
          : [...preparedMaterials, ...materials]
      );
      const nextSummaries = sortByCreatedAtDesc(
        mode === 'overwrite'
          ? [...summaries.filter(record => record.userId !== currentUser.id), ...preparedSummaries]
          : [...preparedSummaries, ...summaries]
      );

      if (isSupabaseConfigured) {
        if (!supabase) {
          return {
            success: false,
            message: 'Supabase 未配置完成，无法导入云端数据',
            backupCreated: false,
          };
        }

        trackAnalyticsEvent(ANALYTICS_EVENTS.SYNC_START, {
          source: 'import_data',
          metadata: { mode },
        });
        await syncCloudImport(preparedExercises, preparedMaterials, preparedSummaries, mode);
        await loadCloudRecords(currentUser.id);
        trackAnalyticsEvent(ANALYTICS_EVENTS.SYNC_SUCCESS, {
          source: 'import_data',
          metadata: { mode, recordCount: preparedExercises.length + preparedMaterials.length + preparedSummaries.length },
        });

        return {
          success: true,
          message: mode === 'overwrite'
            ? '覆盖导入完成，云端数据已安全替换'
            : '追加导入完成，云端数据已同步',
          backupCreated: mode === 'overwrite',
        };
      }

      setExercises(nextExercises);
      setMaterials(nextMaterials);
      setSummaries(nextSummaries);

      return {
        success: true,
        message: mode === 'overwrite'
          ? '覆盖导入完成，本地数据已替换'
          : '追加导入完成，本地数据已更新',
        backupCreated: mode === 'overwrite',
      };
    } catch (error) {
      console.error('Failed to import data', error);
      trackAnalyticsEvent(ANALYTICS_EVENTS.SYNC_FAILED, {
        source: 'import_data',
        metadata: { mode, errorMessage: error instanceof Error ? error.message : 'unknown' },
      });

      if (isSupabaseConfigured && currentUser) {
        await loadCloudRecords(currentUser.id);
      }

      return {
        success: false,
        message: error instanceof Error ? error.message : '导入失败，请稍后重试',
        backupCreated: false,
      };
    }
  };

  return (
    <AppContext.Provider value={{
      currentUser,
      accounts,
      hasAccounts: isSupabaseConfigured ? true : accounts.length > 0,
      isCloudMode: isSupabaseConfigured,
      isAuthLoading,
      isAdmin,
      isAdminLoading,
      trackAnalyticsEvent,
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
