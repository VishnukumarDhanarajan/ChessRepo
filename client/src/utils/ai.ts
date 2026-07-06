import { Chess } from 'chess.js';

// Piece value evaluation weights
const PIECE_VALUES: Record<string, number> = {
  p: 10,
  n: 30,
  b: 30,
  r: 50,
  q: 90,
  k: 1000
};

// Positional grids to encourage mechs to control the center and advance pawns
const PAWN_POSITIONAL: number[] = [
  0,  0,  0,  0,  0,  0,  0,  0,
  5,  5,  5,  5,  5,  5,  5,  5,
  1,  1,  2,  3,  3,  2,  1,  1,
  0.5,0.5,1, 2.5,2.5, 1,0.5,0.5,
  0,  0,  0,  2,  2,  0,  0,  0,
  0.5,-0.5,-0.5,0,0,-0.5,-0.5,0.5,
  0.5, 1, 1, -2, -2, 1, 1, 0.5,
  0,  0,  0,  0,  0,  0,  0,  0
];

const KNIGHT_POSITIONAL: number[] = [
  -5, -4, -3, -3, -3, -3, -4, -5,
  -4, -2,  0,  0,  0,  0, -2, -4,
  -3,  0,  1,  1.5,1.5, 1,  0, -3,
  -3,  0.5,1.5,2,  2,  1.5,0.5,-3,
  -3,  0,  1.5,2,  2,  1.5, 0, -3,
  -3,  0.5, 1,  1.5,1.5, 1, 0.5, -3,
  -4, -2,  0,  0.5,0.5, 0, -2, -4,
  -5, -4, -3, -3, -3, -3, -4, -5
];

const BISHOP_POSITIONAL: number[] = [
  -2, -1, -1, -1, -1, -1, -1, -2,
  -1,  0,  0,  0,  0,  0,  0, -1,
  -1,  0,  0.5, 1,  1, 0.5,  0, -1,
  -1,  0.5, 0.5, 1,  1, 0.5, 0.5, -1,
  -1,  0,  1,   1,  1,  1,   0, -1,
  -1,  1,  1,   1,  1,  1,   1, -1,
  -1,  0.5,0,   0,  0,  0,  0.5, -1,
  -2, -1, -1, -1, -1, -1, -1, -2
];

const ROOK_POSITIONAL: number[] = [
  0,  0,  0,  0,  0,  0,  0,  0,
  0.5,1,  1,  1,  1,  1,  1, 0.5,
  -0.5,0, 0,  0,  0,  0,  0,-0.5,
  -0.5,0, 0,  0,  0,  0,  0,-0.5,
  -0.5,0, 0,  0,  0,  0,  0,-0.5,
  -0.5,0, 0,  0,  0,  0,  0,-0.5,
  -0.5,0, 0,  0,  0,  0,  0,-0.5,
   0,  0,  0,  0.5,0.5, 0,  0,  0
];

const QUEEN_POSITIONAL: number[] = [
  -2, -1, -1, -0.5, -0.5, -1, -1, -2,
  -1,  0,  0,  0,    0,    0,  0, -1,
  -1,  0,  0.5, 0.5,  0.5,  0.5, 0, -1,
  -0.5,0,  0.5, 0.5,  0.5,  0.5, 0, -0.5,
   0,  0,  0.5, 0.5,  0.5,  0.5, 0, -0.5,
  -1,  0.5,0.5, 0.5,  0.5,  0.5, 0, -1,
  -1,  0,  0.5, 0,    0,    0.5, 0, -1,
  -2, -1, -1, -0.5, -0.5, -1, -1, -2
];

const KING_POSITIONAL: number[] = [
  -3, -4, -4, -5, -5, -4, -4, -3,
  -3, -4, -4, -5, -5, -4, -4, -3,
  -3, -4, -4, -5, -5, -4, -4, -3,
  -3, -4, -4, -5, -5, -4, -4, -3,
  -2, -3, -3, -4, -4, -3, -3, -2,
  -1, -2, -2, -2, -2, -2, -2, -1,
   2,  2,  0,  0,  0,  0,  2,  2,
   2,  3,  1,  0,  0,  1,  3,  2
];

// Returns structural positional grid based on piece type and player side
function getPositionalValue(pieceType: string, index: number, isWhite: boolean): number {
  const tableIndex = isWhite ? (63 - index) : index;
  switch (pieceType.toLowerCase()) {
    case 'p': return PAWN_POSITIONAL[tableIndex];
    case 'n': return KNIGHT_POSITIONAL[tableIndex];
    case 'b': return BISHOP_POSITIONAL[tableIndex];
    case 'r': return ROOK_POSITIONAL[tableIndex];
    case 'q': return QUEEN_POSITIONAL[tableIndex];
    case 'k': return KING_POSITIONAL[tableIndex];
    default: return 0;
  }
}

// Evaluate board state
// Positive values favor White, negative values favor Black
function evaluateBoard(chess: Chess): number {
  let score = 0;
  const board = chess.board();

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = board[r][c];
      if (square) {
        const isWhite = square.color === 'w';
        const type = square.type;
        const val = PIECE_VALUES[type] + getPositionalValue(type, r * 8 + c, isWhite);
        score += isWhite ? val : -val;
      }
    }
  }
  return score;
}

/**
 * Minimax with Alpha-Beta Pruning
 * @param chess The current Chess instance
 * @param depth Remaining recursion depth
 * @param alpha Best score for maximizing player
 * @param beta Best score for minimizing player
 * @param isMaximizing True if evaluating for White, False if for Black
 */
function minimax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean
): { score: number; move: any } {
  if (depth === 0 || chess.isGameOver()) {
    return { score: evaluateBoard(chess), move: null };
  }

  const moves = chess.moves({ verbose: true });
  
  // Sort moves slightly: captures first, to improve alpha-beta efficiency
  moves.sort((a: any, b: any) => {
    const valA = a.captured ? PIECE_VALUES[a.captured] : 0;
    const valB = b.captured ? PIECE_VALUES[b.captured] : 0;
    return valB - valA;
  });

  let bestMove: any = null;

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      chess.move(move);
      const evaluation = minimax(chess, depth - 1, alpha, beta, false).score;
      chess.undo();

      if (evaluation > maxEval) {
        maxEval = evaluation;
        bestMove = move;
      }
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break; // Pruning
    }
    return { score: maxEval, move: bestMove };
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      chess.move(move);
      const evaluation = minimax(chess, depth - 1, alpha, beta, true).score;
      chess.undo();

      if (evaluation < minEval) {
        minEval = evaluation;
        bestMove = move;
      }
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break; // Pruning
    }
    return { score: minEval, move: bestMove };
  }
}

/**
 * Get the best move for the AI
 * @param fen Current board FEN
 * @param aiColor Faction color ('w' or 'b')
 * @param depth Depth of search tree (default 2 for high responsiveness)
 */
export function getBestMove(fen: string, aiColor: 'w' | 'b', depth = 2): { from: string; to: string; promotion?: string } | null {
  const chess = new Chess(fen);
  const isMaximizing = aiColor === 'w';
  const result = minimax(chess, depth, -Infinity, Infinity, isMaximizing);
  
  if (result.move) {
    return {
      from: result.move.from,
      to: result.move.to,
      promotion: result.move.promotion || 'q'
    };
  }

  // Fallback to random if minimax doesn't find a move
  const moves = chess.moves({ verbose: true });
  if (moves.length > 0) {
    const randomMove = moves[Math.floor(Math.random() * moves.length)];
    return {
      from: randomMove.from,
      to: randomMove.to,
      promotion: randomMove.promotion
    };
  }

  return null;
}
