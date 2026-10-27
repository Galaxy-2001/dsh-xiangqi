import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

// Exercise the real state hook with controlled fetch completion order. No DSH
// process, account, network request or user's game save is used by these tests.
const file = process.env.XIANGQI_CLIENT_SOURCE || new URL('./client.js', import.meta.url)
const source = fs.readFileSync(file, 'utf8')
const start = source.indexOf('    function useGameState(')
const end = source.indexOf('    // 当前选中的对话', start)
assert.ok(start >= 0 && end > start, 'state hook must exist')

function harness(initialSession = 'A') {
  const slots = [], pendingEffects = [], requests = []
  let cursor = 0, dirty = false, session = initialSession, result
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const React = {
    useState(initial) {
      const i = cursor++
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }
      return [slots[i].value, value => {
        const next = typeof value === 'function' ? value(slots[i].value) : value
        if (!Object.is(slots[i].value, next)) { slots[i].value = next; dirty = true }
      }]
    },
    useRef(value) {
      const i = cursor++
      if (!slots[i]) slots[i] = { ref: { current: value } }
      return slots[i].ref
    },
    useMemo(factory, deps) {
      const i = cursor++
      if (!slots[i] || !sameDeps(slots[i].deps, deps)) slots[i] = { deps, value: factory() }
      return slots[i].value
    },
    useCallback(fn, deps) { return React.useMemo(() => fn, deps) },
    useEffect(fn, deps) {
      const i = cursor++
      if (!slots[i] || !sameDeps(slots[i].deps, deps)) {
        const cleanup = slots[i]?.cleanup
        slots[i] = { deps, cleanup }
        pendingEffects.push(() => { cleanup?.(); slots[i].cleanup = fn() })
      }
    },
  }
  const hook = vm.runInNewContext('(' + source.slice(start, end).trim() + ')', {
    React, RPC: '/plugins/dsh-xiangqi', translate: key => key,
    document: { hidden: false }, setInterval: () => 1, clearInterval: () => {},
    fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })),
  })
  function render(nextSession = session) {
    session = nextSession
    let limit = 30
    do {
      dirty = false; cursor = 0
      result = hook(session, 1200)
      pendingEffects.splice(0).forEach(fn => fn())
      if (--limit === 0) throw new Error('hook did not settle')
    } while (dirty)
    return result
  }
  async function settle() {
    for (let i = 0; i < 8; i++) { await Promise.resolve(); if (dirty) render() }
  }
  async function respond(index, game, status = 200) {
    assert.ok(requests[index], 'expected request ' + index)
    requests[index].resolve({ ok: status === 200, status, json: async () => ({ ok: status === 200, game, error: 'request failed' }) })
    await settle()
  }
  render()
  return { render, settle, respond, requests, get current() { return result },
    unmount() { slots.forEach(slot => slot.cleanup?.()) } }
}

const game = label => ({ label, turn: 'red', status: 'playing', moves: [] })

test('switching to a session without a game clears the previous board', async () => {
  const h = harness()
  await h.respond(0, game('A'))
  assert.equal(h.current.state.game.label, 'A')
  h.render('B')
  await h.respond(1, null)
  assert.equal(h.current.state.game, null)
})

test('a delayed previous-session poll cannot replace the current board', async () => {
  const h = harness()
  h.render('B')
  await h.respond(1, game('B'))
  await h.respond(0, game('A'))
  assert.equal(h.current.state.game.label, 'B')
})

test('A to B to A ignores the first A request', async () => {
  const h = harness()
  h.render('B'); h.render('A')
  await h.respond(2, game('new A'))
  await h.respond(0, game('old A'))
  assert.equal(h.current.state.game.label, 'new A')
})

test('a poll started before a move cannot roll back its result', async () => {
  const h = harness()
  await h.respond(0, game('before'))
  const reading = h.current.refresh()
  const moving = h.current.rpc('/move', { from: 'h2', to: 'e2' })
  await h.respond(2, game('after'))
  await moving
  await h.respond(1, game('before'))
  await reading; await h.settle()
  assert.equal(h.current.state.game.label, 'after')
  assert.equal(h.current.busy, false)
})

test('a delayed move response cannot enter a different session', async () => {
  const h = harness()
  await h.respond(0, game('A'))
  const moving = h.current.rpc('/move', { from: 'h2', to: 'e2' })
  h.render('B')
  await h.respond(2, game('B'))
  await h.respond(1, game('A after move'))
  await moving; await h.settle()
  assert.equal(h.current.state.game.label, 'B')
})

test('duplicate mutation requests are rejected while one is pending', async () => {
  const h = harness()
  await h.respond(0, game('A'))
  const moving = h.current.rpc('/move', { from: 'h2', to: 'e2' })
  const duplicate = h.current.rpc('/move', { from: 'h2', to: 'e2' })
  assert.equal(h.requests.filter(r => r.options?.method === 'POST').length, 1)
  assert.equal(await duplicate, null)
  await h.respond(1, game('moved')); await moving
})

test('an empty session has no board and sends no requests', async () => {
  const h = harness('')
  assert.equal(h.current.state.game, null)
  assert.equal(h.requests.length, 0)
  assert.equal(await h.current.rpc('/new'), null)
})
