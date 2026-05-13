import { isSupabaseConfigured, supabase } from './supabase';
import { formatDate, generateId } from './utils';

export const ANALYTICS_EVENTS = {
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
  PAGE_VIEW: 'page_view',
  RECORD_CREATE: 'record_create',
  RECORD_UPDATE: 'record_update',
  RECORD_DELETE: 'record_delete',
  RECORD_RESTORE: 'record_restore',
  EXERCISE_START: 'exercise_start',
  EXERCISE_SUBMIT: 'exercise_submit',
  MATERIAL_OPEN: 'material_open',
  MATERIAL_SEARCH: 'material_search',
  MATERIAL_FILTER_APPLY: 'material_filter_apply',
  SUMMARY_OPEN: 'summary_open',
  SUMMARY_SAVE: 'summary_save',
  IMPORT_DATA: 'import_data',
  EXPORT_DATA: 'export_data',
  SYNC_START: 'sync_start',
  SYNC_SUCCESS: 'sync_success',
  SYNC_FAILED: 'sync_failed',
  LOGIN: 'login',
  LOGOUT: 'logout',
  ERROR: 'error',
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export type AnalyticsMetadata = Record<string, unknown>;

export type AnalyticsRecordType = 'exercise' | 'material' | 'summary';

export type RecordMutationAction = 'create' | 'update' | 'delete' | 'restore';

export interface AnalyticsTrackerOptions {
  userId?: string | null;
  appVersion?: string;
  getPage?: () => string | undefined;
}

export interface TrackEventOptions {
  metadata?: AnalyticsMetadata;
  page?: string;
  source?: string;
  recordType?: AnalyticsRecordType;
  recordId?: string;
}

export interface RecordMutationOptions {
  recordType: AnalyticsRecordType;
  recordId?: string;
  metadata?: AnalyticsMetadata;
  page?: string;
  source?: string;
}

export interface AnalyticsTracker {
  trackEvent: (
    eventName: AnalyticsEventName,
    options?: TrackEventOptions,
  ) => Promise<void>;
  startSession: (metadata?: AnalyticsMetadata) => Promise<string>;
  endSession: (metadata?: AnalyticsMetadata) => Promise<void>;
  recordPageView: (
    page?: string,
    metadata?: AnalyticsMetadata,
  ) => Promise<void>;
  recordMutation: (
    action: RecordMutationAction,
    options: RecordMutationOptions,
  ) => Promise<void>;
  flush: () => Promise<void>;
  getCurrentSessionId: () => string | null;
  destroy: () => Promise<void>;
}

interface AnalyticsEventRow {
  id: string;
  user_id: string;
  event_name: AnalyticsEventName;
  event_time_ms: number;
  local_date: string;
  session_id: string;
  page: string | null;
  source: string;
  record_type: AnalyticsRecordType | null;
  record_id: string | null;
  metadata: AnalyticsMetadata;
  app_version: string | null;
}

interface LearningSessionRow {
  id: string;
  user_id: string;
  started_at_ms: number;
  ended_at_ms: number | null;
  duration_ms: number;
  active_duration_ms: number;
  idle_duration_ms: number;
  page_count: number;
  event_count: number;
  record_count: number;
  completed_record_count: number;
  metadata: AnalyticsMetadata;
  created_at: string;
}

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const FLUSH_DELAY_MS = 1500;
const MAX_EVENT_BUFFER_SIZE = 100;
const ACTIVITY_THROTTLE_MS = 1000;
const DEFAULT_SOURCE = 'frontend';
const ANALYTICS_UNAVAILABLE_STORAGE_KEY = 'analytics_remote_schema_unavailable';

const EVENT_ACTIVITY_NAMES = [
  'pointerdown',
  'keydown',
  'touchstart',
  'scroll',
  'mousemove',
] as const;

const mutationEventByAction: Record<RecordMutationAction, AnalyticsEventName> = {
  create: ANALYTICS_EVENTS.RECORD_CREATE,
  update: ANALYTICS_EVENTS.RECORD_UPDATE,
  delete: ANALYTICS_EVENTS.RECORD_DELETE,
  restore: ANALYTICS_EVENTS.RECORD_RESTORE,
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

let remoteAnalyticsUnavailable =
  typeof sessionStorage !== 'undefined' &&
  sessionStorage.getItem(ANALYTICS_UNAVAILABLE_STORAGE_KEY) === 'true';

function isMissingAnalyticsSchemaError(error: unknown): boolean {
  const record =
    error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const code = typeof record.code === 'string' ? record.code : '';
  const message = typeof record.message === 'string' ? record.message : '';

  return (
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    message.includes('schema cache')
  );
}

function markRemoteAnalyticsUnavailable(): void {
  remoteAnalyticsUnavailable = true;

  try {
    sessionStorage.setItem(ANALYTICS_UNAVAILABLE_STORAGE_KEY, 'true');
  } catch {
    // Session storage is best-effort; in private modes the in-memory flag is enough.
  }
}

export function createAnalyticsTracker({
  userId,
  appVersion,
  getPage,
}: AnalyticsTrackerOptions): AnalyticsTracker {
  let currentSessionId: string | null = null;
  let sessionStartedAtMs = 0;
  let sessionCreatedAtIso = '';
  let lastInteractionAtMs = 0;
  let lastAccountingAtMs = 0;
  let activeDurationMs = 0;
  let idleDurationMs = 0;
  let pageCount = 0;
  let eventCount = 0;
  let recordCount = 0;
  let completedRecordCount = 0;
  let listenersAttached = false;
  let sessionPersisted = false;
  let isEndingSession = false;
  let lastActivityHandledAtMs = 0;
  let flushTimer: number | null = null;
  let idleTimer: number | null = null;
  const eventQueue: AnalyticsEventRow[] = [];

  const resolvePage =
    getPage ??
    (() => {
      if (typeof window === 'undefined') {
        return undefined;
      }

      return `${window.location.pathname}${window.location.search}`;
    });

  function canWriteAnalytics(): boolean {
    return Boolean(
      isSupabaseConfigured &&
      supabase &&
      userId &&
      !remoteAnalyticsUnavailable,
    );
  }

  function getVisibilityState(): DocumentVisibilityState {
    if (typeof document === 'undefined') {
      return 'visible';
    }

    return document.visibilityState;
  }

  function isVisible(): boolean {
    return getVisibilityState() === 'visible';
  }

  function getPageValue(page?: string): string | null {
    return page ?? resolvePage() ?? null;
  }

  function attachListeners(): void {
    if (listenersAttached || typeof window === 'undefined') {
      return;
    }

    const listenerOptions: AddEventListenerOptions = { passive: true };
    EVENT_ACTIVITY_NAMES.forEach((eventName) => {
      window.addEventListener(eventName, handleActivityEvent, listenerOptions);
    });
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    listenersAttached = true;
  }

  function detachListeners(): void {
    if (!listenersAttached || typeof window === 'undefined') {
      return;
    }

    EVENT_ACTIVITY_NAMES.forEach((eventName) => {
      window.removeEventListener(eventName, handleActivityEvent);
    });
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('pagehide', handlePageHide);

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }

    listenersAttached = false;
  }

  function scheduleIdleAccounting(now = Date.now()): void {
    if (idleTimer) {
      window.clearTimeout(idleTimer);
      idleTimer = null;
    }

    if (!currentSessionId || typeof window === 'undefined') {
      return;
    }

    const delay = Math.max(0, lastInteractionAtMs + IDLE_TIMEOUT_MS - now);
    idleTimer = window.setTimeout(() => {
      accountSessionTime(Date.now());
    }, delay);
  }

  function accountSessionTime(now = Date.now()): void {
    if (!currentSessionId || !lastAccountingAtMs || now <= lastAccountingAtMs) {
      return;
    }

    const from = lastAccountingAtMs;
    const to = now;
    const elapsedMs = to - from;
    let activeMs = 0;

    if (isVisible()) {
      const activeUntilMs = lastInteractionAtMs + IDLE_TIMEOUT_MS;

      if (from < activeUntilMs) {
        activeMs = Math.max(0, Math.min(to, activeUntilMs) - from);
      }
    }

    activeDurationMs += activeMs;
    idleDurationMs += Math.max(0, elapsedMs - activeMs);
    lastAccountingAtMs = now;
  }

  function noteActivity(now = Date.now()): void {
    if (!currentSessionId || !isVisible()) {
      return;
    }

    accountSessionTime(now);
    lastInteractionAtMs = now;
    lastAccountingAtMs = now;
    scheduleIdleAccounting(now);
  }

  function handleActivityEvent(): void {
    const now = Date.now();

    if (now - lastActivityHandledAtMs < ACTIVITY_THROTTLE_MS) {
      return;
    }

    lastActivityHandledAtMs = now;
    noteActivity(now);
  }

  function handleVisibilityChange(): void {
    accountSessionTime(Date.now());

    if (isVisible()) {
      noteActivity(Date.now());
      return;
    }

    void flush();
  }

  function handleBeforeUnload(): void {
    endSessionForUnload('beforeunload');
  }

  function handlePageHide(): void {
    endSessionForUnload('pagehide');
  }

  function queueEvent(row: AnalyticsEventRow): void {
    if (!canWriteAnalytics()) {
      return;
    }

    eventQueue.push(row);

    if (eventQueue.length > MAX_EVENT_BUFFER_SIZE) {
      eventQueue.splice(0, eventQueue.length - MAX_EVENT_BUFFER_SIZE);
    }

    scheduleFlush();
  }

  function scheduleFlush(): void {
    if (!canWriteAnalytics() || flushTimer) {
      return;
    }

    if (typeof window === 'undefined') {
      void flush();
      return;
    }

    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      void flush();
    }, FLUSH_DELAY_MS);
  }

  function buildEventRow(
    eventName: AnalyticsEventName,
    options: TrackEventOptions | undefined,
    now: number,
  ): AnalyticsEventRow | null {
    if (!userId || !currentSessionId) {
      return null;
    }

    return {
      id: generateId(),
      user_id: userId,
      event_name: eventName,
      event_time_ms: now,
      local_date: formatDate(new Date(now)),
      session_id: currentSessionId,
      page: getPageValue(options?.page),
      source: options?.source ?? DEFAULT_SOURCE,
      record_type: options?.recordType ?? null,
      record_id: options?.recordId ?? null,
      metadata: normalizeMetadata(options?.metadata),
      app_version: appVersion ?? null,
    };
  }

  function updateCounters(eventName: AnalyticsEventName): void {
    eventCount += 1;

    if (eventName === ANALYTICS_EVENTS.PAGE_VIEW) {
      pageCount += 1;
      return;
    }

    if (
      eventName === ANALYTICS_EVENTS.RECORD_CREATE ||
      eventName === ANALYTICS_EVENTS.RECORD_UPDATE ||
      eventName === ANALYTICS_EVENTS.RECORD_DELETE ||
      eventName === ANALYTICS_EVENTS.RECORD_RESTORE
    ) {
      recordCount += 1;
    }

    if (eventName === ANALYTICS_EVENTS.RECORD_CREATE) {
      completedRecordCount += 1;
    }
  }

  function recordEventInternal(
    eventName: AnalyticsEventName,
    options?: TrackEventOptions,
    now = Date.now(),
  ): void {
    updateCounters(eventName);
    const row = buildEventRow(eventName, options, now);

    if (row) {
      queueEvent(row);
    }
  }

  async function persistSessionSnapshot(
    endedAtMs: number | null,
    metadata?: AnalyticsMetadata,
  ): Promise<void> {
    if (!canWriteAnalytics() || !userId || !currentSessionId) {
      return;
    }

    const row = buildSessionRow(endedAtMs, metadata);

    try {
      const { error } = await supabase!
        .from('learning_sessions')
        .upsert(row, { onConflict: 'id' });

      if (error) {
        throw error;
      }

      sessionPersisted = true;
    } catch (error) {
      if (isMissingAnalyticsSchemaError(error)) {
        markRemoteAnalyticsUnavailable();
        return;
      }

      console.warn('Failed to persist learning session.', error);
    }
  }

  function buildSessionRow(
    endedAtMs: number | null,
    metadata?: AnalyticsMetadata,
  ): LearningSessionRow {
    const now = endedAtMs ?? Date.now();
    const durationMs = Math.max(0, now - sessionStartedAtMs);
    const mergedMetadata: AnalyticsMetadata = {
      ...normalizeMetadata(metadata),
      app_version: appVersion ?? null,
      current_page: getPageValue(),
      idle_timeout_ms: IDLE_TIMEOUT_MS,
      session_persisted: sessionPersisted,
      visibility_state: getVisibilityState(),
    };

    return {
      id: currentSessionId!,
      user_id: userId!,
      started_at_ms: sessionStartedAtMs,
      ended_at_ms: endedAtMs,
      duration_ms: durationMs,
      active_duration_ms: Math.min(activeDurationMs, durationMs),
      idle_duration_ms: Math.min(idleDurationMs, durationMs),
      page_count: pageCount,
      event_count: eventCount,
      record_count: recordCount,
      completed_record_count: completedRecordCount,
      metadata: mergedMetadata,
      created_at: sessionCreatedAtIso,
    };
  }

  function endSessionForUnload(reason: string): void {
    if (!currentSessionId || isEndingSession) {
      return;
    }

    const now = Date.now();
    isEndingSession = true;
    accountSessionTime(now);
    recordEventInternal(
      ANALYTICS_EVENTS.SESSION_END,
      {
        metadata: {
          reason,
          active_duration_ms: activeDurationMs,
          idle_duration_ms: idleDurationMs,
        },
      },
      now,
    );
    flushWithBeacon();
    sendSessionWithBeacon(buildSessionRow(now, { reason }));
    currentSessionId = null;
  }

  async function startSession(metadata?: AnalyticsMetadata): Promise<string> {
    if (currentSessionId) {
      return currentSessionId;
    }

    const now = Date.now();
    currentSessionId = generateId();
    sessionStartedAtMs = now;
    sessionCreatedAtIso = new Date(now).toISOString();
    lastInteractionAtMs = now;
    lastAccountingAtMs = now;
    activeDurationMs = 0;
    idleDurationMs = 0;
    pageCount = 0;
    eventCount = 0;
    recordCount = 0;
    completedRecordCount = 0;
    sessionPersisted = false;
    isEndingSession = false;
    attachListeners();
    scheduleIdleAccounting(now);
    recordEventInternal(ANALYTICS_EVENTS.SESSION_START, { metadata }, now);
    void persistSessionSnapshot(null, metadata);
    return currentSessionId;
  }

  async function trackEvent(
    eventName: AnalyticsEventName,
    options?: TrackEventOptions,
  ): Promise<void> {
    try {
      await startSession();
      const now = Date.now();
      noteActivity(now);
      recordEventInternal(eventName, options, now);
    } catch (error) {
      console.warn('Failed to track analytics event.', error);
    }
  }

  async function endSession(metadata?: AnalyticsMetadata): Promise<void> {
    if (!currentSessionId || isEndingSession) {
      return;
    }

    try {
      const now = Date.now();
      isEndingSession = true;
      accountSessionTime(now);
      recordEventInternal(
        ANALYTICS_EVENTS.SESSION_END,
        {
          metadata: {
            ...normalizeMetadata(metadata),
            active_duration_ms: activeDurationMs,
            idle_duration_ms: idleDurationMs,
          },
        },
        now,
      );
      await flush();
      await persistSessionSnapshot(now, metadata);
    } catch (error) {
      console.warn('Failed to end analytics session.', error);
    } finally {
      currentSessionId = null;
      clearTimers();
      detachListeners();
      isEndingSession = false;
    }
  }

  async function recordPageView(
    page?: string,
    metadata?: AnalyticsMetadata,
  ): Promise<void> {
    await trackEvent(ANALYTICS_EVENTS.PAGE_VIEW, {
      page,
      metadata,
    });
  }

  async function recordMutation(
    action: RecordMutationAction,
    options: RecordMutationOptions,
  ): Promise<void> {
    await trackEvent(mutationEventByAction[action], {
      page: options.page,
      source: options.source,
      recordId: options.recordId,
      recordType: options.recordType,
      metadata: options.metadata,
    });
  }

  async function flush(): Promise<void> {
    if (flushTimer) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
    }

    if (!canWriteAnalytics() || eventQueue.length === 0) {
      eventQueue.length = canWriteAnalytics() ? eventQueue.length : 0;
      return;
    }

    const rows = eventQueue.splice(0, eventQueue.length);

    try {
      const { error } = await supabase!.from('analytics_events').insert(rows);

      if (error) {
        throw error;
      }
    } catch (error) {
      if (isMissingAnalyticsSchemaError(error)) {
        markRemoteAnalyticsUnavailable();
        eventQueue.length = 0;
        return;
      }

      console.warn('Failed to flush analytics events.', error);
      eventQueue.unshift(...rows);

      if (eventQueue.length > MAX_EVENT_BUFFER_SIZE) {
        eventQueue.splice(0, eventQueue.length - MAX_EVENT_BUFFER_SIZE);
      }
    }
  }

  async function destroy(): Promise<void> {
    await endSession({ reason: 'destroy' });
    clearTimers();
    detachListeners();
  }

  function clearTimers(): void {
    if (flushTimer) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
    }

    if (idleTimer) {
      window.clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function flushWithBeacon(): void {
    if (!canWriteAnalytics() || eventQueue.length === 0) {
      eventQueue.length = canWriteAnalytics() ? eventQueue.length : 0;
      return;
    }

    const rows = eventQueue.splice(0, eventQueue.length);

    if (!sendRowsWithKeepalive('analytics_events', rows)) {
      sendRowsWithBeacon('analytics_events', rows);
    }
  }

  return {
    trackEvent,
    startSession,
    endSession,
    recordPageView,
    recordMutation,
    flush,
    getCurrentSessionId: () => currentSessionId,
    destroy,
  };
}

function normalizeMetadata(metadata?: unknown): AnalyticsMetadata {
  if (metadata === undefined) {
    return {};
  }

  if (!isPlainObject(metadata)) {
    console.warn('Analytics metadata must be a plain object.');
    return {};
  }

  try {
    JSON.stringify(metadata);
    return { ...metadata };
  } catch (error) {
    console.warn('Analytics metadata must be JSON serializable.', error);
    return {};
  }
}

function isPlainObject(value: unknown): value is AnalyticsMetadata {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sendSessionWithBeacon(row: LearningSessionRow): void {
  if (!sendRowsWithKeepalive('learning_sessions', row, 'POST')) {
    sendRowsWithBeacon('learning_sessions', [row]);
  }
}

function sendRowsWithKeepalive(
  tableName: string,
  rows: unknown,
  method: 'POST' | 'PATCH' = 'POST',
): boolean {
  if (
    typeof fetch === 'undefined' ||
    !supabaseUrl ||
    !supabaseAnonKey ||
    !isSupabaseConfigured
  ) {
    return false;
  }

  try {
    void fetch(`${supabaseUrl}/rest/v1/${tableName}`, {
      method,
      keepalive: true,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${getStoredAccessToken() ?? supabaseAnonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal,resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    });
    return true;
  } catch (error) {
    console.warn('Failed to send analytics with keepalive fetch.', error);
    return false;
  }
}

function sendRowsWithBeacon(tableName: string, rows: unknown[]): boolean {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.sendBeacon !== 'function' ||
    !supabaseUrl ||
    !supabaseAnonKey ||
    !isSupabaseConfigured
  ) {
    return false;
  }

  try {
    const url = new URL(`${supabaseUrl}/rest/v1/${tableName}`);
    url.searchParams.set('apikey', supabaseAnonKey);
    const payload = new Blob([JSON.stringify(rows)], {
      type: 'application/json',
    });
    return navigator.sendBeacon(url.toString(), payload);
  } catch (error) {
    console.warn('Failed to send analytics with sendBeacon.', error);
    return false;
  }
}

function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined' || !supabaseUrl) {
    return null;
  }

  try {
    const projectRef = new URL(supabaseUrl).host.split('.')[0];
    const preferredKey = `sb-${projectRef}-auth-token`;
    const preferredToken = readAccessTokenFromStorageKey(preferredKey);

    if (preferredToken) {
      return preferredToken;
    }

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (key?.startsWith('sb-') && key.endsWith('-auth-token')) {
        const token = readAccessTokenFromStorageKey(key);

        if (token) {
          return token;
        }
      }
    }
  } catch (error) {
    console.warn('Failed to read Supabase access token.', error);
  }

  return null;
}

function readAccessTokenFromStorageKey(key: string): string | null {
  try {
    const rawValue = window.localStorage.getItem(key);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as { access_token?: unknown };
    return typeof parsedValue.access_token === 'string'
      ? parsedValue.access_token
      : null;
  } catch {
    return null;
  }
}
