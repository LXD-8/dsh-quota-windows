import test from 'node:test'
import assert from 'node:assert/strict'
import {
  numeric, zaiPercent, zaiWindowMinutes, zaiReset, minimaxPercent, minimaxReset,
} from '../index.js'

test('numeric treats missing values as absent, not zero', () => {
  assert.equal(numeric(null), undefined)
  assert.equal(numeric(undefined), undefined)
  assert.equal(numeric(''), undefined)
  assert.equal(numeric(0), 0)
  assert.equal(numeric('3.5'), 3.5)
  assert.equal(numeric('abc'), undefined)
})

test('zaiPercent prefers percentage, else derives from counts', () => {
  assert.equal(zaiPercent({ percentage: 12 }), 12)
  assert.equal(zaiPercent({ usage: 100, remaining: 60 }), 40)
  assert.equal(zaiPercent({ usage: 1000, currentValue: 250 }), 25)
  assert.equal(zaiPercent({ percentage: null }), undefined)
})

test('zaiWindowMinutes maps duration units', () => {
  assert.equal(zaiWindowMinutes({ unit: 3, number: 5 }), 300)
  assert.equal(zaiWindowMinutes({ unit: 6, number: 1 }), 10080)
  assert.equal(zaiWindowMinutes({ unit: 1, number: 1 }), 1440)
  assert.equal(zaiWindowMinutes({ unit: 99, number: 1 }), undefined)
})

test('zaiReset accepts seconds and milliseconds', () => {
  assert.equal(zaiReset(1700000000000), new Date(1700000000000).toISOString())
  assert.equal(zaiReset(1700000000), new Date(1700000000000).toISOString())
  assert.equal(zaiReset(null), null)
})

test('minimaxPercent handles remaining counts, used counts, and percent', () => {
  assert.equal(minimaxPercent({ current_interval_total_count: 1000, current_interval_usage_count: 250 }), 75)
  assert.equal(minimaxPercent({ current_interval_remaining_percent: 30 }), 70)
  assert.equal(minimaxPercent({ current_interval_total_count: 100, current_interval_used_count: 25 }), 25)
  assert.equal(minimaxPercent({ current_interval_total_count: null, current_interval_usage_count: null }), undefined)
})

test('minimaxReset derives an ISO reset from end_time or remains_time', () => {
  assert.equal(minimaxReset({ end_time: 1700000000 }), new Date(1700000000000).toISOString())
  assert.equal(minimaxReset({ end_time: 1700000000000 }), new Date(1700000000000).toISOString())
  const derived = minimaxReset({ remains_time: 60_000 })
  assert.ok(typeof derived === 'string' && !Number.isNaN(Date.parse(derived)))
  assert.equal(minimaxReset({}), null)
})
