/**
 * dsh-xiangqi —— 中国象棋插件（Client 半）。
 *
 * 落点：
 * - 左侧栏面板列表（`sidebar.panellist`）里「插件 / 插件市场 / 自动化任务」
 *   下面多一个「中国象棋」入口；
 * - 点击后主区域（`main` keyed slot）切换到象棋页面，不影响聊天区的常驻布局。
 *
 * 棋盘数据来自 Host 半的 `/plugins/dsh-xiangqi/*` 同源 HTTP 接口；用户走棋
 * 后 Host 会把这一步作为用户消息送进当前对话，唤醒模型执黑应招。
 */

window.__ModuleLoader__.load({
  id: 'dsh-xiangqi',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const RPC = '/plugins/dsh-xiangqi'
    const PANEL_KEY = 'xiangqi'
    const TAB_KIND = 'xiangqi'
    const TAB_ID = 'dsh-xiangqi'
    const MAIN_METRICS = { cell: 44, pad: 26 }
    const RAIL_METRICS = { cell: 30, pad: 16 }

    const GLYPHS = {
      K: { red: '帅', black: '将' },
      A: { red: '仕', black: '士' },
      B: { red: '相', black: '象' },
      N: { red: '马', black: '马' },
      R: { red: '车', black: '车' },
      C: { red: '炮', black: '炮' },
      P: { red: '兵', black: '卒' },
    }

    let translate = function (key) { return key }
    // 由 apply 赋值的桥接函数：组件直接用模块级引用，不依赖 slot 注入时序。
    let openBoardFn = function () { return false }
    let backToChatFn = function () { return false }
    let debugStatus = ''

    /** 当前选中的对话 id（uiSession 的就绪状态由 apply 维护）。 */
    function sessionOf() {
      try {
        const current = uiSessionService && uiSessionService.adapter && uiSessionService.adapter.current
        if (current && typeof current.getSnapshot === 'function') {
          const snap = current.getSnapshot()
          return (snap && (snap.key || snap.sessionId)) || ''
        }
      } catch {}
      return ''
    }

    /** 把右侧栏打开流程的关键结果回传到 Host，便于定位问题。 */
    function postDiag(payload) {
      try {
        fetch(RPC + '/diag', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(Object.assign({ ua: typeof navigator !== 'undefined' ? navigator.userAgent : '' }, payload || {})),
        }).catch(function () {})
      } catch {}
    }

    function openBoardInSidebar() {
      backToChatFn()
      setTimeout(function () { openBoardFn() }, 300)
    }

    const ZH = {
      title: '中国象棋',
      subtitle: '与当前对话对弈',
      start: '开始对局',
      openBoard: '右侧栏常驻',
      backToChat: '返回对话',
      redirecting: '正在把棋盘放进右侧栏…',
      redirectFailed: '右侧栏没打开，可以先在这里下，或点「右侧栏常驻」重试',
      restart: '重新开局',
      resign: '认输',
      undo: '悔棋',
      nudge: '提醒对手',
      idle: '点「开始对局」，与当前对话下一盘象棋',
      noSession: '先打开一个对话，再回来这里下棋',
      yourTurn: '轮到你（红方）走棋',
      thinking: '对手（黑方）思考中…',
      check: '被将军！',
      youWin: '你赢了',
      youLose: '你输了',
      opponentResigned: '对手认输',
      moveHint: '点选你的红棋，再点目标位置',
      youResigned: '你已认输',
      noAgent: '已走棋，但当前对话没有活跃 Agent，无法自动唤醒对手',
      error: '操作失败',
      history: '着法',
    }
    const EN = {
      title: 'Chinese Chess',
      subtitle: 'Play against this conversation',
      start: 'Start game',
      openBoard: 'Dock in sidebar',
      backToChat: 'Back to chat',
      redirecting: 'Moving the board to the right sidebar…',
      redirectFailed: 'Right sidebar did not open; play here or try "Dock in sidebar"',
      restart: 'Restart',
      resign: 'Resign',
      undo: 'Undo',
      nudge: 'Nudge',
      idle: 'Start a game against this conversation',
      noSession: 'Open a conversation first, then come back to play',
      yourTurn: 'Your move (Red)',
      thinking: 'Opponent (Black) is thinking…',
      check: 'Check!',
      youWin: 'You win',
      youLose: 'You lose',
      opponentResigned: 'Opponent resigned',
      moveHint: 'Pick a Red piece, then a target point',
      youResigned: 'You resigned',
      noAgent: 'Move saved, but no live agent to wake the opponent',
      error: 'Action failed',
      history: 'Moves',
    }

    const CSS = [
      '.xq-page{display:flex;flex-direction:column;align-items:center;width:100%;height:100%;overflow:auto;padding:22px 18px 30px;box-sizing:border-box;gap:12px;background:var(--dsw-alias-bg-base)}',
      '.xq-head{display:flex;align-items:center;gap:10px;width:100%;max-width:620px;padding:8px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-sizing:border-box}',
      '.xq-title{font-weight:650;font-size:14px;color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.xq-sub{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.xq-status{flex:1;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}',
      '.xq-status.win{color:var(--dsw-alias-state-success-primary)}',
      '.xq-status.lose{color:var(--dsw-alias-state-error-primary)}',
      '.xq-status.err{color:var(--dsw-alias-state-error-primary)}',
      '.xq-rail{display:flex;flex-direction:column;width:100%;padding:10px 8px 14px;box-sizing:border-box;gap:8px;background:var(--dsw-alias-bg-base)}',
      '.xq-railhead{display:flex;align-items:center;gap:8px}',
      '.xq-rail .xq-status{text-align:left}',
      '.xq-boardwrap{display:flex;justify-content:center;width:100%}',
      '.xq-board{--xq-duration:240ms;--xq-rest-shadow:0 2px 0 #987044,0 3px 0 #795333,0 5px 6px rgba(57,31,12,.35),inset 0 2px 2px #fff9e8,inset 0 -2px 3px #bb945f;--xq-lift-shadow:0 2px 0 #987044,0 3px 0 #795333,0 10px 12px rgba(57,31,12,.42),inset 0 2px 2px #fff9e8,inset 0 -2px 3px #bb945f;position:relative;isolation:isolate;width:calc(var(--xq-pad)*2 + var(--xq-cell)*8);height:calc(var(--xq-pad)*2 + var(--xq-cell)*9);background:repeating-linear-gradient(3deg,transparent 0 5px,rgba(113,65,24,.045) 6px,transparent 8px 15px),repeating-linear-gradient(94deg,transparent 0 31px,rgba(255,244,211,.18) 32px,transparent 36px 73px),radial-gradient(ellipse at 30% 15%,#f8e7c3,transparent 75%),linear-gradient(120deg,#e6c48b,#d9af73);border-radius:10px;box-shadow:inset 0 0 0 2px #9d6c3e,inset 0 0 0 5px rgba(255,231,181,.5),inset 0 5px 12px rgba(79,43,17,.24),0 4px 0 #8b603b,0 10px 24px rgba(0,0,0,.2);flex:none}',
      '.xq-grid{position:absolute;z-index:1;left:calc(var(--xq-pad) - var(--xq-cell)/2);top:calc(var(--xq-pad) - var(--xq-cell)/2);display:grid;grid-template-columns:repeat(9,var(--xq-cell));grid-template-rows:repeat(10,var(--xq-cell))}',
      '.xq-cell,.xq-piece-slot{box-sizing:border-box;width:var(--xq-cell);height:var(--xq-cell);margin:0;padding:0;border:0;background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;appearance:none;touch-action:manipulation}',
      '.xq-cell{position:relative}',
      '.xq-cell:disabled,.xq-piece-slot:disabled{cursor:default;opacity:1}',
      '.xq-pieces{position:absolute;inset:0;z-index:2;pointer-events:none}',
      '.xq-piece-slot{position:absolute;left:calc(var(--xq-pad) - var(--xq-cell)/2);top:calc(var(--xq-pad) - var(--xq-cell)/2);width:var(--xq-cell);height:var(--xq-cell);display:flex;align-items:center;justify-content:center;padding:0;border:0;background:transparent;transition:transform var(--xq-duration) cubic-bezier(.2,.75,.25,1);pointer-events:auto;z-index:1}',
      '.xq-piece-slot.moving{z-index:3;will-change:transform}',
      '.xq-piece-slot.sel{z-index:4}',
      '.xq-piece-slot.captured{z-index:0;pointer-events:none}',
      '.xq-piece{box-sizing:border-box;position:relative;width:calc(var(--xq-cell) - 6px);height:calc(var(--xq-cell) - 6px);border-radius:50%;display:flex;align-items:center;justify-content:center;line-height:1;font-family:KaiTi,STKaiti,"Songti SC",SimSun,serif;font-size:calc(var(--xq-cell) * .47);font-weight:700;background:radial-gradient(circle at 30% 22%,#fffef3 0,#f9e9c8 45%,#e4c18a 80%,#c49a61 100%);border:1px solid #b48b54;box-shadow:var(--xq-rest-shadow);text-shadow:0 1px 0 #fff7dd,0 -1px 0 rgba(71,30,12,.18);user-select:none;pointer-events:none}',
      '.xq-piece:before{content:"";position:absolute;inset:2px;border:1px solid currentColor;border-radius:50%;opacity:.5;box-shadow:0 1px 0 rgba(255,255,255,.65),inset 0 1px 1px rgba(97,56,22,.12)}',
      '.xq-piece.red{color:#ad2920}',
      '.xq-piece.black{color:#30302c}',
      '.xq-piece-slot.sel .xq-piece{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.xq-cell.target .xq-dot{position:absolute;width:calc(var(--xq-cell) * .23);height:calc(var(--xq-cell) * .23);border-radius:50%;background:var(--dsw-alias-brand-primary);opacity:.65;box-shadow:0 0 0 3px rgba(255,249,226,.6);pointer-events:none}',
      '.xq-piece-slot.target .xq-piece:after{content:"";position:absolute;inset:-3px;border:2px dashed var(--dsw-alias-brand-primary);border-radius:50%}',
      '.xq-cell.last:after{content:"";position:absolute;inset:2px;border:2px solid #c48724;border-radius:5px;opacity:.8;pointer-events:none}',
      '.xq-piece-slot.moving .xq-piece{animation:xq-lift var(--xq-duration) ease-out both}',
      '.xq-piece-slot.captured .xq-piece{animation:xq-capture 180ms ease-in forwards}',
      '@keyframes xq-lift{0%,100%{transform:translateY(0) scale(1);box-shadow:var(--xq-rest-shadow)}35%{transform:translateY(-3px) scale(1.07);box-shadow:var(--xq-lift-shadow)}80%{transform:translateY(1px) scale(.98);box-shadow:var(--xq-rest-shadow)}}',
      '@keyframes xq-capture{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.65)}}',
      '@media(prefers-reduced-motion:reduce){.xq-piece-slot{transition:none}.xq-piece-slot.moving .xq-piece{animation:none}.xq-piece-slot.captured .xq-piece{animation:none;opacity:0}}',
      '.xq-foot{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center}',
      '.xq-btn{font-size:12px;padding:4px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap}',
      '.xq-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.xq-btn:disabled{opacity:.5;cursor:default}',
      '.xq-btn.primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.xq-hint{font-size:12px;line-height:18px;min-height:18px;text-align:center;color:var(--dsw-alias-label-secondary)}',
      '.xq-hint.err{color:var(--dsw-alias-state-error-primary)}',
      '.xq-moves{font-size:11px;line-height:16px;min-height:16px;text-align:center;color:var(--dsw-alias-label-secondary);max-width:620px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.xq-icon{display:block}',
    ].join('\n')

    function samePoint(a, b) {
      return Boolean(a && b && a.col === b.col && a.row === b.row)
    }

    function glyphOf(piece) {
      return piece ? (GLYPHS[piece.t] && GLYPHS[piece.t][piece.s]) || piece.t : ''
    }

    function statusSummary(game, t, error) {
      if (error) return { text: error, tone: 'err' }
      if (!game) return { text: t('idle'), tone: '' }
      if (game.status === 'red-win') {
        return { text: t('youWin') + (game.reason === 'resign' ? ' · ' + t('opponentResigned') : ''), tone: 'win' }
      }
      if (game.status === 'black-win') {
        return { text: game.reason === 'resign' ? t('youResigned') : t('youLose'), tone: 'lose' }
      }
      if (game.turn === 'red') return { text: game.check ? t('yourTurn') + ' · ' + t('check') : t('yourTurn'), tone: '' }
      return { text: t('thinking'), tone: '' }
    }

    function BoardLines(props) {
      const m = props.metrics
      const x = (col) => m.pad + col * m.cell
      const y = (row) => m.pad + (9 - row) * m.cell
      const width = m.pad * 2 + m.cell * 8
      const height = m.pad * 2 + m.cell * 9
      const parts = []
      for (let col = 0; col < 9; col += 1) {
        const xx = x(col)
        if (col === 0 || col === 8) {
          parts.push(h('line', { key: 'v' + col, x1: xx, y1: y(9), x2: xx, y2: y(0), stroke: '#a5824f', strokeWidth: 1.6 }))
        } else {
          parts.push(h('line', { key: 'vu' + col, x1: xx, y1: y(9), x2: xx, y2: y(5), stroke: '#a5824f', strokeWidth: 1 }))
          parts.push(h('line', { key: 'vd' + col, x1: xx, y1: y(4), x2: xx, y2: y(0), stroke: '#a5824f', strokeWidth: 1 }))
        }
      }
      for (let row = 0; row < 10; row += 1) {
        parts.push(h('line', {
          key: 'h' + row,
          x1: x(0),
          y1: y(row),
          x2: x(8),
          y2: y(row),
          stroke: '#a5824f',
          strokeWidth: row === 0 || row === 9 ? 1.6 : 1,
        }))
      }
      parts.push(h('line', { key: 'p1', x1: x(3), y1: y(0), x2: x(5), y2: y(2), stroke: '#a5824f', strokeWidth: 1 }))
      parts.push(h('line', { key: 'p2', x1: x(5), y1: y(0), x2: x(3), y2: y(2), stroke: '#a5824f', strokeWidth: 1 }))
      parts.push(h('line', { key: 'p3', x1: x(3), y1: y(9), x2: x(5), y2: y(7), stroke: '#a5824f', strokeWidth: 1 }))
      parts.push(h('line', { key: 'p4', x1: x(5), y1: y(9), x2: x(3), y2: y(7), stroke: '#a5824f', strokeWidth: 1 }))
      const riverY = (y(4) + y(5)) / 2 + 5
      parts.push(h('text', { key: 'r1', x: x(2), y: riverY, textAnchor: 'middle', fontSize: 13, fill: '#a5824f', letterSpacing: 5, fontFamily: 'serif' }, '楚 河'))
      parts.push(h('text', { key: 'r2', x: x(6), y: riverY, textAnchor: 'middle', fontSize: 13, fill: '#a5824f', letterSpacing: 5, fontFamily: 'serif' }, '汉 界'))
      return h('svg', { width: width, height: height, viewBox: '0 0 ' + width + ' ' + height, 'aria-hidden': true, style: { position: 'absolute', left: 0, top: 0 } }, parts)
    }

    // Host pieces have no IDs. Reverse the history for surviving pieces to recover
    // their original squares, so identical pieces keep distinct DOM nodes across polls/undo.
    function boardPieces(game) {
      const pieces = []
      const origins = new Map()
      for (let row = 9; row >= 0; row -= 1) {
        for (let col = 0; col < 9; col += 1) {
          const piece = game && game.board && game.board[row] && game.board[row][col]
          if (!piece) continue
          const square = String.fromCharCode(97 + col) + row
          const item = { id: square, col: col, row: row, t: piece.t, s: piece.s }
          pieces.push(item)
          origins.set(square, item)
        }
      }
      const history = (game && game.history) || []
      for (let index = history.length - 1; index >= 0; index -= 1) {
        const step = history[index]
        const item = origins.get(step.to)
        if (!item || item.s !== step.side) continue
        origins.delete(step.to)
        origins.set(step.from, item)
        item.id = step.from
      }
      return pieces.map(function (piece) {
        return Object.assign({}, piece, { id: piece.s + '-' + piece.t + '-' + piece.id })
      })
    }

    function useBoardPieces(game) {
      const targets = React.useMemo(function () { return boardPieces(game) }, [game])
      const [pieces, setPieces] = React.useState(targets)

      React.useLayoutEffect(function () {
        setPieces(function (previous) {
          const oldById = new Map(previous.map(function (piece) { return [piece.id, piece] }))
          const next = targets.map(function (target) {
            const old = oldById.get(target.id)
            oldById.delete(target.id)
            if (old && !old.exiting && samePoint(old, target)) return old
            return Object.assign({}, target, {
              moving: Boolean(old && !old.exiting && !samePoint(old, target)),
              exiting: false,
            })
          })
          // These ghosts are visual only; rules and click targets use the latest game.
          oldById.forEach(function (old) {
            next.push(old.exiting ? old : Object.assign({}, old, { exiting: true, moving: false }))
          })
          return next.length === previous.length && next.every(function (piece, index) {
            return piece === previous[index]
          }) ? previous : next
        })
      }, [targets])

      React.useEffect(function () {
        if (!pieces.some(function (piece) { return piece.moving || piece.exiting })) return
        // Also cleans up if animationend is skipped (hidden tab or reduced motion).
        const timer = setTimeout(function () {
          setPieces(function (current) {
            if (current !== pieces) return current
            return current.filter(function (piece) { return !piece.exiting }).map(function (piece) {
              return piece.moving ? Object.assign({}, piece, { moving: false }) : piece
            })
          })
        }, 280)
        return function () { clearTimeout(timer) }
      }, [pieces])

      return pieces
    }

    function Board(props) {
      const game = props.game
      const moves = props.moves || []
      const selected = props.selected
      const m = props.metrics
      const pieces = useBoardPieces(game)
      const playing = Boolean(game && game.status === 'playing' && game.turn === 'red' && !props.busy)
      const targets = {}
      if (selected) {
        for (const move of moves) {
          if (move.fromRC[0] === selected.col && move.fromRC[1] === selected.row) {
            targets[move.toRC[0] + ',' + move.toRC[1]] = true
          }
        }
      }
      const cells = []
      for (let row = 9; row >= 0; row -= 1) {
        for (let col = 0; col < 9; col += 1) {
          const piece = game && game.board && game.board[row] ? game.board[row][col] : null
          const isTarget = Boolean(targets[col + ',' + row])
          const last = game && game.lastMove
          const isLast = Boolean(last && (samePoint(last.from, { col: col, row: row }) || samePoint(last.to, { col: col, row: row })))
          cells.push(
            h('button', {
              key: col + ',' + row,
              type: 'button',
              className: 'xq-cell' + (isTarget ? ' target' : '') + (isLast ? ' last' : ''),
              onClick: function () { props.onCell(col, row) },
              disabled: !playing || !isTarget || Boolean(piece),
              tabIndex: -1,
              'aria-hidden': Boolean(piece),
              'aria-label': String.fromCharCode(97 + col) + row,
            },
              isTarget && !piece ? h('span', { key: 'dot', className: 'xq-dot' }) : null,
            ),
          )
        }
      }
      const sprites = pieces.map(function (piece) {
        const isSelected = !piece.exiting && samePoint(selected, piece)
        const isTarget = !piece.exiting && Boolean(targets[piece.col + ',' + piece.row])
        return h('button', {
          key: piece.id,
          type: 'button',
          className: 'xq-piece-slot' + (piece.moving ? ' moving' : '') + (piece.exiting ? ' captured' : '') + (isSelected ? ' sel' : '') + (isTarget ? ' target' : ''),
          // Same cell-sized box and origin as the grid. Its hit area travels with
          // the piece; clicking mid-flight still addresses its authoritative square.
          style: { transform: 'translate(' + (piece.col * m.cell) + 'px, ' + ((9 - piece.row) * m.cell) + 'px)' },
          onClick: function () { if (!piece.exiting) props.onCell(piece.col, piece.row) },
          disabled: Boolean(piece.exiting || !playing || (!isTarget && piece.s !== 'red')),
          tabIndex: -1,
          'aria-hidden': Boolean(piece.exiting),
          'aria-label': glyphOf(piece) + ' ' + String.fromCharCode(97 + piece.col) + piece.row,
        },
          h('span', {
            // Restart only the face's lift on consecutive moves; the translating
            // outer node retains its key, so an interrupted transition stays smooth.
            key: piece.col + ',' + piece.row + (piece.exiting ? ':out' : ''),
            className: 'xq-piece ' + piece.s,
          }, glyphOf(piece)),
        )
      })
      return h('div', { className: 'xq-board', style: { '--xq-cell': m.cell + 'px', '--xq-pad': m.pad + 'px' } },
        h(BoardLines, { key: 'lines', metrics: m }),
        h('div', { key: 'grid', className: 'xq-grid' }, cells),
        h('div', { key: 'pieces', className: 'xq-pieces' }, sprites),
      )
    }

    /** 共用状态：拉取局面、走棋、悔棋、开局、认输。 */
    function useGameState(sessionId, pollMs) {
      const [state, setState] = React.useState({ sessionId: sessionId, game: null, moves: [] })
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [selected, setSelected] = React.useState(null)
      const lastJson = React.useRef(null)
      const mounted = React.useRef(true)
      // A new object also distinguishes A -> B -> A from the original A request.
      const scope = React.useMemo(function () {
        return { serial: 0, reading: false, mutating: false }
      }, [sessionId])
      const currentScope = React.useRef(scope)
      currentScope.current = scope

      function isCurrent() {
        return mounted.current && currentScope.current === scope
      }

      React.useEffect(function () {
        mounted.current = true
        return function () { mounted.current = false }
      }, [])

      const refresh = React.useCallback(async function () {
        if (!sessionId || !isCurrent() || scope.reading || scope.mutating) return
        scope.reading = true
        const serial = ++scope.serial
        try {
          const res = await fetch(RPC + '/state?sessionId=' + encodeURIComponent(sessionId), { cache: 'no-store' })
          const data = await res.json().catch(function () { return null })
          if (!res.ok || !data || !data.ok) return
          if (!isCurrent() || serial !== scope.serial) return
          const key = data.game ? JSON.stringify(data.game) : ''
          if (key === lastJson.current) return
          lastJson.current = key
          setState({ sessionId: sessionId, game: data.game, moves: data.game ? data.game.moves : [] })
        } catch {} finally {
          scope.reading = false
        }
      }, [sessionId, scope])

      React.useEffect(function () {
        setSelected(null)
        setError('')
        setBusy(false)
        setState({ sessionId: sessionId, game: null, moves: [] })
        lastJson.current = null
      }, [sessionId])

      React.useEffect(function () {
        refresh()
        const timer = setInterval(function () {
          if (typeof document !== 'undefined' && document.hidden) return
          refresh()
        }, pollMs)
        return function () { clearInterval(timer) }
      }, [refresh, pollMs])

      async function rpc(path, body) {
        if (!sessionId || !isCurrent() || scope.mutating) return null
        scope.mutating = true
        // Poll responses started before a move must not replace its result.
        scope.serial += 1
        setBusy(true)
        setError('')
        try {
          const res = await fetch(RPC + path, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(Object.assign({ sessionId: sessionId }, body || {})),
          })
          const data = await res.json().catch(function () { return null })
          if (!isCurrent()) return null
          if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || ('HTTP ' + res.status))
          if (data.game) {
            lastJson.current = JSON.stringify(data.game)
            setState({ sessionId: sessionId, game: data.game, moves: data.game.moves || [] })
          } else {
            refresh()
          }
          if (data.woken === false && data.wakeError) setError(translate('noAgent'))
          return data
        } catch (err) {
          if (isCurrent()) setError(translate('error') + '：' + String((err && err.message) || err))
          return null
        } finally {
          scope.mutating = false
          if (isCurrent()) {
            setBusy(false)
            refresh()
          }
        }
      }

      const visibleState = state.sessionId === sessionId ? state : { game: null, moves: [] }
      return { state: visibleState, error: error, busy: busy, selected: selected, setSelected: setSelected, refresh: refresh, rpc: rpc }
    }

    // 当前选中的对话（主面板不携带 session 绑定，从 uiSession 读）。
    let uiSessionService = null
    const LAST_SESSION_KEY = 'dsh-xiangqi:last-session'

    function readCurrentSessionId() {
      try {
        const current = uiSessionService && uiSessionService.adapter && uiSessionService.adapter.current
        if (current && typeof current.getSnapshot === 'function') {
          const snap = current.getSnapshot()
          const key = snap && snap.key
          if (typeof key === 'string' && key.length > 0) {
            try { localStorage.setItem(LAST_SESSION_KEY, key) } catch {}
            return key
          }
        }
      } catch {}
      try {
        const saved = localStorage.getItem(LAST_SESSION_KEY)
        if (typeof saved === 'string' && saved.length > 0) return saved
      } catch {}
      return ''
    }

    function useCurrentSessionId() {
      const [sessionId, setSessionId] = React.useState(readCurrentSessionId)
      React.useEffect(function () {
        const sync = function () { setSessionId(readCurrentSessionId()) }
        sync()
        let unsubscribe = null
        try {
          const current = uiSessionService && uiSessionService.adapter && uiSessionService.adapter.current
          if (current && typeof current.subscribe === 'function') unsubscribe = current.subscribe(sync)
        } catch {}
        return function () {
          if (typeof unsubscribe === 'function') unsubscribe()
        }
      }, [])
      return sessionId
    }

    function makeOnCell(game, moves, selected, setSelected, busy, rpc) {
      return function (col, row) {
        if (busy || !game || game.status !== 'playing' || game.turn !== 'red') return
        if (selected) {
          const found = moves.find(function (move) {
            return move.fromRC[0] === selected.col && move.fromRC[1] === selected.row && move.toRC[0] === col && move.toRC[1] === row
          })
          if (found) {
            setSelected(null)
            rpc('/move', { from: found.from, to: found.to })
            return
          }
        }
        const piece = game.board[row] && game.board[row][col]
        if (piece && piece.s === 'red') setSelected({ col: col, row: row })
        else setSelected(null)
      }
    }

    /** 主区域里的象棋页面。 */
    function MainBoard(props) {
      const t = props.t || translate
      const sessionId = useCurrentSessionId()
      const gameState = useGameState(sessionId, 1200)
      const game = gameState.state.game
      const moves = gameState.state.moves
      const status = statusSummary(game, t, gameState.error)
      const playing = Boolean(game && game.status === 'playing')
      const onCell = makeOnCell(game, moves, gameState.selected, gameState.setSelected, gameState.busy, gameState.rpc)
      const history = (game && game.history) || []
      const historyText = history.slice(-10).map(function (step) {
        return (step.side === 'red' ? '红' : '黑') + ' ' + step.from + '→' + step.to + (step.capture ? '×' : '')
      }).join('  ')
      const [redirect, setRedirect] = React.useState('')

      // 点左侧栏图标会切到本页面：先把主面板切回对话（右栏是会话作用域的，
      // 面板停在象棋页时右栏没有会话可用），再把棋盘放进右栏。
      React.useEffect(function () {
        const first = setTimeout(function () {
          backToChatFn()
          setTimeout(function () {
            const opened = openBoardFn()
            setRedirect(opened ? t('redirecting') : t('redirectFailed') + ' ' + debugStatus)
          }, 320)
        }, 60)
        return function () { clearTimeout(first) }
      }, [])

      function startGame() {
        gameState.setSelected(null)
        gameState.rpc('/new', { announce: true })
      }
      function resignGame() {
        const ok = typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(t('resign') + '？')
          : true
        if (!ok) return
        gameState.rpc('/resign', {})
      }
      function undoGame() {
        gameState.setSelected(null)
        gameState.rpc('/undo', {})
      }
      function nudge() {
        gameState.rpc('/nudge', {})
      }

      return h('div', { className: 'xq-page' },
        h('style', { key: 'css' }, CSS),
        h('div', { key: 'head', className: 'xq-head' },
          h('span', { key: 'title', className: 'xq-title' }, '♟ ' + t('title')),
          h('span', { key: 'sub', className: 'xq-sub' }, t('subtitle')),
          h('span', { key: 'status', className: 'xq-status ' + status.tone }, status.text),
        ),
        sessionId
          ? h('div', { key: 'boardwrap', className: 'xq-boardwrap' },
              h(Board, { key: sessionId + ':' + (game ? game.startedAt : ''), game: game, moves: moves, selected: gameState.selected, onCell: onCell, busy: gameState.busy, metrics: MAIN_METRICS }),
            )
          : h('div', { key: 'nosession', className: 'xq-hint err' }, t('noSession')),
        sessionId
          ? h('div', { key: 'foot', className: 'xq-foot' },
              h('button', { key: 'new', type: 'button', className: 'xq-btn' + (playing ? '' : ' primary'), onClick: startGame, disabled: gameState.busy }, playing ? t('restart') : t('start')),
              playing && game.canUndo ? h('button', { key: 'undo', type: 'button', className: 'xq-btn', onClick: undoGame, disabled: gameState.busy }, t('undo')) : null,
              playing ? h('button', { key: 'resign', type: 'button', className: 'xq-btn', onClick: resignGame, disabled: gameState.busy }, t('resign')) : null,
              playing && game.turn === 'black' ? h('button', { key: 'nudge', type: 'button', className: 'xq-btn', onClick: nudge, disabled: gameState.busy }, t('nudge')) : null,
              h('button', { key: 'rail', type: 'button', className: 'xq-btn', onClick: function () { openBoardInSidebar() } }, t('openBoard')),
              h('button', { key: 'back', type: 'button', className: 'xq-btn', onClick: function () { backToChatFn() } }, t('backToChat')),
            )
          : null,
        h('div', { key: 'hint', className: 'xq-hint' + (gameState.error ? ' err' : '') }, gameState.error || redirect || (playing && game.turn === 'red' ? t('moveHint') : '')),
        h('div', { key: 'hist', className: 'xq-moves' }, historyText ? t('history') + '：' + historyText : ''),
      )
    }

    /** 右侧栏里常驻的棋盘（窄栏尺寸，保留原有体验）。 */
    function RightbarBoard(props) {
      const t = props.t || translate
      const sessionId = props.sessionId || ''
      const gameState = useGameState(sessionId, 1200)
      const game = gameState.state.game
      const moves = gameState.state.moves
      const status = statusSummary(game, t, gameState.error)
      const playing = Boolean(game && game.status === 'playing')
      const onCell = makeOnCell(game, moves, gameState.selected, gameState.setSelected, gameState.busy, gameState.rpc)
      const history = (game && game.history) || []
      const historyText = history.slice(-8).map(function (step) {
        return (step.side === 'red' ? '红' : '黑') + ' ' + step.from + '→' + step.to + (step.capture ? '×' : '')
      }).join('  ')

      function startGame() {
        gameState.setSelected(null)
        gameState.rpc('/new', { announce: true })
      }
      function resignGame() {
        const ok = typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(t('resign') + '？')
          : true
        if (!ok) return
        gameState.rpc('/resign', {})
      }
      function undoGame() {
        gameState.setSelected(null)
        gameState.rpc('/undo', {})
      }
      function nudge() {
        gameState.rpc('/nudge', {})
      }

      return h('div', { className: 'xq-rail' },
        h('style', { key: 'css' }, CSS),
        h('div', { key: 'head', className: 'xq-railhead' },
          h('span', { key: 'title', className: 'xq-title' }, '♟ ' + t('title')),
          h('span', { key: 'status', className: 'xq-status ' + status.tone }, status.text),
        ),
        h('div', { key: 'boardwrap', className: 'xq-boardwrap' },
          h(Board, { key: sessionId + ':' + (game ? game.startedAt : ''), game: game, moves: moves, selected: gameState.selected, onCell: onCell, busy: gameState.busy, metrics: RAIL_METRICS }),
        ),
        h('div', { key: 'foot', className: 'xq-foot' },
          h('button', { key: 'new', type: 'button', className: 'xq-btn' + (playing ? '' : ' primary'), onClick: startGame, disabled: gameState.busy || !sessionId }, playing ? t('restart') : t('start')),
          playing && game.canUndo ? h('button', { key: 'undo', type: 'button', className: 'xq-btn', onClick: undoGame, disabled: gameState.busy || !sessionId }, t('undo')) : null,
          playing ? h('button', { key: 'resign', type: 'button', className: 'xq-btn', onClick: resignGame, disabled: gameState.busy || !sessionId }, t('resign')) : null,
          playing && game.turn === 'black' ? h('button', { key: 'nudge', type: 'button', className: 'xq-btn', onClick: nudge, disabled: gameState.busy || !sessionId }, t('nudge')) : null,
        ),
        h('div', { key: 'hint', className: 'xq-hint' + (gameState.error ? ' err' : '') }, gameState.error || (playing && game.turn === 'red' ? t('moveHint') : '')),
        h('div', { key: 'hist', className: 'xq-moves' }, historyText ? t('history') + '：' + historyText : ''),
      )
    }

    /** 左侧栏面板列表里的小图标。 */
    function PanIcon(props) {
      const size = (props && props.size) || 16
      const active = Boolean(props && props.active)
      const color = active ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)'
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        className: 'xq-icon',
        'aria-hidden': true,
        fill: 'none',
        stroke: color,
        strokeWidth: 1.6,
      },
        h('circle', { key: 'disc', cx: 12, cy: 12, r: 9 }),
        h('circle', { key: 'ring', cx: 12, cy: 12, r: 6.4, strokeWidth: 1.1 }),
        h('path', { key: 'cross', d: 'M12 8.2v7.6M8.2 12h7.6', strokeWidth: 1.2, opacity: 0.75 }),
      )
    }

    return {
      inject: ['slots', 'layout'],
      apply(ctx) {
        const locale = ctx.get('locale')
        if (locale && typeof locale.register === 'function') {
          try {
            locale.register('dsh-xiangqi', 'zh', ZH)
            locale.register('dsh-xiangqi', 'en', EN)
          } catch (error) {
            console.error('[dsh-xiangqi] locale registration failed:', error)
          }
        }
        let bound = null
        if (locale && typeof locale.bind === 'function') {
          try { bound = locale.bind('dsh-xiangqi') } catch {}
        }
        translate = bound || function (key) {
          const active = locale && typeof locale.getSnapshot === 'function' ? locale.getSnapshot().active : 'zh'
          const dict = active === 'en' ? EN : ZH
          return dict[key] || EN[key] || key
        }

        uiSessionService = ctx.get('uiSession') || null
        if (!uiSessionService) {
          ctx.inject(['uiSession'], function (sessionCtx) {
            uiSessionService = sessionCtx.get('uiSession')
          })
        }

        let sidebarRight = ctx.get('sidebarRight') || null
        const layout = ctx.get('layout') || null

        function registerTabType(registry) {
          if (!registry || typeof registry.register !== 'function') return
          try {
            ctx.effect(function () {
              return registry.register({
                id: TAB_ID,
                kind: TAB_KIND,
                priority: 'extension',
                title: function () { return translate('title') },
              })
            }, 'dsh-xiangqi: rightbar tab type')
          } catch (error) {
            console.error('[dsh-xiangqi] register rightbar tab type failed:', error)
          }
        }

        const initialRegistry = ctx.get('sidebarRightTabs') || null
        registerTabType(initialRegistry)
        if (!initialRegistry || !sidebarRight) {
          ctx.inject(['sidebarRightTabs', 'sidebarRight'], function (rightCtx) {
            const registry = rightCtx.get('sidebarRightTabs')
            sidebarRight = rightCtx.get('sidebarRight') || sidebarRight
            if (!initialRegistry) registerTabType(registry)
          })
        }

        /** 把棋盘放进右侧栏；返回是否成功发起。 */
        openBoardFn = function () {
          const info = { stage: 'openBoard' }
          try {
            info.expandedBefore = sidebarRight && typeof sidebarRight.isExpanded === 'function' ? sidebarRight.isExpanded() : null
          } catch {}
          try {
            if (layout && typeof layout.openRightbar === 'function') {
              layout.openRightbar(false, false)
              info.openRightbar = 'ok'
            } else {
              info.openRightbar = 'missing'
            }
          } catch (error) {
            info.openRightbar = 'throw:' + String((error && error.message) || error)
          }
          let opened = false
          const attempt = function (delay) {
            try {
              if (sidebarRight && typeof sidebarRight.openTab === 'function') {
                sidebarRight.openTab(TAB_KIND)
                opened = true
                info['openTab@' + delay] = 'ok'
              } else {
                info['openTab@' + delay] = sidebarRight ? 'no-openTab' : 'no-service'
              }
            } catch (error) {
              info['openTab@' + delay] = 'throw:' + String((error && error.message) || error)
            }
          }
          attempt(0)
          setTimeout(function () { attempt(150) }, 150)
          setTimeout(function () { attempt(500) }, 500)
          setTimeout(function () { attempt(1200) }, 1200)
          setTimeout(function () { attempt(2400) }, 2400)
          try {
            info.expandedAfter = sidebarRight && typeof sidebarRight.isExpanded === 'function' ? sidebarRight.isExpanded() : null
            info.tabsIn = sidebarRight && typeof sidebarRight.tabsIn === 'function' && sessionOf() ? sidebarRight.tabsIn(sessionOf()).length : null
          } catch (error) {
            info.tabsIn = 'throw:' + String((error && error.message) || error)
          }
          info.sessionId = sessionOf() || ''
          postDiag(info)
          return opened
        }

        /** 主面板切回对话。 */
        backToChatFn = function () {
          const info = { stage: 'back' }
          if (!layout || typeof layout.selectPanel !== 'function') {
            info.selectPanel = 'missing'
            postDiag(info)
            return false
          }
          try {
            layout.selectPanel(null)
            info.selectPanel = 'null-ok'
          } catch (error) {
            info.selectPanel = 'null-throw:' + String((error && error.message) || error)
          }
          postDiag(info)
          return true
        }

        debugStatus = '[layout=' + Boolean(layout) +
          ' selectPanel=' + Boolean(layout && typeof layout.selectPanel === 'function') +
          ' right=' + Boolean(sidebarRight) +
          ' openTab=' + Boolean(sidebarRight && typeof sidebarRight.openTab === 'function') + ']'

        postDiag({
          stage: 'apply',
          layout: Boolean(layout),
          selectPanel: Boolean(layout && typeof layout.selectPanel === 'function'),
          openRightbar: Boolean(layout && typeof layout.openRightbar === 'function'),
          right: Boolean(sidebarRight),
          openTab: Boolean(sidebarRight && typeof sidebarRight.openTab === 'function'),
          tabs: Boolean(initialRegistry),
        })

        const slots = ctx.get('slots')
        if (!slots) return

        // 主区域页面：点击左侧栏入口后显示，可把棋盘常驻到右侧栏。
        slots.inject('main', function () {
          return slots.register({
            name: 'main',
            key: PANEL_KEY,
            inject: function () { return { t: translate } },
          }, MainBoard)
        })

        // 右侧栏 tab 正文：保留常驻棋盘。
        slots.inject('sidebar.right.pane.tab', function () {
          return slots.register({
            name: 'sidebar.right.pane.tab',
            key: TAB_ID,
            inject: function () { return { t: translate } },
          }, RightbarBoard)
        })

        // 左侧栏「插件 / 插件市场 / 自动化任务」那一排的入口。
        slots.inject('sidebar.panellist', function () {
          return slots.register({
            name: 'sidebar.panellist',
            id: PANEL_KEY,
            order: 20,
            label: function () { return translate('title') },
          }, PanIcon)
        })
      },
    }
  },
})
