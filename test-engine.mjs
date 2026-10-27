/** 规则引擎自检：node test-engine.mjs */
import assert from 'node:assert/strict'
import {
  BLACK,
  RED,
  applyMoveOnBoard,
  coordToRC,
  evaluateAfterMove,
  generatePseudoMoves,
  initialBoard,
  isInCheck,
  isLegalMove,
  legalMoves,
  rcToCoord,
  renderBoardText,
} from './engine.js'

function emptyBoard() {
  return Array.from({ length: 10 }, () => Array(9).fill(null))
}

// 1. 初始局面
const board = initialBoard()
let count = 0
for (const row of board) for (const cell of row) if (cell) count += 1
assert.equal(count, 32, '初始局面应有 32 枚棋子')
assert.deepEqual(board[0][4], { t: 'K', s: RED })
assert.deepEqual(board[9][4], { t: 'K', s: BLACK })
console.log('初始局面红方合法走法：', legalMoves(board, RED).length, '；黑方：', legalMoves(board, BLACK).length)

// 2. 坐标转换
assert.deepEqual(coordToRC('a0'), { col: 0, row: 0 })
assert.deepEqual(coordToRC('i9'), { col: 8, row: 9 })
assert.equal(coordToRC('j0'), null)
assert.equal(rcToCoord(7, 2), 'h2')

// 3. 车走直线、被己方挡住
assert.ok(isLegalMove(board, coordToRC('a0'), coordToRC('a2'), RED), '红车应能走到 a2')
assert.ok(!isLegalMove(board, coordToRC('a0'), coordToRC('b0'), RED), '红车不能走到己方马的位置')

// 4. 马蹩腿：初始 b0 马不能到 d1（c0 有相）
assert.ok(!isLegalMove(board, coordToRC('b0'), coordToRC('d1'), RED), '马被相蹩腿')

// 5. 兵未过河只能前进
assert.ok(isLegalMove(board, coordToRC('a3'), coordToRC('a4'), RED), '红兵可前进')
assert.ok(!isLegalMove(board, coordToRC('a3'), coordToRC('b3'), RED), '红兵未过河不能横走')

// 6. 炮：吃子需要炮架
const cannonBoard = emptyBoard()
cannonBoard[0][0] = { t: 'K', s: RED }
cannonBoard[0][8] = { t: 'K', s: BLACK }
cannonBoard[2][1] = { t: 'C', s: RED }
cannonBoard[4][1] = { t: 'P', s: RED } // 炮架
cannonBoard[6][1] = { t: 'P', s: BLACK } // 目标
assert.ok(isLegalMove(cannonBoard, coordToRC('b2'), coordToRC('b6'), RED), '炮隔一子可吃')
assert.ok(isLegalMove(cannonBoard, coordToRC('b2'), coordToRC('b3'), RED), '炮可走空格')
assert.ok(!isLegalMove(cannonBoard, coordToRC('b2'), coordToRC('b4'), RED), '炮不能吃炮架')

// 7. 将帅照面：红帅 e0 与黑将 e9 之间无子，红帅不能动（动了仍照面），红车可以走到中间挡将
const faceBoard = emptyBoard()
faceBoard[0][4] = { t: 'K', s: RED }
faceBoard[9][4] = { t: 'K', s: BLACK }
faceBoard[5][0] = { t: 'R', s: RED }
assert.ok(isInCheck(faceBoard, RED), '将帅照面视为被将军')
assert.ok(!isLegalMove(faceBoard, coordToRC('e0'), coordToRC('e1'), RED), '红帅不能沿照面线走')
assert.ok(isLegalMove(faceBoard, coordToRC('a5'), coordToRC('e5'), RED), '红车可以走到两将之间挡将')

// 8. 将死：黑将 e9 被 a9 车横线将军，e8 车封住，吃 e8 车会照面
const mateBoard = emptyBoard()
mateBoard[9][4] = { t: 'K', s: BLACK }
mateBoard[0][4] = { t: 'K', s: RED }
mateBoard[9][0] = { t: 'R', s: RED }
mateBoard[8][4] = { t: 'R', s: RED }
assert.ok(isInCheck(mateBoard, BLACK), '黑将被将军')
const evalResult = evaluateAfterMove(mateBoard, RED)
console.log('杀棋评估：', evalResult)
assert.equal(evalResult.status, 'red-win', '双车应杀死黑将')
assert.equal(evalResult.reason, 'checkmate')

// 9. 落子后轮到对方
const move = applyMoveOnBoard(board, coordToRC('a3'), coordToRC('a4'))
assert.equal(move.captured, null)
assert.deepEqual(move.board[4][0], { t: 'P', s: RED })
assert.equal(move.board[3][0], null)

// 10. 伪走法数量与合法走法数量关系
assert.ok(generatePseudoMoves(board, RED).length >= legalMoves(board, RED).length)

console.log('\n棋盘文本：\n' + renderBoardText(board))
console.log('\n✓ 规则引擎自检全部通过')
