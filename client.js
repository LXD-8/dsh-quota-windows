/**
 * Quota windows — Web page.
 *
 * One sidebar entry and one main panel showing every subscription and balance
 * the Harness can read for this client: DeepSeek account wallets, OpenCode Go
 * windows, and Claude subscription windows. The Host half serves
 * `/quota-windows/api/snapshot`; this page only reads that JSON, so no
 * provider credential ever reaches the browser.
 */
window.__ModuleLoader__.load({
  id: '@local/quota-windows',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'quota-windows'
    const PANEL_ID = 'quota-windows'
    const SNAPSHOT_PATH = '/quota-windows/api/snapshot'
    const REFRESH_MS = 60_000

    /**
     * Provider brand accents. The LLM registry exposes ids and names only, so
     * brand colors cannot be discovered at runtime; every route this build
     * knows gets a hand-picked accent, and unknown ids fall back to a stable
     * hash color so a newly added provider still has its own identity.
     */
    const BRAND_ACCENTS = {
      opencode: 'var(--dsw-alias-brand-primary)',
      'opencode-go': 'var(--dsw-alias-brand-primary)',
      'opencode-go1': 'var(--dsw-alias-brand-primary)',
      'opencode-go-chat': 'var(--dsw-alias-brand-primary)',
      deepseek: '#4D6BFE',
      'deepseek-official': '#4D6BFE',
      'deepseek-account': '#4D6BFE',
      claude: '#D97757',
      anthropic: '#D97757',
      omlx: '#10B981',
      openai: '#10A37F',
      'openai-codex': '#10A37F',
      google: '#4285F4',
      'google-vertex': '#4285F4',
      xai: '#1D9BF0',
      meta: '#0866FF',
      mistral: '#FF7000',
      groq: '#F55036',
      nvidia: '#76B900',
      huggingface: '#FFB000',
      'github-copilot': '#8957E5',
      openrouter: '#6467F2',
      together: '#0F6FFF',
      fireworks: '#FF5C35',
      cerebras: '#F15A24',
      baseten: '#14B8A6',
      moonshotai: '#5B6CFF',
      'moonshotai-cn': '#5B6CFF',
      'kimi-coding': '#5B6CFF',
      minimax: '#FF6A00',
      'minimax-cn': '#FF6A00',
      'qwen-token-plan': '#615CED',
      'qwen-token-plan-cn': '#615CED',
      'qwen-token-plan-individual': '#615CED',
      zai: '#3B82F6',
      'zai-coding-cn': '#3B82F6',
      xiaomi: '#FF6900',
      'xiaomi-token-plan-ams': '#FF6900',
      'xiaomi-token-plan-cn': '#FF6900',
      'xiaomi-token-plan-sgp': '#FF6900',
      'amazon-bedrock': '#FF9900',
      azure: '#0078D4',
      'cloudflare-ai-gateway': '#F38020',
      'cloudflare-workers-ai': '#F38020',
      'vercel-ai-gateway': '#6B7280',
      'ant-ling': '#1677FF',
      radius: '#7C3AED',
    }
    const FALLBACK_ACCENTS = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6']

    /** Stable accent for a provider id: the brand table first, then a hash color. */
    function accentFor(id) {
      const known = BRAND_ACCENTS[id]
      if (known !== undefined) return known
      let hash = 0
      for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0
      return FALLBACK_ACCENTS[hash % FALLBACK_ACCENTS.length]
    }

    const zh = {
      panel: '额度窗口',
      title: '额度窗口',
      subtitle: '订阅与余额状态',
      refresh: '刷新',
      refreshing: '刷新中…',
      updated: '更新于 {time}',
      error: '读取失败',
      retry: '重试',
      'providers.note': '只显示提供额度或余额接口的供应商；新增这类供应商后会自动出现。',
      'status.ok': '已连接',
      'status.unconfigured': '未配置',
      'status.error': '读取失败',
      'status.balanceOk': '已登录',
      'reason.noCredential': '未配置该供应商的密钥',
      'reason.claudeSignIn': '请先登录 Claude Code 以读取订阅用量',
      'reason.deepseekSignIn': '未登录 DeepSeek 账户',
      'reason.noPlan': '该账户没有可读取的套餐配额',
      'error.http': '接口返回 {status}',
      'error.timeout': '请求超时',
      'error.balance': '余额查询失败',
      'error.noData': '接口没有返回可用数据',
      'error.network': '网络请求失败',
      'empty.title': '没有可显示的额度来源',
      'empty.body': '已添加的供应商里暂时没有可读取的额度或余额接口。',
      'boundary.message': '页面渲染出错',
      'boundary.details': '查看错误详情',
      'boundary.retry': '重试',
      percent: '{percent}% 已用',
      reset: '重置于 {time}',
      'reset.relative': '重置于 {time} · {relative}',
      'provider.opencode': 'OpenCode',
      'provider.claude': 'Claude',
      'provider.deepseek': 'DeepSeek 账户',
      'subtitle.subscription': '订阅',
      'subtitle.balance': '账户余额',
      'provider.openrouter': 'OpenRouter',
      'provider.moonshot': 'Moonshot',
      'subtitle.opencode': 'Go 订阅',
      'subtitle.claude': 'Claude 订阅',
      'subtitle.deepseek': '账户余额',
      'window.rolling': '5 小时',
      'window.weekly': '本周',
      'window.monthly': '本月',
      'window.five_hour': '5 小时',
      'window.seven_day': '本周',
      'window.seven_day_opus': '本周 · Opus',
      'window.seven_day_sonnet': '本周 · Sonnet',
      'window.extra': '额外用量',
      'window.session': '套餐窗口',
      'duration.5h': '5 小时',
      'duration.week': '本周',
      'duration.month': '本月',
      'duration.minutes': '{count} 分钟',
      'duration.hours': '{count} 小时',
      'duration.days': '{count} 天',
      'provider.zai': 'Z.ai',
      'provider.minimax': 'MiniMax',
      'balance.available': '可用余额',
      'balance.bonus': '赠送',
      'balance.empty': '暂无余额数据',
      'wallet.CNY': '人民币',
      'wallet.USD': '美元',
      'stats.accounts': '额度来源',
      'stats.tightest': '最紧窗口',
      'stats.nextReset': '下次重置',
      'stats.jump': '跳转到对应的来源卡片',
      'stats.accountsValue': '{count}',
      'stats.none': '—',
      'notes.title': '关于这些数字',
      'notes.percent': '百分比是窗口内已用额度的占比，不是剩余金额。',
      'notes.reset': '重置时间由服务商返回，会随滚动窗口变化。',
      'notes.balance': '余额来自 DeepSeek / OpenRouter / Moonshot 等账户，订阅窗口来自 OpenCode / Claude / Z.ai / MiniMax 等。',
      'notes.refresh': '页面显示时每 1 分钟自动刷新；进入页面会立即刷新，也可以随时手动刷新。',
    }

    const en = {
      panel: 'Quota windows',
      title: 'Quota windows',
      subtitle: 'Subscriptions and balances',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      updated: 'Updated {time}',
      error: 'Could not read usage',
      retry: 'Retry',
      'providers.note': 'Only providers with a usage or balance API are shown; adding one makes it appear here automatically.',
      'status.ok': 'Connected',
      'status.unconfigured': 'Not configured',
      'status.error': 'Unavailable',
      'status.balanceOk': 'Signed in',
      'reason.noCredential': 'No credential configured for this provider',
      'reason.claudeSignIn': 'Sign in to Claude Code to read subscription usage',
      'reason.deepseekSignIn': 'Not signed in to DeepSeek',
      'reason.noPlan': 'No plan quota is available for this account',
      'error.http': 'API returned {status}',
      'error.timeout': 'Request timed out',
      'error.balance': 'Balance query failed',
      'error.noData': 'The API returned no usable data',
      'error.network': 'Network request failed',
      'empty.title': 'No quota sources to show',
      'empty.body': 'None of the added providers exposes a readable usage or balance API right now.',
      'boundary.message': 'This page hit a render error',
      'boundary.details': 'Show error details',
      'boundary.retry': 'Retry',
      percent: '{percent}% used',
      reset: 'Resets {time}',
      'reset.relative': 'Resets {time} · {relative}',
      'provider.opencode': 'OpenCode',
      'provider.claude': 'Claude',
      'provider.deepseek': 'DeepSeek account',
      'subtitle.subscription': 'Subscription',
      'subtitle.balance': 'Account balance',
      'provider.openrouter': 'OpenRouter',
      'provider.moonshot': 'Moonshot',
      'subtitle.opencode': 'Go subscription',
      'subtitle.claude': 'Claude subscription',
      'subtitle.deepseek': 'Account balance',
      'window.rolling': '5 hours',
      'window.weekly': 'This week',
      'window.monthly': 'This month',
      'window.five_hour': '5 hours',
      'window.seven_day': 'This week',
      'window.seven_day_opus': 'This week · Opus',
      'window.seven_day_sonnet': 'This week · Sonnet',
      'window.extra': 'Extra usage',
      'window.session': 'Session',
      'duration.5h': '5 hours',
      'duration.week': 'This week',
      'duration.month': 'This month',
      'duration.minutes': '{count} min',
      'duration.hours': '{count} h',
      'duration.days': '{count} d',
      'provider.zai': 'Z.ai',
      'provider.minimax': 'MiniMax',
      'balance.available': 'Available balance',
      'balance.bonus': 'Bonus',
      'balance.empty': 'No balance data',
      'wallet.CNY': 'CNY',
      'wallet.USD': 'USD',
      'stats.accounts': 'Quota sources',
      'stats.tightest': 'Tightest window',
      'stats.nextReset': 'Next reset',
      'stats.jump': 'Jump to the matching source card',
      'stats.accountsValue': '{count}',
      'stats.none': '—',
      'notes.title': 'About these numbers',
      'notes.percent': 'The percentage is the share of a window’s allowance already used, not a remaining amount.',
      'notes.reset': 'Reset times come from the provider and move with the rolling window.',
      'notes.balance': 'Balances come from DeepSeek, OpenRouter, and Moonshot; subscription windows come from OpenCode, Claude, Z.ai, and MiniMax.',
      'notes.refresh': 'While the page is visible it refreshes every minute; entering the page refreshes immediately, and you can refresh manually at any time.',
    }

    const CSS = `
.qw-page{position:relative;display:flex;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.6}
.qw-scroll{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable;background:
  radial-gradient(720px 380px at 6% -12%,color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent),transparent 70%),
  radial-gradient(560px 320px at 100% 0%,color-mix(in srgb,var(--dsw-alias-brand-primary) 6%,transparent),transparent 72%),
  var(--dsw-alias-bg-base)}
.qw-content{display:flex;flex-direction:column;max-width:960px;margin:0 auto;padding:0 clamp(24px,4vw,48px) 40px}
.qw-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px;padding-top:28px;margin-bottom:24px}
[data-platform='darwin'] .qw-head{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}
.qw-head h1{margin:0;font-size:20px;line-height:28px;font-weight:500}
.qw-sub{margin:4px 0 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.qw-actions{display:flex;align-items:center;gap:12px}
.qw-updated{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.qw-refresh{height:32px;padding:0 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;cursor:pointer;box-shadow:var(--dsw-shadow-lv1,0 1px 2px rgba(0,0,0,.05))}
.qw-refresh:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.qw-refresh:disabled{opacity:.55;cursor:default}
.qw-refresh:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.qw-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:4px}
.qw-stat{position:relative;display:flex;flex-direction:column;gap:2px;padding:12px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-1)}
.qw-statLabel{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.qw-stat--action{appearance:none;text-align:left;font:inherit;color:inherit;cursor:pointer;transition:border-color .15s ease,background .15s ease}
.qw-stat--action:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
.qw-stat--action:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.qw-statJump{position:absolute;top:8px;right:10px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);opacity:.7}
.qw-card{transition:outline-color .2s ease,box-shadow .2s ease}
.qw-card--focus{outline:2px solid var(--qw-accent);outline-offset:2px;box-shadow:0 0 0 6px color-mix(in srgb,var(--qw-accent) 16%,transparent)}
.qw-statValue{font-size:15px;line-height:22px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qw-sectionNote{margin:24px 0 12px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.qw-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:1fr;gap:18px;align-items:stretch}
.qw-grid[data-columns='3']{grid-template-columns:repeat(3,minmax(0,1fr))}
@media (max-width:1000px){.qw-grid[data-columns='3']{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:720px){.qw-grid,.qw-grid[data-columns='3'],.qw-skeleton{grid-template-columns:minmax(0,1fr)}}
.qw-card{--qw-accent:var(--dsw-alias-brand-primary);position:relative;display:flex;flex-direction:column;gap:20px;overflow:hidden;padding:22px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg,16px);background:linear-gradient(180deg,color-mix(in srgb,var(--qw-accent) 5%,transparent),transparent 46%),var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-shadow-lv2,0 4px 12px rgba(0,0,0,.02),0 2px 8px rgba(0,0,0,.04))}
.qw-card::before{content:'';position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,color-mix(in srgb,var(--qw-accent) 70%,transparent),transparent 78%)}
.qw-cardHead{display:flex;align-items:center;gap:12px}
.qw-mark{display:inline-flex;flex:none;align-items:center;justify-content:center;width:38px;height:38px;border-radius:var(--dsw-radius-md,12px);background:color-mix(in srgb,var(--qw-accent) 12%,transparent);color:var(--qw-accent);font-size:12px;font-weight:700;letter-spacing:.02em}
.qw-cardTitle{flex:1;min-width:0}
.qw-cardTitle h2{margin:0;font-size:15px;line-height:22px;font-weight:500}
.qw-cardTitle p{margin:1px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.qw-badge{flex:none;padding:3px 9px;border-radius:var(--dsw-radius-xl,20px);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);color:var(--dsw-alias-state-success-primary);font-size:11px;line-height:16px}
.qw-badge[data-status='error']{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary)}
.qw-badge[data-status='unconfigured']{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.qw-windows{display:flex;flex:1;flex-direction:column;gap:15px;min-width:0;margin:0;padding:0;list-style:none}
.qw-windowTop{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:6px}
.qw-windowLabel{font-size:13px;line-height:20px}
.qw-windowPct{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.qw-bar{height:6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.qw-fill{height:100%;border-radius:inherit;background:var(--dsw-alias-state-success-primary);transition:width .35s ease}
.qw-window[data-level='warn'] .qw-fill{background:var(--dsw-alias-state-warn-primary)}
.qw-window[data-level='danger'] .qw-fill{background:var(--dsw-alias-state-error-primary)}
.qw-reset{margin:6px 0 0;font-size:11px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.qw-note{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.qw-balanceBody{display:flex;flex:1;flex-direction:column;justify-content:space-between;gap:16px}
.qw-balanceMain{min-width:0}
.qw-balanceLabel{display:block;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.qw-balanceAmount{display:flex;align-items:baseline;gap:4px;margin-top:2px}
.qw-balanceAmount strong{font-size:30px;line-height:36px;font-weight:600;font-variant-numeric:tabular-nums}
.qw-currency{font-size:18px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.qw-currencyCode{margin-left:6px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.qw-wallets{min-width:0;margin:0;padding:0;list-style:none}
.qw-wallet{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px;line-height:18px}
.qw-wallet:first-child{border-top:0;padding-top:0}
.qw-walletLabel{color:var(--dsw-alias-label-secondary)}
.qw-walletValue{font-weight:500;font-variant-numeric:tabular-nums}
.qw-empty{margin-top:24px;padding:32px 24px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-alias-bg-layer-1);text-align:center}
.qw-empty h2{margin:0;font-size:15px;line-height:22px;font-weight:500}
.qw-empty p{margin:6px 0 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.qw-notes{padding-top:24px}
.qw-notesInner{padding:16px 18px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,12px);background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 76%,transparent)}
.qw-notes h2{margin:0 0 10px;font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.qw-notesList{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin:0;padding:0;list-style:none;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.qw-notesList li{position:relative;padding-left:14px}
.qw-notesList li::before{content:'';position:absolute;left:1px;top:7px;width:4px;height:4px;border-radius:50%;background:var(--dsw-alias-border-l2)}
.qw-error{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:16px 18px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-state-error-primary);font-size:13px}
.qw-skeleton{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:1fr;gap:18px}
.qw-skelCard{min-height:280px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-alias-bg-layer-1);animation:qw-pulse 1.4s ease-in-out infinite}
@keyframes qw-pulse{0%,100%{opacity:.55}50%{opacity:1}}
`

    function activeLanguage() {
      const declared = typeof document === 'undefined' ? '' : document.documentElement.lang
      if (declared) return declared
      return typeof navigator === 'undefined' ? 'en' : navigator.language || 'en'
    }

    function formatClock(iso) {
      const at = Date.parse(iso)
      if (!Number.isFinite(at)) return ''
      try {
        return new Intl.DateTimeFormat(activeLanguage(), { hour: '2-digit', minute: '2-digit' }).format(new Date(at))
      } catch {
        return new Date(at).toLocaleTimeString()
      }
    }

    function formatReset(iso, t) {
      const at = Date.parse(iso)
      if (!Number.isFinite(at)) return ''
      const language = activeLanguage()
      let absolute
      try {
        absolute = new Intl.DateTimeFormat(language, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(at))
      } catch {
        absolute = new Date(at).toLocaleString()
      }
      const diff = at - Date.now()
      try {
        const relative = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })
        const magnitude = Math.abs(diff)
        if (magnitude < 60_000) return t('reset.relative', { time: absolute, relative: relative.format(Math.round(diff / 1000), 'second') })
        if (magnitude < 3_600_000) return t('reset.relative', { time: absolute, relative: relative.format(Math.round(diff / 60_000), 'minute') })
        if (magnitude < 86_400_000) return t('reset.relative', { time: absolute, relative: relative.format(Math.round(diff / 3_600_000), 'hour') })
        return t('reset.relative', { time: absolute, relative: relative.format(Math.round(diff / 86_400_000), 'day') })
      } catch {
        return t('reset', { time: absolute })
      }
    }

    function levelOf(percent) {
      return percent >= 90 ? 'danger' : percent >= 70 ? 'warn' : 'ok'
    }

    function symbolOf(currency) {
      if (currency === 'CNY') return '¥'
      if (currency === 'USD') return '$'
      return `${currency} `
    }

    /** Render a server decimal string as a two-decimal currency amount. */
    function formatAmount(value) {
      const number = Number(value)
      if (!Number.isFinite(number)) return String(value)
      try {
        return new Intl.NumberFormat(activeLanguage(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number)
      } catch {
        return number.toFixed(2)
      }
    }

    /** Cross-source figures for the overview row. */
    function summarize(sources) {
      let tightest
      let nextReset
      for (const source of sources) {
        if (source?.status !== 'ok' || source.kind === 'balance') continue
        for (const entry of Array.isArray(source.windows) ? source.windows : []) {
          const percent = Number(entry?.percent) || 0
          if (tightest === undefined || percent > (Number(tightest.percent) || 0)) {
            tightest = { ...entry, source: source.id }
          }
          const at = Date.parse(entry?.resetsAt ?? '')
          if (Number.isFinite(at) && at > Date.now() && (nextReset === undefined || at < nextReset.at)) {
            nextReset = { at, source: source.id }
          }
        }
      }
      return { tightest, nextReset }
    }

    /** Poll the Host snapshot once per minute, with an explicit refresh path. */
    function useSnapshot() {
      const [state, setState] = React.useState({ phase: 'loading', data: null, error: null, refreshing: false })
      const [nonce, setNonce] = React.useState(0)
      React.useEffect(() => {
        let cancelled = false
        let latest = 0
        let controller
        const load = async (force) => {
          const request = ++latest
          if (force) setState(current => ({ ...current, refreshing: true }))
          controller?.abort()
          controller = new AbortController()
          const timeout = window.setTimeout(() => controller.abort(), 5_000)
          try {
            const response = await fetch(SNAPSHOT_PATH + (force ? '?refresh=1' : ''), {
              cache: 'no-store',
              signal: controller.signal,
            })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const data = await response.json()
            if (!cancelled && request === latest) setState({ phase: 'ready', data, error: null, refreshing: false })
          } catch (error) {
            if (cancelled || request !== latest) return
            const message = error instanceof Error
              ? (error.name === 'AbortError' ? 'request timed out' : error.message)
              : String(error)
            setState(current => ({
              phase: current.data === null ? 'error' : 'ready',
              data: current.data,
              error: message,
              refreshing: false,
            }))
          } finally {
            window.clearTimeout(timeout)
          }
        }
        // Entering the page always re-reads the providers; the interval keeps it fresh afterwards.
        load(true)
        const timer = window.setInterval(() => {
          if (document.visibilityState !== 'hidden') load(false)
        }, REFRESH_MS)
        return () => {
          cancelled = true
          controller?.abort()
          window.clearInterval(timer)
        }
      }, [nonce])
      return { ...state, refresh: () => setNonce(value => value + 1) }
    }

    /** Provider display name: the localized label for known ids, else the Host name. */
    function providerTitle(source, t) {
      const id = typeof source?.id === 'string' ? source.id : 'unknown'
      const known = t(`provider.${id}`)
      if (known !== `provider.${id}`) return known
      return typeof source?.name === 'string' && source.name !== '' ? source.name : id
    }

    /** Two-letter mark for providers without a dedicated monogram. */
    function initials(name) {
      const parts = String(name).replace(/[^A-Za-z0-9]+/gu, ' ').trim().split(/\s+/u).filter(Boolean)
      if (parts.length > 1) return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase()
      return String(parts[0] ?? name).slice(0, 2).toUpperCase()
    }

    /** Localized explanation for an unconfigured source. */
    function reasonText(source, t) {
      switch (source?.reason) {
        case 'claude-sign-in': return t('reason.claudeSignIn')
        case 'deepseek-sign-in': return t('reason.deepseekSignIn')
        case 'no-plan': return t('reason.noPlan')
        case 'no-credential': return t('reason.noCredential')
        default: return t('status.unconfigured')
      }
    }

    /** Localized error detail; provider-specific text stays as a fallback. */
    function errorText(source, t) {
      const message = typeof source?.message === 'string' ? source.message : ''
      const http = /^HTTP (\d{3})$/u.exec(message)
      if (http !== null) return t('error.http', { status: http[1] })
      const status = /^status (\d+)$/u.exec(message)
      if (status !== null) return t('error.http', { status: status[1] })
      if (message.startsWith('timed out') || message === 'request timed out') return t('error.timeout')
      if (message.includes('fetch failed') || message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
        return t('error.network')
      }
      if (message.includes('credential expired')) return t('reason.claudeSignIn')
      if (message === 'balance query failed') return t('error.balance')
      if (message === 'no credits in the response' || message === 'no balance in the response'
        || message.startsWith('no usage windows') || message.startsWith('unexpected response')) {
        return t('error.noData')
      }
      return message === '' ? t('status.error') : `${t('status.error')} · ${message}`
    }

    /** Localized wallet name, falling back to the currency code. */
    function walletLabel(currency, t) {
      const known = t(`wallet.${currency}`)
      return known === `wallet.${currency}` ? currency : known
    }

    /** Localized label for a duration in minutes. */
    function durationLabel(minutes, t) {
      if (minutes === 300) return t('duration.5h')
      if (minutes === 10080) return t('duration.week')
      if (minutes === 43200) return t('duration.month')
      if (minutes % 1440 === 0) return t('duration.days', { count: minutes / 1440 })
      if (minutes % 60 === 0) return t('duration.hours', { count: minutes / 60 })
      return t('duration.minutes', { count: minutes })
    }

    /** Window label: known id, else a duration the Host reported, else its own label. */
    function windowLabel(entry, t) {
      const id = entry?.id ?? 'unknown'
      const known = t(`window.${id}`)
      if (known !== `window.${id}`) return known
      const minutes = Number(entry?.minutes)
      if (Number.isFinite(minutes) && minutes > 0) return durationLabel(minutes, t)
      if (typeof entry?.label === 'string' && entry.label !== '') return entry.label
      return String(id)
    }

    function CardHeader({ source, subtitle, t }) {
      const id = typeof source?.id === 'string' ? source.id : 'unknown'
      // A provider the user has not set up is a neutral fact, not a failure.
      const status = source?.status === 'ok' ? 'ok' : source?.status === 'unconfigured' ? 'unconfigured' : 'error'
      const badge = status === 'unconfigured'
        ? t('status.unconfigured')
        : status === 'error'
          ? t('status.error')
          : source?.kind === 'balance' && id === 'deepseek' ? t('status.balanceOk') : t('status.ok')
      const name = providerTitle(source, t)
      const mark = id === 'opencode' ? 'OC' : id === 'claude' ? 'CL' : id === 'deepseek' ? 'DS' : initials(name)
      return h('header', { className: 'qw-cardHead' },
        h('span', { className: 'qw-mark', 'aria-hidden': true }, mark),
        h('div', { className: 'qw-cardTitle' },
          h('h2', null, name),
          h('p', null, subtitle)),
        h('span', { className: 'qw-badge', 'data-status': status }, badge))
    }

    function SubscriptionCard({ source, t }) {
      const id = typeof source?.id === 'string' ? source.id : 'unknown'
      const unconfigured = source?.status === 'unconfigured'
      const status = source?.status === 'ok' ? 'ok' : 'error'
      const windows = Array.isArray(source?.windows) ? source.windows : []
      const plan = typeof source?.plan === 'string' && source.plan !== '' ? source.plan : null
      const knownSubtitle = t(`subtitle.${id}`)
      const subtitle = plan !== null
        ? `${id === 'claude' ? 'Claude ' : ''}${plan.charAt(0).toUpperCase()}${plan.slice(1)}`
        : knownSubtitle === `subtitle.${id}` ? t('subtitle.subscription') : knownSubtitle
      return h('article', {
        className: 'qw-card',
        'data-provider': id,
        tabIndex: -1,
        style: { '--qw-accent': accentFor(id) },
      },
      h(CardHeader, { source, subtitle, t }),
      status === 'ok'
        ? h('ul', { className: 'qw-windows' }, windows.map(entry => h(WindowRow, { key: entry.id, entry, t })))
        : h('p', { className: 'qw-note' },
          unconfigured
            ? reasonText(source, t)
            : errorText(source, t)))
    }

    function BalanceCard({ source, t }) {
      const id = typeof source?.id === 'string' ? source.id : 'unknown'
      const unconfigured = source?.status === 'unconfigured'
      const status = source?.status === 'ok' ? 'ok' : 'error'
      const wallets = (Array.isArray(source?.wallets) ? source.wallets : []).filter(wallet => typeof wallet?.balance === 'string')
      const bonusWallets = (Array.isArray(source?.bonusWallets) ? source.bonusWallets : []).filter(wallet => typeof wallet?.balance === 'string')
      const primary = wallets.find(wallet => Number(wallet.balance) !== 0)
        ?? wallets[0]
        ?? bonusWallets.find(wallet => Number(wallet.balance) !== 0)
        ?? bonusWallets[0]
      const profile = source?.profile
      const knownSubtitle = t(`subtitle.${id}`)
      const subtitle = (typeof profile?.name === 'string' && profile.name !== '' ? profile.name : null)
        ?? (typeof profile?.contact === 'string' && profile.contact !== '' ? profile.contact : null)
        ?? (knownSubtitle === `subtitle.${id}` ? t('subtitle.balance') : knownSubtitle)
      const rows = [
        ...wallets.map(wallet => ({
          key: `wallet-${wallet.currency}`,
          label: walletLabel(wallet.currency, t),
          amount: `${symbolOf(wallet.currency)}${formatAmount(wallet.balance)}`,
        })),
        ...bonusWallets.map((wallet, index) => ({
          key: `bonus-${wallet.currency}-${index}`,
          label: `${t('balance.bonus')} · ${wallet.currency}`,
          amount: `${symbolOf(wallet.currency)}${formatAmount(wallet.balance)}`,
        })),
      ]
      return h('article', {
        className: 'qw-card',
        'data-provider': id,
        tabIndex: -1,
        style: { '--qw-accent': accentFor(id) },
      },
      h(CardHeader, { source, subtitle, t }),
      status === 'ok'
        ? h('div', { className: 'qw-balanceBody' },
          h('div', { className: 'qw-balanceMain' },
            h('span', { className: 'qw-balanceLabel' }, t('balance.available')),
            h('div', { className: 'qw-balanceAmount' },
              primary === undefined ? h('strong', null, '—') : h(React.Fragment, null,
                h('span', { className: 'qw-currency' }, symbolOf(primary.currency)),
                h('strong', null, formatAmount(primary.balance)),
                h('span', { className: 'qw-currencyCode' }, primary.currency)))),
          rows.length === 0
            ? h('p', { className: 'qw-note' }, t('balance.empty'))
            : h('ul', { className: 'qw-wallets' }, rows.map(row => h('li', { key: row.key, className: 'qw-wallet' },
              h('span', { className: 'qw-walletLabel' }, row.label),
              h('strong', { className: 'qw-walletValue' }, row.amount)))))
        : h('p', { className: 'qw-note' },
          unconfigured
            ? reasonText(source, t)
            : errorText(source, t)))
    }

    function WindowRow({ entry, t }) {
      const percent = Math.max(0, Math.min(100, Number(entry?.percent) || 0))
      const label = windowLabel(entry, t)
      const rounded = Math.round(percent)
      return h('li', { className: 'qw-window', 'data-level': levelOf(percent) },
        h('div', { className: 'qw-windowTop' },
          h('span', { className: 'qw-windowLabel' }, label),
          h('span', { className: 'qw-windowPct' }, t('percent', { percent: rounded }))),
        h('div', {
          className: 'qw-bar',
          role: 'progressbar',
          'aria-label': label,
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': rounded,
        }, h('div', { className: 'qw-fill', style: { width: `${percent}%` } })),
        typeof entry?.resetsAt === 'string' && entry.resetsAt !== ''
          ? h('p', { className: 'qw-reset' }, formatReset(entry.resetsAt, t))
          : null)
    }

    /** One stat tile; a figure with a target becomes a jump button. */
    function Stat({ label, value, onActivate, t }) {
      const children = [
        h('span', { key: 'label', className: 'qw-statLabel' }, label),
        h('strong', { key: 'value', className: 'qw-statValue' }, value),
      ]
      if (onActivate === undefined) return h('div', { className: 'qw-stat' }, children)
      return h('button', {
        type: 'button',
        className: 'qw-stat qw-stat--action',
        title: t('stats.jump'),
        onClick: onActivate,
      }, children, h('span', { className: 'qw-statJump', 'aria-hidden': true }, '↗'))
    }

    function Stats({ summary, added, t, onFocus }) {
      const tightest = summary.tightest
      const reset = summary.nextReset
      return h('div', { className: 'qw-stats' },
        h('div', { className: 'qw-stat' },
          h('span', { className: 'qw-statLabel' }, t('stats.accounts')),
          h('strong', { className: 'qw-statValue' }, t('stats.accountsValue', { count: added }))),
        h(Stat, {
          label: t('stats.tightest'),
          value: tightest === undefined ? t('stats.none') : `${windowLabel(tightest, t)} ${Math.round(tightest.percent)}%`,
          onActivate: tightest === undefined || typeof onFocus !== 'function' ? undefined : () => onFocus(tightest.source),
          t,
        }),
        h(Stat, {
          label: t('stats.nextReset'),
          value: reset === undefined ? t('stats.none') : formatClock(new Date(reset.at).toISOString()),
          onActivate: reset === undefined || typeof onFocus !== 'function' ? undefined : () => onFocus(reset.source),
          t,
        }))
    }

    function Notes({ t }) {
      return h('section', { className: 'qw-notes', 'aria-label': t('notes.title') },
        h('div', { className: 'qw-notesInner' },
          h('h2', null, t('notes.title')),
          h('ul', { className: 'qw-notesList' },
            h('li', null, t('notes.percent')),
            h('li', null, t('notes.reset')),
            h('li', null, t('notes.balance')),
            h('li', null, t('notes.refresh')))))
    }

    function PageContent(props) {
      const t = typeof props.t === 'function' ? props.t : key => key
      const snapshot = useSnapshot()
      const sources = Array.isArray(snapshot.data?.sources)
        ? snapshot.data.sources.filter(source => source !== null && typeof source === 'object')
        : []
      const subscriptions = sources.filter(source => source.kind !== 'balance')
      const balances = sources.filter(source => source.kind === 'balance')
      const cards = [
        ...subscriptions.map(source => h(SubscriptionCard, { key: `source-${source.id}`, source, t })),
        ...balances.map(source => h(BalanceCard, { key: `source-${source.id}`, source, t })),
      ]
      const updated = typeof snapshot.data?.fetchedAt === 'string' ? formatClock(snapshot.data.fetchedAt) : ''
      const focusSource = (id) => {
        if (typeof id !== 'string') return
        const card = [...document.querySelectorAll('[data-provider]')].find(node => node.dataset.provider === id)
        if (card === undefined) return
        const reduce = typeof window.matchMedia === 'function'
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches === true
        card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
        card.classList.add('qw-card--focus')
        window.setTimeout(() => card.classList.remove('qw-card--focus'), 1600)
        if (typeof card.focus === 'function') card.focus({ preventScroll: true })
      }
      return h('section', { className: 'qw-page', 'aria-label': t('title') },
        h('style', null, CSS),
        h('div', { className: 'qw-scroll' },
          h('div', { className: 'qw-content' },
            h('header', { className: 'qw-head' },
              h('div', null,
                h('h1', null, t('title')),
                h('p', { className: 'qw-sub' }, t('subtitle'))),
              h('div', { className: 'qw-actions' },
                updated === '' ? null : h('span', { className: 'qw-updated' }, t('updated', { time: updated })),
                h('button', {
                  type: 'button',
                  className: 'qw-refresh',
                  onClick: snapshot.refresh,
                  disabled: snapshot.refreshing,
                }, snapshot.refreshing ? t('refreshing') : t('refresh')))),
            snapshot.phase === 'loading'
              ? h('div', { className: 'qw-skeleton', 'aria-hidden': true },
                h('div', { className: 'qw-skelCard' }),
                h('div', { className: 'qw-skelCard' }))
              : snapshot.phase === 'error'
                ? h('div', { className: 'qw-error', role: 'alert' },
                  h('span', null, `${t('error')}: ${errorText({ message: snapshot.error }, t)}`),
                  h('button', { type: 'button', className: 'qw-refresh', onClick: snapshot.refresh }, t('retry')))
                : h(React.Fragment, null,
                  h(Stats, { summary: summarize(sources), added: cards.length, t, onFocus: focusSource }),
                  cards.length === 0
                    ? h('div', { className: 'qw-empty' },
                      h('h2', null, t('empty.title')),
                      h('p', null, t('empty.body')))
                    : h(React.Fragment, null,
                      h('p', { className: 'qw-sectionNote' }, t('providers.note')),
                      h('div', { className: 'qw-grid', 'data-columns': cards.length > 1 && cards.length % 3 === 0 ? 3 : undefined }, cards))),
            snapshot.phase === 'ready' && snapshot.error !== null
              ? h('p', { className: 'qw-note', role: 'status', style: { marginTop: '16px' } }, `${t('error')}: ${errorText({ message: snapshot.error }, t)}`)
              : null,
            h(Notes, { t }))))
    }

    /** Keep one render crash from blanking the panel, and report it to the Host. */
    class PageBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error, info) {
        try {
          fetch('/quota-windows/api/client-error', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              message: String(error && error.message ? error.message : error),
              stack: String(error && error.stack ? error.stack : ''),
              componentStack: String(info && info.componentStack ? info.componentStack : ''),
            }),
          }).catch(() => {})
        } catch {
          // Reporting is best effort.
        }
      }

      render() {
        const t = typeof this.props.t === 'function' ? this.props.t : key => key
        if (this.state.error === null) return this.props.children
        const detail = String(this.state.error && this.state.error.stack ? this.state.error.stack : this.state.error)
        return h('section', { className: 'qw-page' },
          h('div', { className: 'qw-content' },
            h('h1', { style: { paddingTop: '28px' } }, t('title')),
            h('p', { className: 'qw-error', style: { display: 'block', marginTop: '16px' } }, t('boundary.message')),
            h('details', { className: 'qw-error', style: { display: 'block', marginTop: '12px' } },
              h('summary', null, t('boundary.details')),
              h('pre', { style: { whiteSpace: 'pre-wrap', maxHeight: '50vh', overflow: 'auto', margin: '12px 0 0' } }, detail)),
            h('button', {
              type: 'button',
              className: 'qw-refresh',
              style: { marginTop: '16px' },
              onClick: () => this.setState({ error: null }),
            }, t('boundary.retry'))))
      }
    }

    function QuotaWindowsPage(props) {
      const t = typeof props.t === 'function' ? props.t : key => key
      return h(PageBoundary, { t }, h(PageContent, props))
    }

    function QuotaIcon({ size = 16 }) {
      // Fuel pump: body, hose and a fuel drop. Stroke-only so the sidebar can
      // tint it for the active state.
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
        h('path', {
          d: 'M7.3 4.5h4.4a1.8 1.8 0 0 1 1.8 1.8V19H5.5V6.3a1.8 1.8 0 0 1 1.8-1.8Z',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M13.5 6.2h1.4a1.6 1.6 0 0 1 1.6 1.6v4.5a1.6 1.6 0 0 0 3.2 0V7.4l-2.3-2.3',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M9.5 10c1 1.2 1.6 2.1 1.6 2.7a1.6 1.6 0 1 1-3.2 0c0-.6.6-1.5 1.6-2.7Z',
          fill: 'currentColor',
        }))
    }

    return {
      name: 'quota-windows-client',
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'zh', zh), 'quota-windows: zh dictionary')
        ctx.effect(() => ctx.locale.register(NS, 'en', en), 'quota-windows: en dictionary')
        const translate = ctx.locale.bind(NS)
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        }, QuotaWindowsPage))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          locale: NS,
          label: () => translate('panel'),
        }, QuotaIcon))
      },
    }
  },
})
