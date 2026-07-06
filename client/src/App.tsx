import { useState, useEffect, useMemo, useRef } from 'react';
import { Chess } from 'chess.js';
import { io, Socket } from 'socket.io-client';
import confetti from 'canvas-confetti';
import { Battlefield } from './components/Battlefield';
import { HUD } from './components/HUD';
import { getBestMove } from './utils/ai';

const SOCKET_URL = 'http://localhost:5000';

interface ChatMessage {
  id: string;
  sender: string;
  senderId: string;
  text: string;
  timestamp: string;
}

interface WreckageItem {
  id: string;
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  color: 'w' | 'b';
  position: [number, number, number];
}

export default function App() {
  const [username, setUsername] = useState<string>(() => {
    return localStorage.getItem('pilot_name') || 'Pilot_' + Math.random().toString(36).substring(2, 6);
  });

  // Factions, modes, and lobbies
  const [gameMode, setGameMode] = useState<'local' | 'ai' | 'online' | null>(null);
  const [matchState, setMatchState] = useState<'idle' | 'searching' | 'playing' | 'gameover'>('idle');
  const [playerColor, setPlayerColor] = useState<'w' | 'b' | null>(null); // w = White, b = Black
  const [opponentName, setOpponentName] = useState<string>('');
  
  // Stats
  const [onlineStats, setOnlineStats] = useState({ onlinePlayers: 0, activeMatches: 0, queueLength: 0 });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  
  // Chess Core Logic Engine
  const chess = useMemo(() => new Chess(), []);
  const [boardState, setBoardState] = useState<any[][]>(() => chess.board());
  const [activeTurn, setActiveTurn] = useState<'w' | 'b'>('w');
  const [isCheck, setIsCheck] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [gameLog, setGameLog] = useState<string[]>([]);
  const [wreckageList, setWreckageList] = useState<WreckageItem[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);

  // Victory / Game over state
  const [winner, setWinner] = useState<'w' | 'b' | 'draw' | null>(null);
  const [gameOverReason, setGameOverReason] = useState<string | null>(null);

  // Socket & animation track
  const socketRef = useRef<Socket | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string; captured?: string } | null>(null);

  // Local storage name synchronization
  useEffect(() => {
    localStorage.setItem('pilot_name', username);
    if (socketRef.current) {
      socketRef.current.emit('set_username', username);
    }
  }, [username]);

  // Reset match states and clear wreckage when returning to the lobby
  useEffect(() => {
    if (gameMode === null) {
      setMatchState('idle');
      setSelectedSquare(null);
      setLastMove(null);
      setWinner(null);
      setGameOverReason(null);
      setWreckageList([]);
    }
  }, [gameMode]);

  // Connect to socket server
  useEffect(() => {
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to socket server');
      socket.emit('set_username', username);
    });

    socket.on('lobby_stats', (stats) => {
      setOnlineStats(stats);
    });

    socket.on('username_updated', (name) => {
      setUsername(name);
    });

    socket.on('match_found', (data) => {
      console.log('Match found:', data);
      chess.load(data.fen);
      setBoardState(chess.board());
      setActiveTurn(chess.turn());
      setWreckageList([]);
      setGameLog(['SYSTEM: Link established. Commencing battle protocols.']);
      setSelectedSquare(null);
      setWinner(null);
      setGameOverReason(null);
      setLastMove(null);

      // Identify player role
      const myId = socket.id;
      if (data.players.w.id === myId) {
        setPlayerColor('w');
        setOpponentName(data.players.b.username);
      } else {
        setPlayerColor('b');
        setOpponentName(data.players.w.username);
      }

      setMatchState('playing');
      setGameMode('online');
    });

    socket.on('move_made', (data) => {
      // Apply move received from server
      try {
        chess.move({
          from: data.move.from,
          to: data.move.to,
          promotion: data.move.promotion
        });

        // Trigger animation
        setLastMove({
          from: data.move.from,
          to: data.move.to,
          captured: data.move.captured || undefined
        });

        // Log move in HUD
        const moveLogStr = `${data.move.color === 'w' ? 'WHITE' : 'BLACK'} ${data.move.piece.toUpperCase()} moved ${data.move.from.toUpperCase()} -> ${data.move.to.toUpperCase()}${data.move.captured ? ` (DESTROYED ${data.move.captured.toUpperCase()})` : ''}`;
        setGameLog(prev => [...prev, moveLogStr]);

        setBoardState(chess.board());
        setActiveTurn(chess.turn());
        setIsCheck(data.isCheck);

        // Check victory states
        if (data.isCheckmate) {
          triggerVictoryConfetti(data.winner);
          setWinner(data.winner);
          setGameOverReason(data.gameOverReason);
          setMatchState('gameover');
        } else if (data.isDraw) {
          setWinner('draw');
          setGameOverReason(data.gameOverReason);
          setMatchState('gameover');
        }
      } catch (err) {
        console.error('Failed to apply sync move:', err);
      }
    });

    socket.on('receive_message', (msg: ChatMessage) => {
      setChatMessages(prev => [...prev, msg]);
    });

    socket.on('game_over', (data) => {
      setWinner(data.winner);
      setGameOverReason(data.reason);
      setMatchState('gameover');
    });

    socket.on('move_error', (msg) => {
      alert(`[SYSTEM MALFUNCTION] ${msg}`);
    });

    socket.on('matchmaking_cancelled', () => {
      setMatchState('idle');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Compute valid moves list for the active board state
  const validMoves = useMemo(() => {
    if (matchState !== 'playing' || isAnimating) return [];
    
    // In online mode, lock coordinates if not player's turn
    if (gameMode === 'online' && playerColor !== activeTurn) return [];

    return chess.moves({ verbose: true });
  }, [chess, matchState, gameMode, playerColor, activeTurn, isAnimating]);

  // Handle Chess AI Turn trigger
  useEffect(() => {
    if (gameMode !== 'ai' || activeTurn !== 'b' || matchState !== 'playing' || isAnimating) return;

    // Trigger AI move calculation and execution
    const aiTimeout = setTimeout(() => {
      const bestMove = getBestMove(chess.fen(), 'b', 2);
      if (bestMove) {
        handleLocalMove(bestMove.from, bestMove.to, bestMove.promotion);
      }
    }, 1000);

    return () => clearTimeout(aiTimeout);
  }, [gameMode, activeTurn, matchState, isAnimating]);

  // Execute chess rules move local client-side
  const handleLocalMove = (from: string, to: string, promotion = 'q') => {
    try {
      const move = chess.move({ from, to, promotion });
      
      // Sync last move trigger
      setLastMove({
        from: move.from,
        to: move.to,
        captured: move.captured || undefined
      });

      // Update game logs
      const logMsg = `${move.color === 'w' ? 'WHITE' : 'BLACK'} ${move.piece.toUpperCase()} moved ${move.from.toUpperCase()} -> ${move.to.toUpperCase()}${move.captured ? ` (DESTROYED ${move.captured.toUpperCase()})` : ''}`;
      setGameLog(prev => [...prev, logMsg]);

      // Update states
      setBoardState(chess.board());
      setActiveTurn(chess.turn());
      setIsCheck(chess.inCheck());
      setSelectedSquare(null);

      // Verify game over conditions
      if (chess.isGameOver()) {
        let reason = 'Draw';
        let matchWinner: 'w' | 'b' | 'draw' = 'draw';

        if (chess.isCheckmate()) {
          matchWinner = chess.turn() === 'w' ? 'b' : 'w';
          reason = `Checkmate! Victory for ${matchWinner === 'w' ? 'WHITE' : 'BLACK'}`;
          triggerVictoryConfetti(matchWinner);
        } else if (chess.isStalemate()) {
          reason = 'Stalemate reached (Draw)';
        } else if (chess.isInsufficientMaterial()) {
          reason = 'Insufficient material (Draw)';
        }

        setWinner(matchWinner);
        setGameOverReason(reason);
        setMatchState('gameover');
      }

    } catch (e) {
      console.log('Illegal move skipped');
    }
  };

  // User click registration
  const handleSquareClick = (square: string) => {
    if (matchState !== 'playing' || isAnimating) return;

    // Prevent moving opponent's pieces in online mode
    if (gameMode === 'online' && playerColor !== activeTurn) return;

    // Check if player clicked their own piece to select it
    const piece = chess.get(square as any);
    const isOwnPiece = piece && piece.color === activeTurn;

    if (isOwnPiece) {
      setSelectedSquare(square);
    } else if (selectedSquare) {
      // Try to execute move
      const targetMove = validMoves.find(m => m.from === selectedSquare && m.to === square);
      
      if (targetMove) {
        if (gameMode === 'online') {
          // Send move command to matchmaking server
          socketRef.current?.emit('make_move', {
            from: selectedSquare,
            to: square,
            promotion: 'q'
          });
          setSelectedSquare(null);
        } else {
          // Local Pass & Play or AI Mode
          handleLocalMove(selectedSquare, square);
        }
      } else {
        setSelectedSquare(null);
      }
    }
  };

  // Trigger particle confetti on victory
  const triggerVictoryConfetti = (winColor: 'w' | 'b') => {
    const config = {
      particleCount: 150,
      spread: 80,
      colors: winColor === 'w' ? ['#00f0ff', '#ffffff', '#0044ff'] : ['#ff5e00', '#ff0033', '#1e1e1e']
    };
    confetti(config);
  };

  // lobby actions
  const handleFindMatch = () => {
    setMatchState('searching');
    socketRef.current?.emit('find_match');
  };

  const handleCancelMatchmaking = () => {
    socketRef.current?.emit('cancel_matchmaking');
  };

  const handleSendChatMessage = (text: string) => {
    socketRef.current?.emit('send_message', text);
  };

  const handleForfeit = () => {
    socketRef.current?.emit('forfeit_game');
  };

  const handleResetGame = () => {
    chess.reset();
    setBoardState(chess.board());
    setActiveTurn('w');
    setIsCheck(false);
    setSelectedSquare(null);
    setWreckageList([]);
    setGameLog(['SYSTEM: Match rebooted. Coordinate grids calibrated.']);
    setWinner(null);
    setGameOverReason(null);
    setLastMove(null);
    setMatchState('playing');
    
    // In VS AI, default player role is White
    if (gameMode === 'ai') {
      setPlayerColor('w');
    } else {
      setPlayerColor(null); // Local mode switches controls automatically
    }
  };

  return (
    <div className="w-full h-full relative select-none">
      
      {/* 3D battlefield terrain mesh renderer */}
      {gameMode && (matchState === 'playing' || matchState === 'gameover') && (
        <Battlefield
          boardState={boardState}
          validMoves={validMoves}
          selectedSquare={selectedSquare}
          onSquareClick={handleSquareClick}
          playerColor={playerColor}
          activeTurn={activeTurn}
          lastMove={lastMove}
          wreckageList={wreckageList}
          setWreckageList={setWreckageList}
          isAnimating={isAnimating}
          setIsAnimating={setIsAnimating}
        />
      )}

      {/* Futuristic cyber HUD and lobby interfaces */}
      <HUD
        gameMode={gameMode}
        setGameMode={setGameMode}
        onlineStats={onlineStats}
        matchState={matchState}
        playerColor={playerColor}
        turn={activeTurn}
        isCheck={isCheck}
        gameLog={gameLog}
        chatMessages={chatMessages}
        opponentName={opponentName}
        username={username}
        setUsername={setUsername}
        onFindMatch={handleFindMatch}
        onCancelMatchmaking={handleCancelMatchmaking}
        onSendChatMessage={handleSendChatMessage}
        onForfeit={handleForfeit}
        onResetGame={handleResetGame}
        winner={winner}
        gameOverReason={gameOverReason}
      />
    </div>
  );
}
