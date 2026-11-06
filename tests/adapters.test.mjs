import test from 'node:test'
import assert from 'node:assert/strict'
import { readOpenRouter, readMoonshot, readZai, readMiniMax } from '../index.js'

function fakeCtx(key = 'test-key') {
  return {
    get(name) {
      if (name === 'credentials') {
        return { resolve: async () => (key === undefined ? undefined : { value: key }) }
      }
      return undefined
    },
  }
}

const directory = new Map()
const settings = new Map()

function stub(body, status = 200) {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
  return () => { globalThis.fetch = original }
}

test('openrouter reports remaining credits', async () => {
  const restore = stub({ data: { total_credits: 10, total_usage: 2.5 } })
  try {
    const source = await readOpenRouter(fakeCtx(), {}, { matched: [{ id: 'openrouter' }], directory, settings })
    assert.equal(source.status, 'ok')
    assert.deepEqual(source.wallets, [{ currency: 'USD', balance: '7.50' }])
  } finally {
    restore()
  }
})

test('openrouter surfaces HTTP failures', async () => {
  const restore = stub({}, 401)
  try {
    const source = await readOpenRouter(fakeCtx(), {}, { matched: [{ id: 'openrouter' }], directory, settings })
    assert.equal(source.status, 'error')
    assert.equal(source.message, 'HTTP 401')
  } finally {
    restore()
  }
})

test('openrouter treats a null total as missing, not zero', async () => {
  const restore = stub({ data: { total_credits: null, total_usage: 1 } })
  try {
    const source = await readOpenRouter(fakeCtx(), {}, { matched: [{ id: 'openrouter' }], directory, settings })
    assert.equal(source.status, 'error')
    assert.equal(source.message, 'no credits in the response')
  } finally {
    restore()
  }
})

test('missing credentials leave a source unconfigured', async () => {
  const source = await readOpenRouter(fakeCtx(null), {}, { matched: [{ id: 'openrouter' }], directory, settings })
  assert.equal(source.status, 'unconfigured')
  assert.equal(source.reason, 'no-credential')
})

test('moonshot reports available and voucher balance', async () => {
  const restore = stub({ data: { available_balance: '12.34', voucher_balance: '1.00' } })
  try {
    const source = await readMoonshot(fakeCtx(), {}, { matched: [{ id: 'moonshotai' }], directory, settings })
    assert.equal(source.status, 'ok')
    assert.equal(source.wallets[0].currency, 'CNY')
    assert.equal(source.wallets[0].balance, '12.34')
    assert.equal(source.bonusWallets[0].balance, '1.00')
  } finally {
    restore()
  }
})

test('zai maps coding-plan windows and duration', async () => {
  const reset = 1700000000000
  const restore = stub({
    data: {
      planName: 'Pro',
      limits: [{ type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 12, nextResetTime: reset }],
    },
  })
  try {
    const source = await readZai(fakeCtx(), {}, { matched: [{ id: 'zai' }], directory, settings })
    assert.equal(source.status, 'ok')
    assert.equal(source.plan, 'Pro')
    assert.equal(source.windows[0].minutes, 300)
    assert.equal(source.windows[0].percent, 12)
    assert.equal(source.windows[0].resetsAt, new Date(reset).toISOString())
  } finally {
    restore()
  }
})

test('zai without a plan is unconfigured rather than an error', async () => {
  const restore = stub({ success: false, code: 500 })
  try {
    const source = await readZai(fakeCtx(), {}, { matched: [{ id: 'zai' }], directory, settings })
    assert.equal(source.status, 'unconfigured')
    assert.equal(source.reason, 'no-plan')
  } finally {
    restore()
  }
})

test('minimax maps remaining prompt counts', async () => {
  const restore = stub({
    model_remains: [{
      current_interval_total_count: 1000,
      current_interval_usage_count: 250,
      end_time: 1700000000,
    }],
  })
  try {
    const source = await readMiniMax(fakeCtx(), {}, { matched: [{ id: 'minimax' }], directory, settings })
    assert.equal(source.status, 'ok')
    assert.equal(source.windows[0].id, 'session')
    assert.equal(source.windows[0].percent, 75)
    assert.equal(source.windows[0].resetsAt, new Date(1700000000000).toISOString())
  } finally {
    restore()
  }
})

test('minimax without a token plan is unconfigured', async () => {
  const restore = stub({ model_remains: [] })
  try {
    const source = await readMiniMax(fakeCtx(), {}, { matched: [{ id: 'minimax' }], directory, settings })
    assert.equal(source.status, 'unconfigured')
    assert.equal(source.reason, 'no-plan')
  } finally {
    restore()
  }
})
