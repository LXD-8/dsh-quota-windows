import test from 'node:test'
import assert from 'node:assert/strict'
import { trusted } from '../index.js'

const ctx = { webServer: { getOrigin: () => 'http://127.0.0.1:65263' } }

test('loopback and IP hosts pass', () => {
  assert.equal(trusted(ctx, { headers: { host: '127.0.0.1:65263' } }, {}), true)
  assert.equal(trusted(ctx, { headers: { host: 'localhost:65263' } }, {}), true)
  assert.equal(trusted(ctx, { headers: { host: '192.168.1.20:65263' } }, {}), true)
})

test('DNS-rebinding style hosts are rejected', () => {
  assert.equal(trusted(ctx, { headers: { host: 'evil.example' } }, {}), false)
  assert.equal(trusted(ctx, { headers: { host: 'evil.example', origin: 'http://evil.example' } }, {}), false)
})

test('cross-origin requests are rejected even on loopback', () => {
  assert.equal(trusted(ctx, { headers: { host: '127.0.0.1:65263', origin: 'http://evil.example' } }, {}), false)
})

test('configured allowed hosts pass, others do not', () => {
  const config = { allowedHosts: ['quota.example.com'] }
  assert.equal(trusted(ctx, { headers: { host: 'quota.example.com' } }, config), true)
  assert.equal(trusted(ctx, { headers: { host: 'other.example.com' } }, config), false)
})
