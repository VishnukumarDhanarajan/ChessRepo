import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Chess } from 'chess.js';

const app = express();
app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
  res.send({ status: 'ok', time: new Date() });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Data structures
// key: socket.id -> { username, roomId, role, status }
const players = new Map();
// list of socket IDs waiting for a match
let matchmakingQueue = [];
// key: roomId -> { id, players: [socketId1, socketId2], board: ChessInstance, chat: [] }
const activeRooms = new Map();

io.on('connection', (socket) => {
  console.log(`[CONNECT] Socket connected: ${socket.id}`);
  players.set(socket.id, {
    id: socket.id,
    username: 'Guest_' + socket.id.substring(0, 5),
    roomId: null,
    role: null,
    status: 'idle'
  });

  // Notify players count in lobby
  io.emit('lobby_stats', {
    onlinePlayers: players.size,
    activeMatches: activeRooms.size,
    queueLength: matchmakingQueue.length
  });

  // User sets their username
  socket.on('set_username', (username) => {
    const player = players.get(socket.id);
    if (player && username) {
      player.username = username.trim().substring(0, 20);
      console.log(`[USER] Socket ${socket.id} renamed to: ${player.username}`);
      socket.emit('username_updated', player.username);
    }
  });

  // User starts matchmaking
  socket.on('find_match', () => {
    const player = players.get(socket.id);
    if (!player || player.status === 'playing') return;

    player.status = 'searching';
    if (!matchmakingQueue.includes(socket.id)) {
      matchmakingQueue.push(socket.id);
      console.log(`[QUEUE] Added player ${player.username} (${socket.id}). Queue size: ${matchmakingQueue.length}`);
    }

    // Update lobby stats
    io.emit('lobby_stats', {
      onlinePlayers: players.size,
      activeMatches: activeRooms.size,
      queueLength: matchmakingQueue.length
    });

    // Check if we can form a match
    checkMatchmaking();
  });

  // User cancels matchmaking
  socket.on('cancel_matchmaking', () => {
    const player = players.get(socket.id);
    if (player && player.status === 'searching') {
      player.status = 'idle';
      matchmakingQueue = matchmakingQueue.filter(id => id !== socket.id);
      console.log(`[QUEUE] Removed player ${player.username} (${socket.id}). Queue size: ${matchmakingQueue.length}`);
      socket.emit('matchmaking_cancelled');

      io.emit('lobby_stats', {
        onlinePlayers: players.size,
        activeMatches: activeRooms.size,
        queueLength: matchmakingQueue.length
      });
    }
  });

  // User makes a move
  socket.on('make_move', (moveData) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) {
      socket.emit('move_error', 'You are not in an active game.');
      return;
    }

    const room = activeRooms.get(player.roomId);
    if (!room) {
      socket.emit('move_error', 'Game session not found.');
      return;
    }

    const chess = room.board;
    // Verify it's this player's turn
    const activeColor = chess.turn(); // 'w' or 'b'
    if (activeColor !== player.role) {
      socket.emit('move_error', "It is not your turn.");
      return;
    }

    try {
      // Validate and apply move
      // moveData is { from, to, promotion }
      // chess.js move() will throw if invalid
      const result = chess.move({
        from: moveData.from,
        to: moveData.to,
        promotion: moveData.promotion || 'q' // default to queen for promotion
      });

      console.log(`[MOVE] Room ${room.id} | ${player.username} (${player.role}): ${result.san}`);

      // Broadcast move to both players in the room
      io.to(room.id).emit('move_made', {
        move: {
          from: result.from,
          to: result.to,
          piece: result.piece,
          color: result.color,
          san: result.san,
          captured: result.captured || null,
          flags: result.flags
        },
        fen: chess.fen(),
        turn: chess.turn(),
        isCheck: chess.inCheck(),
        isCheckmate: chess.isGameOver() && chess.inCheck(),
        isDraw: chess.isGameOver() && !chess.inCheck(),
        gameOverReason: chess.isGameOver() ? getGameOverReason(chess) : null
      });

    } catch (error) {
      console.log(`[MOVE ERROR] Invalid move by ${player.username}:`, moveData, error.message);
      socket.emit('move_error', 'Invalid move.');
    }
  });

  // Chat message
  socket.on('send_message', (messageText) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = activeRooms.get(player.roomId);
    if (!room) return;

    const chatMsg = {
      id: Math.random().toString(36).substring(2, 9),
      sender: player.username,
      senderId: socket.id,
      text: messageText.substring(0, 200),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    room.chat.push(chatMsg);
    io.to(room.id).emit('receive_message', chatMsg);
  });

  // Client forfeits or leaves game
  socket.on('forfeit_game', () => {
    handlePlayerForfeit(socket.id);
  });

  // Socket disconnects
  socket.on('disconnect', () => {
    console.log(`[DISCONNECT] Socket disconnected: ${socket.id}`);
    const player = players.get(socket.id);
    if (player) {
      // Remove from matchmaking queue
      matchmakingQueue = matchmakingQueue.filter(id => id !== socket.id);
      
      // Handle active game if playing
      if (player.roomId) {
        handlePlayerForfeit(socket.id, true);
      }
      
      players.delete(socket.id);
    }

    io.emit('lobby_stats', {
      onlinePlayers: players.size,
      activeMatches: activeRooms.size,
      queueLength: matchmakingQueue.length
    });
  });
});

// Matches players waiting in queue
function checkMatchmaking() {
  while (matchmakingQueue.length >= 2) {
    const p1Id = matchmakingQueue.shift();
    const p2Id = matchmakingQueue.shift();

    const p1 = players.get(p1Id);
    const p2 = players.get(p2Id);

    // Ensure players are still connected and searching
    if (!p1 || p1.status !== 'searching') {
      if (p2 && p2.status === 'searching') matchmakingQueue.unshift(p2Id);
      continue;
    }
    if (!p2 || p2.status !== 'searching') {
      if (p1 && p1.status === 'searching') matchmakingQueue.unshift(p1Id);
      continue;
    }

    // Create game room
    const roomId = `room_${Math.random().toString(36).substring(2, 9)}`;
    const board = new Chess();

    // Randomize roles
    const p1Role = Math.random() < 0.5 ? 'w' : 'b';
    const p2Role = p1Role === 'w' ? 'b' : 'w';

    p1.roomId = roomId;
    p1.role = p1Role;
    p1.status = 'playing';

    p2.roomId = roomId;
    p2.role = p2Role;
    p2.status = 'playing';

    activeRooms.set(roomId, {
      id: roomId,
      players: [p1Id, p2Id],
      board: board,
      chat: []
    });

    // Make sockets join socket room
    const s1 = io.sockets.sockets.get(p1Id);
    const s2 = io.sockets.sockets.get(p2Id);

    if (s1) s1.join(roomId);
    if (s2) s2.join(roomId);

    console.log(`[MATCH] Created room ${roomId} | ${p1.username} (${p1Role}) VS ${p2.username} (${p2Role})`);

    // Emit match_found
    io.to(roomId).emit('match_found', {
      roomId,
      fen: board.fen(),
      players: {
        w: p1Role === 'w' ? { username: p1.username, id: p1Id } : { username: p2.username, id: p2Id },
        b: p1Role === 'b' ? { username: p1.username, id: p1Id } : { username: p2.username, id: p2Id }
      }
    });
  }
}

// Handles forfeit/disconnect when in an active game
function handlePlayerForfeit(socketId, isDisconnect = false) {
  const player = players.get(socketId);
  if (!player || !player.roomId) return;

  const room = activeRooms.get(player.roomId);
  if (!room) return;

  const opponentId = room.players.find(id => id !== socketId);
  const opponent = players.get(opponentId);

  console.log(`[GAME OVER] Room ${room.id} | ${player.username} ${isDisconnect ? 'disconnected' : 'forfeited'}`);

  // Broadcast game over to the room
  io.to(room.id).emit('game_over', {
    winner: opponent ? opponent.role : (player.role === 'w' ? 'b' : 'w'),
    reason: isDisconnect ? 'Opponent disconnected' : 'Opponent forfeited',
    forfeited: player.role
  });

  // Clean up sockets from socket room
  room.players.forEach(id => {
    const s = io.sockets.sockets.get(id);
    if (s) s.leave(room.id);

    const p = players.get(id);
    if (p) {
      p.roomId = null;
      p.role = null;
      p.status = 'idle';
    }
  });

  // Delete room
  activeRooms.delete(room.id);
}

// Determine game over details from chess.js
function getGameOverReason(chess) {
  if (chess.isCheckmate()) return 'Checkmate';
  if (chess.isDraw()) {
    if (chess.isStalemate()) return 'Stalemate';
    if (chess.isThreefoldRepetition()) return 'Threefold Repetition';
    if (chess.isInsufficientMaterial()) return 'Insufficient Material';
    return 'Draw (50-move rule / agreement)';
  }
  return 'Game Over';
}

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`[SERVER] Mecha Kombat Chess server running on port ${PORT}`);
});
