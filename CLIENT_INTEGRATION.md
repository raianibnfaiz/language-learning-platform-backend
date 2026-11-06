# Client integration

Both clients keep working offline exactly as today: local state stays the source of the UI, every action
also appends an **op** to an outbox, and a sync loop pushes the outbox to `POST /api/v1/sync`. After each
sync the server's `derived` numbers (xp, level, streak, todayXp, dueCount) replace the local ones.

Shared rules:

- Headers on every call: `X-Client`, `X-App-Version`, `X-Device-Id` (a UUID generated once per install),
  `X-Timezone` (IANA, e.g. `Asia/Dhaka`).
- `opId` = UUID v7 (sorts by time). Toggles are sent as absolute values (`value: true|false`).
- On `401 TOKEN_EXPIRED`: refresh **once** (single-flight) and retry. Any other 401 → signed out.
- On `426 UPGRADE_REQUIRED`: block with a "Please update" screen. Every other error keeps the app usable offline.
- After sign-in from guest mode: `POST /sync/import` once, then load `GET /me/state` into the local stores.

## Web (React + Vite)

`.env`: `VITE_API_URL=/api/v1`, and a dev proxy in `vite.config.ts`:

```ts
server: { proxy: { '/api': 'http://localhost:4000' } }
```

### Fetch wrapper (`src/lib/api.ts`)

```ts
const API = import.meta.env.VITE_API_URL ?? '/api/v1'
const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.0.0'

let accessToken: string | null = null // memory only, never localStorage
export const setAccessToken = (t: string | null) => { accessToken = t }

export const deviceId = (() => {
  const k = 'lingbloomtalk.deviceId'
  let id = localStorage.getItem(k)
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(k, id) }
  return id
})()

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message) }
}

let refreshing: Promise<boolean> | null = null
function refreshOnce(): Promise<boolean> {
  refreshing ??= fetch(`${API}/auth/refresh`, {
    method: 'POST',
    credentials: 'include', // sends the httpOnly lbt_rt cookie
    headers: { 'Content-Type': 'application/json', 'X-Client': 'web', 'X-Requested-With': 'lingbloomtalk', 'X-Device-Id': deviceId },
    body: '{}',
  })
    .then(async (r) => {
      if (!r.ok) { setAccessToken(null); return false }
      setAccessToken((await r.json()).data.accessToken)
      return true
    })
    .finally(() => { refreshing = null })
  return refreshing
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown; idempotencyKey?: string } = {}, retry = true): Promise<{ data: T; meta?: any }> {
  const headers = new Headers(init.headers)
  headers.set('X-Client', 'web')
  headers.set('X-App-Version', APP_VERSION)
  headers.set('X-Device-Id', deviceId)
  headers.set('X-Timezone', Intl.DateTimeFormat().resolvedOptions().timeZone)
  headers.set('X-Requested-With', 'lingbloomtalk')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  if (init.idempotencyKey) headers.set('Idempotency-Key', init.idempotencyKey)
  if (init.json !== undefined) headers.set('Content-Type', 'application/json')

  const res = await fetch(API + path, {
    ...init,
    headers,
    credentials: 'include',
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })
  if (res.status === 204 || res.status === 304) return { data: undefined as T }
  const body = await res.json().catch(() => ({}))
  if (res.ok) return body
  const err = body.error ?? { code: 'INTERNAL', message: res.statusText }
  if (res.status === 401 && err.code === 'TOKEN_EXPIRED' && retry && (await refreshOnce())) return api<T>(path, init, false)
  throw new ApiError(res.status, err.code, err.message, err.details)
}

/** Call on app start: restores the session from the refresh cookie if there is one. */
export const restoreSession = () => refreshOnce()
```

### Outbox + sync loop (`src/lib/sync.ts`)

```ts
import { get, set } from 'idb-keyval'
import { v7 as uuidv7 } from 'uuid'
import { api, deviceId } from './api'

export type Op = { opId: string; type: string; occurredAt: string; localDay: string; payload: unknown }
const KEY = 'lingbloomtalk.outbox'
const localDay = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in the browser's timezone

export async function enqueue(type: string, payload: unknown) {
  const outbox: Op[] = (await get(KEY)) ?? []
  outbox.push({ opId: uuidv7(), type, occurredAt: new Date().toISOString(), localDay: localDay(), payload })
  await set(KEY, outbox)
  scheduleSync()
}

let timer: number | undefined
export function scheduleSync(delay = 2000) {
  clearTimeout(timer)
  timer = window.setTimeout(syncNow, delay)
}

let version = Number(localStorage.getItem('lingbloomtalk.stateVersion') ?? 0)
export async function syncNow(onChanges?: (changes: any, derived: any) => void) {
  const outbox: Op[] = (await get(KEY)) ?? []
  const batch = outbox.slice(0, 500)
  const { data } = await api<any>('/sync', {
    method: 'POST',
    json: { deviceId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, sinceVersion: version, ops: batch },
  })
  const done = new Set(batch.map((o) => o.opId)) // applied, duplicate and rejected all leave the outbox
  await set(KEY, ((await get(KEY)) ?? []).filter((o: Op) => !done.has(o.opId)))
  version = data.stateVersion
  localStorage.setItem('lingbloomtalk.stateVersion', String(version))
  onChanges?.(data.changes, data.derived) // full: true → replace the stores; else patch them
  if (outbox.length > batch.length) scheduleSync(0)
}

window.addEventListener('online', () => scheduleSync(0))
window.addEventListener('focus', () => scheduleSync(0))
setInterval(() => navigator.onLine && scheduleSync(0), 60_000)
```

Mapping the existing provider methods (each still updates local state first, as today):

| provider action | op |
|---|---|
| `markHeard(key)` | `enqueue('phrase.heard', { key })` |
| `toggleFavorite(key)` | `enqueue('phrase.favorite', { key, value: !wasFavorite })` |
| `toggleLesson(id)` | `enqueue('lesson.complete', { lessonId: id, value: !wasDone })` |
| `toggleBookmark(id)` | `enqueue('lesson.bookmark', { lessonId: id, value: !wasBookmarked })` |
| `setNote(key, note)` | `enqueue('phrase.note', { key, note })` |
| test finished | `enqueue('test.recorded', { langId, situationId, test, correct, total, missed, comboBonuses })` |
| review "Got it" / "Again" | `enqueue('review.answer', { key, knewIt })` |
| theme switch | `enqueue('prefs.update', { theme })` |

Guest → account: `await api('/sync/import', { method: 'POST', json: { deviceId, timezone, progress, phrasebook, preferences, voices, isDemoSeed } })`,
then `const { data } = await api('/me/state')` and drop `data.progress` / `data.phrasebook` straight into the
providers (the shapes are identical to the `localStorage` ones). Rename storage keys from `linguawealth.*`
to `lingbloomtalk.*` with a one-time migration that reads the old keys.

## Flutter (dio)

```dart
// lib/data/api/api_client.dart
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_timezone/flutter_timezone.dart';

class ApiClient {
  ApiClient({required this.baseUrl, required this.appVersion, required this.deviceId, required this.platform})
      : dio = Dio(BaseOptions(baseUrl: baseUrl, connectTimeout: const Duration(seconds: 10), receiveTimeout: const Duration(seconds: 20))) {
    dio.interceptors.add(_AuthInterceptor(this));
  }

  final String baseUrl; // e.g. https://api.lingbloomtalk.app/api/v1
  final String appVersion;
  final String deviceId;
  final String platform; // 'ios' | 'android'
  final Dio dio;
  final storage = const FlutterSecureStorage();
  String? accessToken; // memory only

  Future<void> saveTokens(Map<String, dynamic> data) async {
    accessToken = data['accessToken'] as String;
    await storage.write(key: 'lingbloomtalk.refreshToken', value: data['refreshToken'] as String);
  }

  /// Rotates the refresh token. Returns false when the user has to sign in again.
  Future<bool> refresh() async {
    final rt = await storage.read(key: 'lingbloomtalk.refreshToken');
    if (rt == null) return false;
    try {
      final r = await Dio(BaseOptions(baseUrl: baseUrl)).post('/auth/refresh',
          data: {'refreshToken': rt}, options: Options(headers: {'X-Client': platform, 'X-Device-Id': deviceId}));
      await saveTokens(r.data['data'] as Map<String, dynamic>);
      return true;
    } on DioException {
      accessToken = null;
      await storage.delete(key: 'lingbloomtalk.refreshToken');
      return false;
    }
  }
}

/// QueuedInterceptor: parallel 401s wait for ONE refresh, then retry.
class _AuthInterceptor extends QueuedInterceptor {
  _AuthInterceptor(this.api);
  final ApiClient api;

  @override
  Future<void> onRequest(RequestOptions o, RequestInterceptorHandler h) async {
    o.headers['X-Client'] = api.platform;
    o.headers['X-App-Version'] = api.appVersion;
    o.headers['X-Device-Id'] = api.deviceId;
    o.headers['X-Timezone'] = await FlutterTimezone.getLocalTimezone();
    if (api.accessToken != null) o.headers['Authorization'] = 'Bearer ${api.accessToken}';
    h.next(o);
  }

  @override
  Future<void> onError(DioException e, ErrorInterceptorHandler h) async {
    final code = (e.response?.data is Map) ? e.response!.data['error']?['code'] : null;
    if (e.response?.statusCode == 401 && code == 'TOKEN_EXPIRED' && e.requestOptions.extra['retried'] != true) {
      if (await api.refresh()) {
        final o = e.requestOptions..extra['retried'] = true;
        o.headers['Authorization'] = 'Bearer ${api.accessToken}';
        return h.resolve(await api.dio.fetch(o));
      }
    }
    if (e.response?.statusCode == 426) {
      // e.g. ref.read(upgradeRequiredProvider.notifier).state = true; → blocking "Please update" screen
    }
    h.next(e);
  }
}
```

Network retries (exponential backoff) can be added with `dio_smart_retry` for connection errors only, never for 4xx.

### Outbox (Hive) and SyncController (Riverpod)

```dart
// op creation — UUID v7 from package:uuid
final op = {
  'opId': const Uuid().v7(),
  'type': 'phrase.heard',
  'occurredAt': DateTime.now().toUtc().toIso8601String(),
  'localDay': DateFormat('yyyy-MM-dd').format(DateTime.now()),
  'payload': {'key': 'spanish:hello'},
};
await Hive.box('outbox').put(op['opId'], op);

// SyncController.sync()
final box = Hive.box('outbox');
final batch = box.values.take(500).toList();
final r = await api.dio.post('/sync', data: {
  'deviceId': api.deviceId,
  'timezone': await FlutterTimezone.getLocalTimezone(),
  'sinceVersion': prefs.getInt('lingbloomtalk.stateVersion') ?? 0,
  'ops': batch,
});
final data = r.data['data'];
await box.deleteAll(batch.map((o) => o['opId'])); // applied, duplicate and rejected all leave the outbox
await prefs.setInt('lingbloomtalk.stateVersion', data['stateVersion']);
applyChanges(data['changes']); // full == true → replace Hive state; else patch
state = state.copyWith(syncing: false, lastSyncedAt: DateTime.now(), derived: data['derived']);
```

Trigger `sync()` on app resume, when `connectivity_plus` reports a connection, after each test/review
session, every 60 s while foregrounded, and opportunistically from `workmanager` / background fetch.
Voices stay per device: `PUT /me/devices/current { voices }` is a backup only, never applied to another device.
