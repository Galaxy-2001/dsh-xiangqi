/**
 * dsh-xiangqi —— 中国象棋插件（Host 半）。
 *
 * 提供的扩展点：
 * - 模型工具 `xiangqi`：status / move / new / resign，模型执黑与用户对弈。
 * - 同源 HTTP RPC（/plugins/dsh-xiangqi/*）：棋盘 UI 读取局面、用户落子、
 *   开新局、认输。用户落子后通过 agent.followup 把“我走了一步”作为用户
 *   消息送进当前对话，从而唤醒模型走棋。
 */
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  BLACK,
  RED,
  applyMoveOnBoard,
  coordToRC,
  evaluateAfterMove,
  initialBoard,
  isInCheck,
  isLegalMove,
  legalMoves,
  pieceName,
  rcToCoord,
  renderBoardText,
  sideLabel,
} from './engine.js'

const RPC_PREFIX = '/plugins/dsh-xiangqi/'
const STATE_PATH = `${RPC_PREFIX}state`
const MOVE_PATH = `${RPC_PREFIX}move`
const NEW_PATH = `${RPC_PREFIX}new`
const RESIGN_PATH = `${RPC_PREFIX}resign`
const NUDGE_PATH = `${RPC_PREFIX}nudge`
const UNDO_PATH = `${RPC_PREFIX}undo`
const DIAG_PATH = `${RPC_PREFIX}diag`
const MAX_BODY_BYTES = 64 * 1024
// Host 进程里通常没有 DSH_HOME 环境变量，用 ~/.dsh 兜底。
const DSH_HOME_DIR = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const GAMES_DIR = path.join(DSH_HOME_DIR, 'xiangqi')
const GAMES_FILE = path.join(GAMES_DIR, 'games.json')

export const name = 'dsh-xiangqi'
export const inject = []

function createGame() {
  const now = Date.now()
  return {
    board: initialBoard(),
    turn: RED,
    status: 'playing',
    reason: null,
    lastMove: null,
    history: [],
    past: [],
    startedAt: now,
    updatedAt: now,
  }
}

function gameView(game) {
  const moves = game.status === 'playing' ? legalMoves(game.board, game.turn) : []
  return {
    board: game.board,
    turn: game.turn,
    status: game.status,
    reason: game.reason,
    check: game.status === 'playing' ? isInCheck(game.board, game.turn) : false,
    lastMove: game.lastMove,
    history: game.history,
    canUndo: Array.isArray(game.past) && game.past.length > 0,
    startedAt: game.startedAt,
    updatedAt: game.updatedAt,
    moves: moves.map((move) => ({
      from: rcToCoord(move.from.col, move.from.row),
      to: rcToCoord(move.to.col, move.to.row),
      fromRC: [move.from.col, move.from.row],
      toRC: [move.to.col, move.to.row],
    })),
  }
}

/** 落子前把当前局面压入悔棋栈。 */
function pushPast(game) {
  if (!Array.isArray(game.past)) game.past = []
  game.past.push({
    board: game.board,
    turn: game.turn,
    status: game.status,
    reason: game.reason,
    lastMove: game.lastMove,
    historyLength: game.history.length,
  })
  if (game.past.length > 400) game.past.shift()
}

/**
 * 回到“轮到用户（红方）走棋”的局面：
 * 当前轮黑（用户刚走完）撤 1 手；当前轮红（对手刚走完）撤 2 手。
 */
function undoMove(game, plies) {
  let undone = 0
  const limit = plies ?? (game.turn === RED ? 2 : 1)
  while (undone < limit && Array.isArray(game.past) && game.past.length > 0) {
    const snapshot = game.past.pop()
    game.board = snapshot.board
    game.turn = snapshot.turn
    game.status = 'playing'
    game.reason = null
    game.lastMove = snapshot.lastMove || null
    game.history.length = snapshot.historyLength
    undone += 1
    if (game.turn === RED) break
  }
  return undone
}

/** 旧数据没有 past 时，按 history 回放重建悔棋栈。 */
function rebuildPast(game) {
  if (Array.isArray(game.past) && game.past.length === game.history.length) return
  let board = initialBoard()
  const past = []
  for (let index = 0; index < game.history.length; index += 1) {
    const step = game.history[index]
    const fromRC = coordToRC(step.from)
    const toRC = coordToRC(step.to)
    if (!fromRC || !toRC) break
    past.push({
      board,
      turn: step.side === RED ? RED : BLACK,
      status: 'playing',
      reason: null,
      lastMove: null,
      historyLength: index,
    })
    board = applyMoveOnBoard(board, fromRC, toRC).board
  }
  game.past = past
}


function moveText(fromRC, toRC) {
  return `${rcToCoord(fromRC.col, fromRC.row)}-${rcToCoord(toRC.col, toRC.row)}`
}

function statusLine(game) {
  if (game.status === 'red-win') return '对局结束：用户（红方）获胜'
  if (game.status === 'black-win') return '对局结束：你（黑方）获胜'
  return game.turn === BLACK ? '现在轮到 你（黑方）走棋' : '现在轮到 用户（红方）走棋'
}

function legalMoveList(moves, limit = 80) {
  const list = moves.map((move) => rcToCoord(move.from.col, move.from.row) + rcToCoord(move.to.col, move.to.row))
  if (list.length <= limit) return list.join(', ')
  return `${list.slice(0, limit).join(', ')} ...（共 ${list.length} 个）`
}

/** 模型调用工具时看到的局面描述。 */
function describeStatus(game) {
  const lines = []
  lines.push('中国象棋 · 你执黑（盘面小写字母），用户执红（盘面大写字母）')
  lines.push(statusLine(game))
  if (game.status === 'playing' && isInCheck(game.board, game.turn)) lines.push('当前一方正被将军。')
  lines.push('坐标：列 a-i 从左到右，行 0-9 从下到上（0 是红方底线，9 是黑方底线）。')
  lines.push(renderBoardText(game.board))
  if (game.status !== 'playing') {
    lines.push('这盘棋已经结束。想再来一盘可以调用 action="new"。')
    return lines.join('\n')
  }
  if (game.turn !== BLACK) {
    lines.push('还没轮到你走棋，等用户（红方）在棋盘上走完这一步。')
    return lines.join('\n')
  }
  lines.push(`你的合法走法（共 ${legalMoves(game.board, BLACK).length} 个）：${legalMoveList(legalMoves(game.board, BLACK))}`)
  lines.push('用 action="move"、from 和 to 落子，例如 from="c9" to="c8"。')
  return lines.join('\n')
}

/** 用户在棋盘上落子后送给模型的那条用户消息。 */
function userMoveMessage(game, piece, captured, evaluation) {
  const parts = []
  const head = `【中国象棋】用户（红方）走：${pieceName(piece)} ${moveText(game.lastMove.from, game.lastMove.to)}`
  parts.push(captured ? `${head}，吃掉了你的${pieceName(captured)}。` : `${head}。`)
  if (game.status === 'red-win') {
    parts.push(
      evaluation.reason === 'checkmate'
        ? '你已经被将死，这盘用户获胜。请简短回应一句，不要再走棋。'
        : '你没有合法走法了（困毙），这盘用户获胜。请简短回应一句，不要再走棋。',
    )
  } else {
    parts.push('现在轮到你（黑方）走棋。请调用 xiangqi 工具：先用 action="status" 查看局面与你的合法走法，再用 action="move" 落子。')
    if (evaluation.check) parts.push('你正被将军，这一步必须应将。')
    parts.push('落子后用一两句话说明即可，不要长篇分析。')
  }
  return parts.join('')
}

function isLocalRequest(req) {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)) return false
  if (req.headers?.host) {
    try {
      const host = new URL(`http://${req.headers.host}`)
      if (host.username || host.password || !['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname)) return false
    } catch {
      return false
    }
  }
  if (!req.headers?.origin) return true
  try {
    const origin = new URL(req.headers.origin)
    return ['http:', 'https:'].includes(origin.protocol) && origin.host === req.headers.host
  } catch {
    return false
  }
}

async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('invalid JSON body')
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

export function apply(ctx) {
  /** sessionId -> game */
  const games = new Map()
  /** 右侧栏打开流程的诊断事件（最近 40 条）。 */
  const diagEvents = []

  // 从 DSH_HOME/xiangqi/games.json 恢复对局（插件重载或 DSH 重启后不丢局）。
  try {
    if (fs.existsSync(GAMES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf8'))
      for (const [sessionId, game] of Object.entries(parsed ?? {})) {
        if (!game || !Array.isArray(game.board) || game.board.length !== 10) continue
        if (!Array.isArray(game.history)) game.history = []
        rebuildPast(game)
        games.set(sessionId, game)
      }
    }
  } catch (error) {
    console.error('[dsh-xiangqi] 读取存档失败，从空对局开始:', error)
  }

  let persistTimer = null
  let disposed = false

  function persistNow() {
    persistTimer = null
    if (disposed) return
    try {
      fs.mkdirSync(GAMES_DIR, { recursive: true })
      const payload = JSON.stringify(Object.fromEntries(games))
      fs.writeFileSync(GAMES_FILE, payload)
    } catch (error) {
      console.error('[dsh-xiangqi] 保存对局失败:', error)
    }
  }

  function persist() {
    if (persistTimer) return
    persistTimer = setTimeout(persistNow, 150)
  }

  function gameOf(sessionId) {
    return games.get(sessionId)
  }

  function resetGame(sessionId) {
    const game = createGame()
    games.set(sessionId, game)
    persist()
    return game
  }

  ctx.effect(() => () => {
    disposed = true
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = null
    try {
      fs.mkdirSync(GAMES_DIR, { recursive: true })
      fs.writeFileSync(GAMES_FILE, JSON.stringify(Object.fromEntries(games)))
    } catch {}
  })

  /**
   * 把一条“用户消息”送进当前对话并唤醒模型。
   * 优先使用活跃 Agent 的 followup（下一回合）；会话已关闭时通过
   * sessionController 恢复 Agent 再投递。
   */
  async function wakeModel(sessionId, text) {
    try {
      let agent = ctx.get('agents')?.get?.(sessionId)
      if (!agent) {
        const controller = ctx.get('sessionController')
        const resolved = controller ? await controller.resolveAgent(sessionId) : undefined
        if (resolved && resolved.agent) agent = resolved.agent
      }
      if (!agent || typeof agent.followup !== 'function') {
        return { woken: false, error: '当前对话没有活跃的 Agent，无法自动唤醒' }
      }
      agent.followup({
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text }],
        source: { kind: 'user' },
      })
      return { woken: true, error: null }
    } catch (error) {
      return { woken: false, error: String(error?.message ?? error) }
    }
  }

  // ---------------------------------------------------------------- 模型工具
  ctx.inject(['tools'], (toolCtx) => {
    toolCtx.effect(() =>
      toolCtx.tools.register({
        name: 'xiangqi',
        description:
          '中国象棋对弈。用户（红方）在对话里的棋盘上走棋，你执黑方。' +
          '坐标：列 a-i 从左到右（红方视角），行 0-9 从下到上，0 是红方底线。走法用 from+to 表示，如 h0h2。' +
          '收到用户走棋后：先 action="status" 看盘面、轮到谁以及你全部合法走法，再 action="move" 落子。' +
          '每次只走一步；不要替用户走棋；不要声称自己看不到棋盘。' +
          'action="new" 重开一局；action="resign" 认输。落子后用一两句话说明即可。',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['status', 'move', 'new', 'resign'],
              description: 'status=查看局面（默认）；move=落子；new=重开一局；resign=认输。',
            },
            from: { type: 'string', description: '起点坐标，如 h0。action="move" 时必填。' },
            to: { type: 'string', description: '终点坐标，如 h2。action="move" 时必填。' },
            reason: { type: 'string', description: '认输或重开时的简短原因（可选）。' },
          },
          additionalProperties: false,
        },
        output: {
          schema: { type: 'string' },
          render(_args, value) {
            return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }]
          },
        },
        async execute(args, exec) {
          const sessionId = exec.agent?.id ?? ctx.get('agents')?.currentInitiator?.()?.id
          if (!sessionId) return '错误：无法确定当前对话（缺少 Agent 身份），不能读取棋盘。'
          const action = typeof args?.action === 'string' ? args.action : 'status'

          if (action === 'new') {
            resetGame(sessionId)
            return `新对局已开始：用户执红先走，你执黑。${describeStatus(gameOf(sessionId))}`
          }

          let game = gameOf(sessionId)
          if (!game) {
            game = resetGame(sessionId)
            if (action === 'status') return describeStatus(game)
          }

          if (action === 'status') return describeStatus(game)

          if (action === 'resign') {
            if (game.status !== 'playing') return '这盘棋已经结束，无法认输。'
            game.status = 'red-win'
            game.reason = 'resign'
            game.updatedAt = Date.now()
            persist()
            return `你（黑方）已认输，用户（红方）获胜。这盘棋结束。${args?.reason ? `（${String(args.reason)}）` : ''}`
          }

          if (action !== 'move') return `未知的 action："${String(action)}"。可用：status / move / new / resign。`
          if (game.status !== 'playing') return `对局已结束（${game.status}），请调用 action="new" 开新局。`
          if (game.turn !== BLACK) return '现在轮到用户（红方）走棋，还没轮到你。'

          const fromRC = coordToRC(args?.from)
          const toRC = coordToRC(args?.to)
          if (!fromRC || !toRC) return '坐标格式不对，应形如 "h0"、"c9"（a-i 列，0-9 行）。'
          const piece = game.board[fromRC.row]?.[fromRC.col]
          if (!piece || piece.s !== BLACK) return `起点 ${args.from} 上没有你的棋子。`
          if (!isLegalMove(game.board, fromRC, toRC, BLACK)) {
            return `走法 ${args.from}-${args.to} 不合法。请调用 action="status" 查看合法走法列表后重新选择。`
          }

          const { board, captured } = applyMoveOnBoard(game.board, fromRC, toRC)
          pushPast(game)
          game.board = board
          game.lastMove = { from: fromRC, to: toRC }
          game.turn = RED
          game.history.push({
            side: BLACK,
            from: rcToCoord(fromRC.col, fromRC.row),
            to: rcToCoord(toRC.col, toRC.row),
            capture: captured ? captured.t : null,
          })
          game.updatedAt = Date.now()
          const evaluation = evaluateAfterMove(game.board, BLACK)
          game.status = evaluation.status
          game.reason = evaluation.reason
          persist()

          const lines = [
            `你（黑方）走：${pieceName(piece)} ${moveText(fromRC, toRC)}${captured ? `，吃掉红方${pieceName(captured)}` : ''}。`,
          ]
          if (game.status === 'black-win') {
            lines.push(
              evaluation.reason === 'checkmate'
                ? '用户（红方）已被将死，你这盘获胜。棋局结束。'
                : '用户（红方）没有合法走法（困毙），你这盘获胜。棋局结束。',
            )
          } else {
            lines.push(evaluation.check ? '将军！现在轮到用户（红方）走棋。' : '现在轮到用户（红方）走棋。')
            lines.push('把这一步简短告诉用户，等用户在棋盘上落子。')
          }
          lines.push(renderBoardText(game.board))
          return lines.join('\n')
        },
      }),
    )
  })

  // ---------------------------------------------------------------- HTTP RPC
  ctx.inject(['webServer'], (httpCtx) => {
    const handler = async (req, res) => {
      try {
        if (!isLocalRequest(req)) return sendJson(res, 403, { ok: false, error: 'forbidden' })
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const path = url.pathname
        const method = req.method ?? 'GET'

        if (path === DIAG_PATH) {
          if (method === 'GET') return sendJson(res, 200, { ok: true, events: diagEvents })
          const diagBody = await readJsonBody(req)
          diagEvents.push(Object.assign({ at: Date.now() }, diagBody))
          if (diagEvents.length > 40) diagEvents.splice(0, diagEvents.length - 40)
          return sendJson(res, 200, { ok: true })
        }

        if (path === STATE_PATH && method === 'GET') {
          const sessionId = url.searchParams.get('sessionId') ?? ''
          if (!sessionId || sessionId.length > 200) return sendJson(res, 400, { ok: false, error: '缺少 sessionId' })
          const game = gameOf(sessionId)
          return sendJson(res, 200, { ok: true, game: game ? gameView(game) : null })
        }

        const body = method === 'POST' ? await readJsonBody(req) : {}
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
        if (!sessionId || sessionId.length > 200) return sendJson(res, 400, { ok: false, error: '缺少 sessionId' })

        if (path === NEW_PATH && method === 'POST') {
          const game = resetGame(sessionId)
          let wake = { woken: false, error: null }
          if (body.announce !== false) {
            wake = await wakeModel(
              sessionId,
              '【中国象棋】用户开了一盘新棋：用户执红先走，你执黑。等用户在棋盘上走第一步后轮到你。请简短回应一句（不要调用工具，不用长分析）。',
            )
          }
          return sendJson(res, 200, { ok: true, game: gameView(game), woken: wake.woken, wakeError: wake.error })
        }

        if (path === MOVE_PATH && method === 'POST') {
          const fromRC = coordToRC(body.from)
          const toRC = coordToRC(body.to)
          if (!fromRC || !toRC) return sendJson(res, 400, { ok: false, error: '坐标格式不对' })
          let game = gameOf(sessionId)
          if (!game) game = resetGame(sessionId)
          if (game.status !== 'playing') return sendJson(res, 409, { ok: false, error: '这盘棋已经结束，可以开新局。' })
          if (game.turn !== RED) return sendJson(res, 409, { ok: false, error: '还没轮到你走棋。' })
          const piece = game.board[fromRC.row]?.[fromRC.col]
          if (!piece || piece.s !== RED) return sendJson(res, 400, { ok: false, error: '起点上没有你的棋子。' })
          if (!isLegalMove(game.board, fromRC, toRC, RED)) {
            return sendJson(res, 400, { ok: false, error: '这一步不合规则（或会送将）。' })
          }

          const { board, captured } = applyMoveOnBoard(game.board, fromRC, toRC)
          pushPast(game)
          game.board = board
          game.lastMove = { from: fromRC, to: toRC }
          game.turn = BLACK
          game.history.push({
            side: RED,
            from: rcToCoord(fromRC.col, fromRC.row),
            to: rcToCoord(toRC.col, toRC.row),
            capture: captured ? captured.t : null,
          })
          game.updatedAt = Date.now()
          const evaluation = evaluateAfterMove(game.board, RED)
          game.status = evaluation.status
          game.reason = evaluation.reason
          persist()

          const text = userMoveMessage(game, piece, captured, evaluation)
          const wake = await wakeModel(sessionId, text)
          return sendJson(res, 200, { ok: true, game: gameView(game), woken: wake.woken, wakeError: wake.error })
        }

        if (path === UNDO_PATH && method === 'POST') {
          const game = gameOf(sessionId)
          if (!game) return sendJson(res, 409, { ok: false, error: '当前还没有对局。' })
          const canUndo = Array.isArray(game.past) && game.past.length > 0
          if (!canUndo) return sendJson(res, 409, { ok: false, error: '没有可以悔的棋了。' })
          const undone = undoMove(game)
          game.updatedAt = Date.now()
          persist()
          return sendJson(res, 200, { ok: true, game: gameView(game), undone })
        }

        if (path === RESIGN_PATH && method === 'POST') {
          const game = gameOf(sessionId)
          if (!game || game.status !== 'playing') return sendJson(res, 409, { ok: false, error: '当前没有进行中的对局。' })
          game.status = 'black-win'
          game.reason = 'resign'
          game.updatedAt = Date.now()
          persist()
          const wake = await wakeModel(
            sessionId,
            '【中国象棋】用户（红方）认输了，你（黑方）获胜，这盘棋结束。请简短回应一句。',
          )
          return sendJson(res, 200, { ok: true, game: gameView(game), woken: wake.woken, wakeError: wake.error })
        }

        if (path === NUDGE_PATH && method === 'POST') {
          const game = gameOf(sessionId)
          if (!game || game.status !== 'playing') return sendJson(res, 409, { ok: false, error: '当前没有进行中的对局。' })
          if (game.turn !== BLACK) return sendJson(res, 409, { ok: false, error: '现在轮不到对手走棋。' })
          const wake = await wakeModel(
            sessionId,
            '【中国象棋】轮到你了（黑方）：请调用 xiangqi 工具，用 action="status" 查看局面和你的合法走法，然后 action="move" 落子。',
          )
          return sendJson(res, 200, { ok: true, game: gameView(game), woken: wake.woken, wakeError: wake.error })
        }

        return sendJson(res, 404, { ok: false, error: 'unknown endpoint' })
      } catch (error) {
        return sendJson(res, 500, { ok: false, error: String(error?.message ?? error) })
      }
    }
    for (const path of [STATE_PATH, MOVE_PATH, NEW_PATH, RESIGN_PATH, NUDGE_PATH, UNDO_PATH, DIAG_PATH]) {
      httpCtx.effect(
        () => httpCtx.webServer.register({ kind: 'exact', path, handler }),
        `dsh-xiangqi: ${path}`,
      )
    }
  })
}
