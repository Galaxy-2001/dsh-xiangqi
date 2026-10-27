/**
 * 中国象棋规则引擎（无依赖、可单独测试）。
 *
 * 坐标约定：
 * - 列 col 0..8 对应字母 a..i，从左到右（红方视角）。
 * - 行 row 0..9，row 0 是红方底线，row 9 是黑方底线。
 * - 对外坐标字符串形如 "h2"，即 rcToCoord(7, 2)。
 *
 * 棋子类型：K 帅/将，A 仕/士，B 相/象，N 马，R 车，C 炮，P 兵/卒。
 * 红方用大写、黑方用小写仅用于文本盘面展示；数据结构里用 { t, s }。
 */

export const RED = 'red'
export const BLACK = 'black'
export const COLS = 9
export const ROWS = 10

export function otherSide(side) {
  return side === RED ? BLACK : RED
}

/** 标准初始局面：红方在下（row 0），黑方在上（row 9）。 */
export function initialBoard() {
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null))
  const back = ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R']
  for (let col = 0; col < COLS; col += 1) {
    board[0][col] = { t: back[col], s: RED }
    board[9][col] = { t: back[col], s: BLACK }
  }
  board[2][1] = { t: 'C', s: RED }
  board[2][7] = { t: 'C', s: RED }
  board[7][1] = { t: 'C', s: BLACK }
  board[7][7] = { t: 'C', s: BLACK }
  for (const col of [0, 2, 4, 6, 8]) {
    board[3][col] = { t: 'P', s: RED }
    board[6][col] = { t: 'P', s: BLACK }
  }
  return board
}

export function cloneBoard(board) {
  return board.map((row) => row.map((piece) => (piece ? { t: piece.t, s: piece.s } : null)))
}

function inBoard(row, col) {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS
}

export function coordToRC(coord) {
  if (typeof coord !== 'string') return null
  const match = /^([a-iA-I])(\d)$/.exec(coord.trim())
  if (!match) return null
  const col = match[1].toLowerCase().charCodeAt(0) - 97
  const row = Number(match[2])
  if (col < 0 || col > 8 || row < 0 || row > 9) return null
  return { col, row }
}

export function rcToCoord(col, row) {
  return String.fromCharCode(97 + col) + String(row)
}

function samePos(left, right) {
  return left.col === right.col && left.row === right.row
}

function inPalace(row, col, side) {
  if (col < 3 || col > 5) return false
  return side === RED ? row >= 0 && row <= 2 : row >= 7 && row <= 9
}

function crossedRiver(row, side) {
  return side === RED ? row >= 5 : row <= 4
}

function findKing(board, side) {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const piece = board[row][col]
      if (piece && piece.t === 'K' && piece.s === side) return { col, row }
    }
  }
  return null
}

/** 伪合法走法：只检查棋子走法与阻挡，不检查走后是否被将军。 */
export function generatePseudoMoves(board, side) {
  const moves = []
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const piece = board[row][col]
      if (!piece || piece.s !== side) continue
      const push = (toRow, toCol) => {
        if (!inBoard(toRow, toCol)) return false
        const target = board[toRow][toCol]
        if (target && target.s === side) return false
        moves.push({ from: { col, row }, to: { col: toCol, row: toRow } })
        return target === null
      }
      switch (piece.t) {
        case 'R': {
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            let nextRow = row + dr
            let nextCol = col + dc
            while (inBoard(nextRow, nextCol)) {
              const target = board[nextRow][nextCol]
              if (!target) {
                moves.push({ from: { col, row }, to: { col: nextCol, row: nextRow } })
              } else {
                if (target.s !== side) moves.push({ from: { col, row }, to: { col: nextCol, row: nextRow } })
                break
              }
              nextRow += dr
              nextCol += dc
            }
          }
          break
        }
        case 'C': {
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            let nextRow = row + dr
            let nextCol = col + dc
            let jumped = false
            while (inBoard(nextRow, nextCol)) {
              const target = board[nextRow][nextCol]
              if (!jumped) {
                if (!target) {
                  moves.push({ from: { col, row }, to: { col: nextCol, row: nextRow } })
                } else {
                  jumped = true
                }
              } else if (target) {
                if (target.s !== side) moves.push({ from: { col, row }, to: { col: nextCol, row: nextRow } })
                break
              }
              nextRow += dr
              nextCol += dc
            }
          }
          break
        }
        case 'N': {
          const legs = [
            { dr: 2, dc: 1, legR: 1, legC: 0 },
            { dr: 2, dc: -1, legR: 1, legC: 0 },
            { dr: -2, dc: 1, legR: -1, legC: 0 },
            { dr: -2, dc: -1, legR: -1, legC: 0 },
            { dr: 1, dc: 2, legR: 0, legC: 1 },
            { dr: -1, dc: 2, legR: 0, legC: 1 },
            { dr: 1, dc: -2, legR: 0, legC: -1 },
            { dr: -1, dc: -2, legR: 0, legC: -1 },
          ]
          for (const leg of legs) {
            const legRow = row + leg.legR
            const legCol = col + leg.legC
            if (!inBoard(legRow, legCol) || board[legRow][legCol]) continue
            push(row + leg.dr, col + leg.dc)
          }
          break
        }
        case 'B': {
          for (const [dr, dc] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
            const toRow = row + dr
            const toCol = col + dc
            if (!inBoard(toRow, toCol)) continue
            if (side === RED ? toRow > 4 : toRow < 5) continue
            if (board[row + dr / 2][col + dc / 2]) continue
            push(toRow, toCol)
          }
          break
        }
        case 'A': {
          for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const toRow = row + dr
            const toCol = col + dc
            if (!inPalace(toRow, toCol, side)) continue
            push(toRow, toCol)
          }
          break
        }
        case 'K': {
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const toRow = row + dr
            const toCol = col + dc
            if (!inPalace(toRow, toCol, side)) continue
            push(toRow, toCol)
          }
          break
        }
        case 'P': {
          const forward = side === RED ? 1 : -1
          push(row + forward, col)
          if (crossedRiver(row, side)) {
            push(row, col - 1)
            push(row, col + 1)
          }
          break
        }
        default:
          break
      }
    }
  }
  return moves
}

export function applyMoveOnBoard(board, from, to) {
  const next = cloneBoard(board)
  const piece = next[from.row][from.col]
  const captured = next[to.row][to.col]
  next[to.row][to.col] = piece
  next[from.row][from.col] = null
  return { board: next, captured }
}

/** 是否被将军（含将帅照面）。 */
export function isInCheck(board, side) {
  const king = findKing(board, side)
  if (!king) return true
  const opponent = otherSide(side)
  const opponentKing = findKing(board, opponent)
  if (opponentKing && opponentKing.col === king.col) {
    let blocked = false
    const low = Math.min(king.row, opponentKing.row)
    const high = Math.max(king.row, opponentKing.row)
    for (let row = low + 1; row < high; row += 1) {
      if (board[row][king.col]) {
        blocked = true
        break
      }
    }
    if (!blocked) return true
  }
  return generatePseudoMoves(board, opponent).some((move) => samePos(move.to, king))
}

export function isLegalMove(board, from, to, side) {
  const piece = board[from.row]?.[from.col]
  if (!piece || piece.s !== side) return false
  const pseudo = generatePseudoMoves(board, side).some(
    (move) => samePos(move.from, from) && samePos(move.to, to),
  )
  if (!pseudo) return false
  const { board: next } = applyMoveOnBoard(board, from, to)
  return !isInCheck(next, side)
}

export function legalMoves(board, side) {
  return generatePseudoMoves(board, side).filter((move) => {
    const { board: next } = applyMoveOnBoard(board, move.from, move.to)
    return !isInCheck(next, side)
  })
}

/**
 * 一方落子之后评估局面（board 已是落子后的棋盘）。
 * 返回 { status, reason, check }，status 为 playing / red-win / black-win。
 */
export function evaluateAfterMove(board, moverSide) {
  const opponent = otherSide(moverSide)
  const moves = legalMoves(board, opponent)
  const check = isInCheck(board, opponent)
  if (moves.length === 0) {
    return {
      status: moverSide === RED ? 'red-win' : 'black-win',
      reason: check ? 'checkmate' : 'stalemate',
      check,
    }
  }
  return { status: 'playing', reason: check ? 'check' : null, check }
}

/** 文本盘面，供模型阅读。row 9 在上，row 0 在下。 */
export function renderBoardText(board) {
  const lines = []
  lines.push('     a b c d e f g h i')
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    const cells = []
    for (let col = 0; col < COLS; col += 1) {
      const piece = board[row][col]
      if (!piece) cells.push('.')
      else cells.push(piece.s === RED ? piece.t : piece.t.toLowerCase())
    }
    lines.push(`${String(row).padStart(2, ' ')}   ${cells.join(' ')}`)
  }
  lines.push('     a b c d e f g h i')
  return lines.join('\n')
}

const PIECE_NAMES = {
  K: { red: '帅', black: '将' },
  A: { red: '仕', black: '士' },
  B: { red: '相', black: '象' },
  N: { red: '马', black: '马' },
  R: { red: '车', black: '车' },
  C: { red: '炮', black: '炮' },
  P: { red: '兵', black: '卒' },
}

export function pieceName(piece) {
  if (!piece) return null
  return PIECE_NAMES[piece.t]?.[piece.s] ?? piece.t
}

export function sideLabel(side) {
  return side === RED ? '红方' : '黑方'
}
