/**
 * Quota windows — Host half.
 *
 * Collects the subscription and balance status of every **added** provider
 * whose usage or balance API this plugin implements, and serves one JSON
 * snapshot to the Web page.
 *
 * Discovery is dynamic: the live LLM routes (`llm.listProviders()`) are matched
 * against the adapter registry below. Adding a provider of a supported family
 * in Settings therefore makes its card appear without touching this plugin.
 * Providers with no public usage/balance API are simply not matched.
 *
 * Every lookup is read-only. Provider credentials stay in the Host; the page
 * only receives percentages, amounts, and reset times.
 *
 * Routes:
 *   GET  /quota-windows/api/snapshot[?refresh=1]
 *   GET  /quota-windows/api/client-error
 *   POST /quota-windows/api/client-error
 */
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'quota-windows'
export const inject = ['webServer', 'llm']

/**
 * Optional Loader schema. The vendored schemastery package exists only in a
 * source checkout; when it is absent the plugin still runs with runtime
 * coercion instead of a projected form.
 */
let Config
try {
  const { default: z } = await import('@deepseek-ai/schemastery')
  Config = z.object({
    cacheSeconds: z.number().min(0).default(60),
    opencodeBaseUrl: z.string(),
    opencodeCredentialRef: z.string(),
    claudeCredentialsPath: z.string(),
    allowedHosts: z.array(z.string()).default([]),
  })
} catch {
  // No source checkout: keep runtime coercion only.
}
export { Config }

const SNAPSHOT_PATH = '/quota-windows/api/snapshot'
const CLIENT_ERROR_PATH = '/quota-windows/api/client-error'
const OPENCODE_DEFAULT_BASE = 'https://opencode.ai/zen/go/v1'
const OPENCODE_WINDOWS = ['rolling', 'weekly', 'monthly']
const CLAUDE_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const CLAUDE_KEYCHAIN_SERVICE = 'Claude Code-credentials'
const CLAUDE_BETA = 'oauth-2025-04-20'
const OPENROUTER_CREDITS_URL = 'https://openrouter.ai/api/v1/credits'
const MOONSHOT_DEFAULT_BASE = 'https://api.moonshot.ai/v1'
const MOONSHOT_CN_DEFAULT_BASE = 'https://api.moonshot.cn/v1'
const ZAI_GLOBAL_ORIGIN = 'https://api.z.ai'
const ZAI_CN_ORIGIN = 'https://open.bigmodel.cn'
const MINIMAX_GLOBAL_URL = 'https://www.minimax.io/v1/token_plan/remains'
const MINIMAX_CN_URL = 'https://api.minimaxi.com/v1/token_plan/remains'
const ZAI_UNIT_MINUTES = { 1: 1440, 3: 60, 5: 1, 6: 10080 }
const DEFAULT_CACHE_SECONDS = 60
const REQUEST_TIMEOUT_MS = 15_000
const SOURCE_TIMEOUT_MS = 3_000
const ERROR_CACHE_MS = 15_000
/** Header-only client identity for the account platform query. */
const ACCOUNT_CLIENT = {
  version: '1.0.0',
  locale: typeof Intl === 'object' ? Intl.DateTimeFormat().resolvedOptions().locale : 'zh-CN',
  timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
}

/**
 * Adapter registry. Each entry owns one provider family: `matches` decides
 * whether a live route belongs to it, `read` fetches its usage or balance.
 * `standalone` adapters are also shown when their own credential exists even
 * though no DSH route of that family is live (Claude Code, DeepSeek account).
 */
const ADAPTERS = [
  {
    id: 'opencode',
    kind: 'subscription',
    name: 'OpenCode',
    // Only Go routes expose /usage; the plain `opencode` route is Zen and has
    // a different API, so matching it would produce a false error card.
    matches: id => id === 'opencode-go' || id.startsWith('opencode-go'),
    read: readOpenCode,
  },
  {
    id: 'claude',
    kind: 'subscription',
    name: 'Claude',
    matches: id => id === 'anthropic',
    standalone: true,
    available: async (ctx, config, memo) => (await readClaudeToken(config, memo)) !== undefined,
    read: readClaude,
  },
  {
    id: 'deepseek',
    kind: 'balance',
    name: 'DeepSeek',
    matches: id => id === 'deepseek' || id === 'deepseek-official' || id === 'deepseek-account',
    standalone: true,
    available: async (ctx, config, memo) => {
      const state = await deepseekState(ctx, memo)
      return state?.status === 'credential-stored'
    },
    read: readDeepSeek,
  },
  {
    id: 'openrouter',
    kind: 'balance',
    name: 'OpenRouter',
    matches: id => id === 'openrouter',
    read: readOpenRouter,
  },
  {
    id: 'moonshot',
    kind: 'balance',
    name: 'Moonshot',
    matches: id => id === 'moonshotai' || id === 'moonshotai-cn',
    read: readMoonshot,
  },
  {
    id: 'zai',
    kind: 'subscription',
    name: 'Z.ai',
    matches: id => id === 'zai' || id === 'zai-coding-cn',
    read: readZai,
  },
  {
    id: 'minimax',
    kind: 'subscription',
    name: 'MiniMax',
    matches: id => id === 'minimax' || id === 'minimax-cn',
    read: readMiniMax,
  },
]

/** Last provider result, keyed by adapter id. */
const cache = new Map()
/** Most recent render crash reported by the Web page. */
let lastClientError = null
let lastClientErrorAt = 0

function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function seconds(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

/** Parse a numeric field, treating null/undefined/'' as absent rather than zero. */
export function numeric(value) {
  if (value === null || value === undefined || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

/** Accept an HTTPS base URL, or HTTP only for a loopback proxy. */
function safeBaseURL(value) {
  const candidate = text(value)
  if (candidate === undefined) return undefined
  try {
    const url = new URL(candidate)
    if (url.protocol === 'https:') return url.toString().replace(/\/+$/, '')
    if (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) {
      return url.toString().replace(/\/+$/, '')
    }
  } catch {
    // Not a URL.
  }
  return undefined
}

/** Known credential names that do not follow the `<ROUTE>_API_KEY` convention. */
const CONVENTIONAL_REFS = {
  zai: 'Z_AI_API_KEY',
  'zai-coding-cn': 'Z_AI_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  'minimax-cn': 'MINIMAX_CN_API_KEY',
  moonshotai: 'MOONSHOT_API_KEY',
  'moonshotai-cn': 'MOONSHOT_API_KEY',
}

function conventionalRef(providerId) {
  return CONVENTIONAL_REFS[providerId] ?? `${providerId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}

function windowEntry(id, raw, percentKey) {
  const percent = numeric(raw?.[percentKey])
  if (percent === undefined) return undefined
  return {
    id,
    percent: Math.max(0, Math.min(100, percent)),
    resetsAt: text(raw.resetsAt) ?? text(raw.resets_at) ?? null,
  }
}

async function readJson(response) {
  const body = await response.text()
  try {
    return JSON.parse(body)
  } catch {
    throw new Error(`unexpected response (${response.status})`)
  }
}

/** Reject after `ms`, leaving the underlying request to its own timeout. */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

/** Run one short-lived local command and resolve its stdout. */
function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 1_500, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })
}

async function loadClaudeToken(config) {
  const candidates = []
  if (process.platform === 'darwin') {
    candidates.push(async () => JSON.parse(await run('security', ['find-generic-password', '-s', CLAUDE_KEYCHAIN_SERVICE, '-w'])))
  }
  const file = text(config?.claudeCredentialsPath) ?? join(homedir(), '.claude', '.credentials.json')
  candidates.push(async () => JSON.parse(await readFile(file, 'utf8')))
  for (const read of candidates) {
    try {
      const stored = await read()
      const token = text(stored?.claudeAiOauth?.accessToken)
      if (token !== undefined) {
        return { token, plan: text(stored?.claudeAiOauth?.subscriptionType) }
      }
    } catch {
      // Try the next storage location.
    }
  }
  return undefined
}

/** Read the Claude OAuth token once per collect. */
async function readClaudeToken(config, memo) {
  if (memo !== undefined && memo.claudeToken !== undefined) return memo.claudeToken
  const pending = loadClaudeToken(config)
  if (memo !== undefined) memo.claudeToken = pending
  return pending
}

/** Live provider routes, or an empty list when the registry is unavailable. */
function liveProviders(ctx) {
  try {
    return ctx.llm.listProviders()
  } catch {
    return []
  }
}

/** Configurable-provider directory keyed by route id. */
function providerDirectory(ctx) {
  try {
    return new Map(ctx.llm.listConfigurableProviders().map(entry => [entry.provider, entry]))
  } catch {
    return new Map()
  }
}

function profileAt(value, path) {
  let current = value
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = current[key]
  }
  return current !== null && typeof current === 'object' ? current : undefined
}

/** Directory entries whose settings profile exists — i.e. providers the user added. */
function configuredProviders(directory, settings) {
  const rows = []
  for (const entry of directory.values()) {
    if (entry.settingsNs === '') continue
    if (profileAt(settings.get(entry.settingsNs), entry.settingsPath) === undefined) continue
    rows.push({ id: entry.provider })
  }
  return rows
}

/** Project every settings namespace once per collect (secrets redacted). */
function settingsSnapshot(ctx) {
  const settings = ctx.get('settings')
  if (settings === undefined) return new Map()
  try {
    return new Map(settings.describe({ redactSecrets: true }).map(item => [item.ns, item.value]))
  } catch {
    return new Map()
  }
}

/** Resolve one provider's settings profile, key reference, key, and base URL. */
async function providerInfo(ctx, providerId, directory, settings, refOverride) {
  const entry = directory.get(providerId)
  let profile
  if (entry !== undefined && entry.settingsNs !== '') {
    let value = settings.get(entry.settingsNs)
    for (const key of entry.settingsPath) {
      if (value === null || typeof value !== 'object') {
        value = undefined
        break
      }
      value = value[key]
    }
    if (value !== null && typeof value === 'object') profile = value
  }
  const named = profile !== undefined && typeof profile.apiKeyEnv === 'string' ? text(profile.apiKeyEnv) : undefined
  const ref = refOverride ?? named ?? conventionalRef(providerId)
  const credentials = ctx.get('credentials')
  const resolved = credentials === undefined ? undefined : await credentials.resolve(ref).catch(() => undefined)
  const baseURL = safeBaseURL(profile?.baseURL)
    ?? safeBaseURL(entry !== undefined && typeof entry.defaultBaseURL === 'string' ? entry.defaultBaseURL : undefined)
  return { key: text(resolved?.value), baseURL }
}

/** First matched route with a resolvable credential. */
async function firstWithKey(ctx, matched, directory, settings) {
  for (const provider of matched) {
    const info = await providerInfo(ctx, provider.id, directory, settings)
    if (info.key !== undefined) return { provider, info }
  }
  return undefined
}

/** Account state, memoized for one collect so standalone detection and read share it. */
async function deepseekState(ctx, memo) {
  if (memo !== undefined && memo.deepseekState !== undefined) return memo.deepseekState
  const account = ctx.get('deepseekAccount')
  const pending = account === undefined ? Promise.resolve(undefined) : account.getState().catch(() => undefined)
  if (memo !== undefined) memo.deepseekState = pending
  return pending
}

async function readOpenCode(ctx, config, { matched, directory, settings }) {
  const source = { id: 'opencode', kind: 'subscription', name: 'OpenCode', windows: [] }
  let lastError
  for (const provider of matched) {
    const info = await providerInfo(ctx, provider.id, directory, settings, text(config?.opencodeCredentialRef))
    if (info.key === undefined) continue
    const configured = safeBaseURL(text(config?.opencodeBaseUrl))
    const base = (configured ?? info.baseURL ?? OPENCODE_DEFAULT_BASE).replace(/\/+$/, '')
    const response = await fetch(`${base}/usage`, {
      headers: { authorization: `Bearer ${info.key}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) {
      lastError = `HTTP ${response.status}`
      continue
    }
    const body = await readJson(response)
    const usage = body?.usage ?? body
    const windows = []
    for (const id of OPENCODE_WINDOWS) {
      const entry = windowEntry(id, usage?.[id], 'percent')
      if (entry !== undefined) windows.push(entry)
    }
    if (windows.length === 0) {
      lastError = 'no usage windows in the response'
      continue
    }
    return { ...source, status: 'ok', windows }
  }
  if (lastError !== undefined) return { ...source, status: 'error', message: lastError }
  return { ...source, status: 'unconfigured', reason: 'no-credential' }
}

async function readClaude(_ctx, config, { memo }) {
  const source = { id: 'claude', kind: 'subscription', name: 'Claude', windows: [] }
  const stored = await readClaudeToken(config, memo)
  if (stored === undefined) return { ...source, status: 'unconfigured', reason: 'claude-sign-in' }
  const response = await fetch(CLAUDE_USAGE_URL, {
    headers: {
      authorization: `Bearer ${stored.token}`,
      'anthropic-beta': CLAUDE_BETA,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (response.status === 401 || response.status === 403) {
    return { ...source, status: 'error', message: 'credential expired; sign in to Claude Code again' }
  }
  if (!response.ok) return { ...source, status: 'error', message: `HTTP ${response.status}` }
  const body = await readJson(response)
  const windows = []
  for (const id of ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet']) {
    const entry = windowEntry(id, body?.[id], 'utilization')
    if (entry !== undefined) windows.push(entry)
  }
  const extra = body?.extra_usage
  const extraPercent = numeric(extra?.utilization)
  if (extra?.is_enabled === true && extraPercent !== undefined) {
    windows.push({ id: 'extra', percent: Math.max(0, Math.min(100, extraPercent)), resetsAt: null })
  }
  if (windows.length === 0) return { ...source, status: 'error', message: 'no usage windows in the response' }
  return { ...source, status: 'ok', windows, plan: stored.plan ?? null }
}

async function readDeepSeek(ctx, _config, { memo }) {
  const source = { id: 'deepseek', kind: 'balance', name: 'DeepSeek', wallets: [], bonusWallets: [] }
  const account = ctx.get('deepseekAccount')
  if (account === undefined) return { ...source, status: 'unconfigured', reason: 'deepseek-sign-in' }
  const state = await deepseekState(ctx, memo)
  if (state?.status !== 'credential-stored') return { ...source, status: 'unconfigured', reason: 'deepseek-sign-in' }
  const [profile, balance] = await Promise.all([
    account.getProfile(ACCOUNT_CLIENT).catch(() => null),
    account.getBalance(ACCOUNT_CLIENT),
  ])
  if (balance === null) return { ...source, status: 'unconfigured', reason: 'deepseek-sign-in' }
  if (balance.status === 'failed') {
    return { ...source, status: 'error', message: 'balance query failed' }
  }
  return {
    ...source,
    status: 'ok',
    profile: profile?.status === 'ready' ? profile.value : null,
    wallets: balance.value,
    bonusWallets: balance.bonusWallets,
  }
}

export async function readOpenRouter(ctx, _config, { matched, directory, settings }) {
  const source = { id: 'openrouter', kind: 'balance', name: 'OpenRouter', wallets: [], bonusWallets: [] }
  const candidate = await firstWithKey(ctx, matched, directory, settings)
  if (candidate === undefined) return { ...source, status: 'unconfigured', reason: 'no-credential' }
  const { info } = candidate
  const response = await fetch(OPENROUTER_CREDITS_URL, {
    headers: { authorization: `Bearer ${info.key}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) return { ...source, status: 'error', message: `HTTP ${response.status}` }
  const body = await readJson(response)
  const total = numeric(body?.data?.total_credits)
  const used = numeric(body?.data?.total_usage)
  if (total === undefined) return { ...source, status: 'error', message: 'no credits in the response' }
  const remaining = Math.max(0, total - (used ?? 0))
  return { ...source, status: 'ok', wallets: [{ currency: 'USD', balance: remaining.toFixed(2) }] }
}

export async function readMoonshot(ctx, _config, { matched, directory, settings }) {
  const source = { id: 'moonshot', kind: 'balance', name: 'Moonshot', wallets: [], bonusWallets: [] }
  const candidate = await firstWithKey(ctx, matched, directory, settings)
  if (candidate === undefined) return { ...source, status: 'unconfigured', reason: 'no-credential' }
  const { provider, info } = candidate
  const fallback = provider.id === 'moonshotai-cn' ? MOONSHOT_CN_DEFAULT_BASE : MOONSHOT_DEFAULT_BASE
  const base = (info.baseURL ?? fallback).replace(/\/+$/, '')
  const response = await fetch(`${base}/users/me/balance`, {
    headers: { authorization: `Bearer ${info.key}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) return { ...source, status: 'error', message: `HTTP ${response.status}` }
  const body = await readJson(response)
  const data = body?.data ?? body
  const availableRaw = data?.available_balance
  const voucherRaw = data?.voucher_balance
  const available = numeric(availableRaw)
  const voucher = numeric(voucherRaw)
  if (available === undefined) return { ...source, status: 'error', message: 'no balance in the response' }
  return {
    ...source,
    status: 'ok',
    wallets: [{ currency: 'CNY', balance: typeof availableRaw === 'string' ? availableRaw : String(available) }],
    bonusWallets: voucher !== undefined && voucher !== 0
      ? [{ currency: 'CNY', balance: typeof voucherRaw === 'string' ? voucherRaw : String(voucher) }]
      : [],
  }
}

export function zaiWindowMinutes(raw) {
  const number = numeric(raw?.number)
  if (number === undefined || number <= 0 || !Number.isInteger(number)) return undefined
  const multiplier = ZAI_UNIT_MINUTES[raw.unit]
  return multiplier === undefined ? undefined : number * multiplier
}

export function zaiPercent(raw) {
  let percent = numeric(raw?.percentage)
  const usage = numeric(raw?.usage)
  const current = numeric(raw?.currentValue)
  const remaining = numeric(raw?.remaining)
  if (usage !== undefined && usage > 0) {
    let used
    if (remaining !== undefined) used = Math.max(usage - remaining, current ?? usage - remaining)
    else if (current !== undefined) used = current
    if (used !== undefined) percent = (Math.max(0, Math.min(usage, used)) / usage) * 100
  }
  if (percent === undefined) return undefined
  return Math.max(0, Math.min(100, percent))
}

export function zaiReset(value) {
  const number = numeric(value)
  if (number === undefined || number <= 0) return null
  return new Date(number < 1e12 ? number * 1000 : number).toISOString()
}

export async function readZai(ctx, _config, { matched, directory, settings }) {
  const source = { id: 'zai', kind: 'subscription', name: 'Z.ai', windows: [] }
  const candidate = await firstWithKey(ctx, matched, directory, settings)
  if (candidate === undefined) return { ...source, status: 'unconfigured', reason: 'no-credential' }
  const { provider, info } = candidate
  let origin = provider.id === 'zai-coding-cn' ? ZAI_CN_ORIGIN : ZAI_GLOBAL_ORIGIN
  if (info.baseURL !== undefined) {
    try {
      origin = new URL(info.baseURL).origin
    } catch {
      // Keep the region default.
    }
  }
  const response = await fetch(`${origin}/api/monitor/usage/quota/limit`, {
    headers: { authorization: `Bearer ${info.key}`, accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) return { ...source, status: 'error', message: `HTTP ${response.status}` }
  const body = await readJson(response)
  const data = body?.data
  if (data === null || typeof data !== 'object' || !Array.isArray(data.limits)) {
    return { ...source, status: 'unconfigured', reason: 'no-plan' }
  }
  const windows = []
  for (const raw of data.limits) {
    if (raw === null || typeof raw !== 'object') continue
    if (raw.type !== 'TOKENS_LIMIT' && raw.type !== 'CREDIT_LIMIT') continue
    const percent = zaiPercent(raw)
    if (percent === undefined) continue
    const minutes = zaiWindowMinutes(raw)
    windows.push({
      id: `zai-${windows.length}`,
      percent,
      resetsAt: zaiReset(raw.nextResetTime),
      ...(minutes === undefined ? {} : { minutes }),
    })
  }
  if (windows.length === 0) return { ...source, status: 'unconfigured', reason: 'no-plan' }
  const plan = [data.planName, data.plan, data.plan_type, data.packageName, data.level]
    .find(value => typeof value === 'string' && value.trim() !== '')
  return { ...source, status: 'ok', windows, plan: plan ?? null }
}

export function minimaxPercent(row) {
  const total = numeric(row?.current_interval_total_count)
  const explicitUsed = numeric(row?.current_interval_used_count)
  const usage = numeric(row?.current_interval_usage_count)
  const remainingAlias = numeric(row?.current_interval_remaining_count ?? row?.current_interval_remains_count)
  const remainingPercent = numeric(row?.current_interval_remaining_percent)
  if (total !== undefined && total > 0) {
    if (explicitUsed !== undefined) return Math.max(0, Math.min(100, (explicitUsed / total) * 100))
    // The remains API reports current_interval_usage_count as the remaining count.
    const remaining = remainingAlias ?? usage
    if (remaining !== undefined) return Math.max(0, Math.min(100, ((total - remaining) / total) * 100))
  }
  if (remainingPercent !== undefined) return Math.max(0, Math.min(100, 100 - remainingPercent))
  return undefined
}

export function minimaxReset(row) {
  const end = numeric(row?.end_time)
  if (end !== undefined && end > 0) return new Date(end < 1e12 ? end * 1000 : end).toISOString()
  const remains = numeric(row?.remains_time)
  if (remains !== undefined && remains > 0) return new Date(Date.now() + remains).toISOString()
  return null
}

export async function readMiniMax(ctx, _config, { matched, directory, settings }) {
  const source = { id: 'minimax', kind: 'subscription', name: 'MiniMax', windows: [] }
  const candidate = await firstWithKey(ctx, matched, directory, settings)
  if (candidate === undefined) return { ...source, status: 'unconfigured', reason: 'no-credential' }
  const { provider, info } = candidate
  const url = provider.id === 'minimax-cn' ? MINIMAX_CN_URL : MINIMAX_GLOBAL_URL
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${info.key}`, accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) return { ...source, status: 'error', message: `HTTP ${response.status}` }
  const body = await readJson(response)
  const root = body?.data ?? body
  const status = numeric(root?.base_resp?.status_code) ?? 0
  if (status !== 0) {
    return { ...source, status: 'error', message: text(root?.base_resp?.status_msg) ?? `status ${status}` }
  }
  const row = Array.isArray(root?.model_remains) ? root.model_remains[0] : undefined
  if (row === undefined) return { ...source, status: 'unconfigured', reason: 'no-plan' }
  const percent = minimaxPercent(row)
  if (percent === undefined) return { ...source, status: 'unconfigured', reason: 'no-plan' }
  const plan = [row.current_subscribe_title, row.plan_name, row.plan]
    .find(value => typeof value === 'string' && value.trim() !== '')
  return {
    ...source,
    status: 'ok',
    plan: plan ?? null,
    windows: [{ id: 'session', percent, resetsAt: minimaxReset(row) }],
  }
}

async function snapshotOf(id, kind, force, ttlMs, load) {
  const hit = cache.get(id)
  const now = Date.now()
  if (!force && hit !== undefined && now < hit.expiresAt) return hit.value
  let value
  try {
    value = await load()
  } catch (error) {
    value = {
      id,
      kind,
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      windows: [],
      wallets: [],
      bonusWallets: [],
    }
  }
  const lifetime = value.status === 'ok' ? ttlMs : Math.min(ttlMs, ERROR_CACHE_MS)
  cache.set(id, { value, expiresAt: Date.now() + lifetime })
  return value
}

/** Match live routes against the adapter registry and read each match once. */
async function collect(ctx, config, force) {
  const ttlMs = seconds(config?.cacheSeconds, DEFAULT_CACHE_SECONDS) * 1000
  const directory = providerDirectory(ctx)
  const settings = settingsSnapshot(ctx)
  const byId = new Map()
  for (const provider of liveProviders(ctx)) byId.set(provider.id, provider)
  for (const provider of configuredProviders(directory, settings)) {
    if (!byId.has(provider.id)) byId.set(provider.id, provider)
  }
  const providers = [...byId.values()]
  const memo = {}
  const selected = []
  for (const adapter of ADAPTERS) {
    const matched = providers.filter(provider => adapter.matches(provider.id))
    if (matched.length > 0) {
      selected.push({ adapter, matched })
      continue
    }
    if (adapter.standalone === true && adapter.available !== undefined) {
      const available = await adapter.available(ctx, config, memo).catch(() => false)
      if (available === true) selected.push({ adapter, matched: [] })
    }
  }
  const sources = await Promise.all(selected.map(({ adapter, matched }) =>
    snapshotOf(adapter.id, adapter.kind, force, ttlMs, () =>
      withTimeout(adapter.read(ctx, config, { matched, directory, settings, memo }), SOURCE_TIMEOUT_MS))))
  return { fetchedAt: new Date().toISOString(), sources }
}

function hostName(host) {
  if (host.startsWith('[')) {
    const end = host.indexOf(']')
    return end === -1 ? host : host.slice(1, end)
  }
  return host.split(':')[0]
}

function isIpHost(name) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(name) || name.includes(':')
}

/**
 * Reject cross-origin and DNS-rebinding requests. The page is same-origin, so
 * its Host is loopback, an IP literal, or the advertised origin; a rebound
 * attacker domain matches none of those.
 */
function allowedHosts(config) {
  const value = Array.isArray(config?.allowedHosts) ? config.allowedHosts : []
  return value
    .filter(item => typeof item === 'string' && item.trim() !== '')
    .map(item => item.trim().toLowerCase())
}

export function trusted(ctx, req, config) {
  const host = req.headers.host
  if (typeof host !== 'string' || host === '') return false
  const origin = req.headers.origin
  if (origin !== undefined) {
    try {
      if (new URL(origin).host !== host) return false
    } catch {
      return false
    }
  }
  if (allowedHosts(config).includes(host.toLowerCase())) return true
  const name = hostName(host)
  if (name === '127.0.0.1' || name === 'localhost' || name === '::1') return true
  if (isIpHost(name)) return true
  try {
    return host === new URL(ctx.webServer.getOrigin()).host
  } catch {
    return false
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

export function apply(ctx, config) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: CLIENT_ERROR_PATH,
    handler: async (req, res) => {
      if (!trusted(ctx, req, config)) {
        sendJson(res, 403, { error: 'cross-origin request rejected' })
        return
      }
      if (req.method === 'GET') {
        sendJson(res, 200, lastClientError ?? {})
        return
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'GET, POST' })
        res.end()
        return
      }
      let body = ''
      try {
        for await (const chunk of req) {
          body += chunk
          if (body.length > 32 * 1024) break
        }
      } catch {
        // A truncated report is still better than none.
      }
      if (Date.now() - lastClientErrorAt < 1000) {
        res.writeHead(204)
        res.end()
        return
      }
      lastClientErrorAt = Date.now()
      let parsed
      try {
        parsed = JSON.parse(body)
      } catch {
        parsed = { message: body }
      }
      const record = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      lastClientError = {
        at: new Date().toISOString(),
        message: String(record.message ?? '').slice(0, 2000),
        stack: String(record.stack ?? '').slice(0, 8000),
        componentStack: String(record.componentStack ?? '').slice(0, 8000),
      }
      res.writeHead(204)
      res.end()
    },
  }), 'quota-windows: client error route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: SNAPSHOT_PATH,
    handler: async (req, res) => {
      if (!trusted(ctx, req, config)) {
        sendJson(res, 403, { error: 'cross-origin request rejected' })
        return
      }
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET' })
        res.end()
        return
      }
      const url = new URL(req.url ?? SNAPSHOT_PATH, 'http://localhost')
      try {
        sendJson(res, 200, await collect(ctx, config, url.searchParams.get('refresh') === '1'))
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'quota-windows: snapshot route')
}
