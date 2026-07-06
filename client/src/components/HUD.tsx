import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, User, MessageSquare, Timer, Swords, Play, Cpu, 
  Globe, LogOut, ShieldAlert, RefreshCw, Terminal
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: string;
  senderId: string;
  text: string;
  timestamp: string;
}

interface HUDProps {
  gameMode: 'local' | 'ai' | 'online' | null;
  setGameMode: (mode: 'local' | 'ai' | 'online' | null) => void;
  onlineStats: { onlinePlayers: number; activeMatches: number; queueLength: number };
  matchState: 'idle' | 'searching' | 'playing' | 'gameover';
  playerColor: 'w' | 'b' | null; // w = white (Barbarian heroes), b = black (Goblin horde)
  turn: 'w' | 'b';
  isCheck: boolean;
  gameLog: string[];
  chatMessages: ChatMessage[];
  opponentName: string;
  username: string;
  setUsername: (name: string) => void;
  onFindMatch: () => void;
  onCancelMatchmaking: () => void;
  onSendChatMessage: (text: string) => void;
  onForfeit: () => void;
  onResetGame: () => void;
  winner: 'w' | 'b' | 'draw' | null;
  gameOverReason: string | null;
}

export const HUD: React.FC<HUDProps> = ({
  gameMode,
  setGameMode,
  onlineStats,
  matchState,
  playerColor,
  turn,
  isCheck,
  gameLog,
  chatMessages,
  opponentName,
  username,
  setUsername,
  onFindMatch,
  onCancelMatchmaking,
  onSendChatMessage,
  onForfeit,
  onResetGame,
  winner,
  gameOverReason
}) => {
  const [chatInput, setChatInput] = useState('');
  const [tempUsername, setTempUsername] = useState(username);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Sync turn timer
  useEffect(() => {
    if (matchState !== 'playing') return;
    setTimeRemaining(30);
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          return 30; // Auto reset or turn skip simulation
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [turn, matchState]);

  // Scroll to bottom for chats
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Scroll to bottom for combat logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameLog]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChatMessage(chatInput);
    setChatInput('');
  };

  const handleUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempUsername.trim()) {
      setUsername(tempUsername.trim());
    }
  };

  // Main lobby / matchmaking UI
  if (matchState === 'idle' || matchState === 'searching') {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-md z-30 p-4 scan-overlay">
        <div className="max-w-md w-full hologram-panel p-6 rounded-lg flex flex-col gap-6 text-center border-cyan">
          <div className="flex flex-col items-center gap-1">
            <h1 className="font-orbitron font-black text-3xl tracking-widest text-neon-cyan mb-2">FANTASY HERO CHESS</h1>
            <p className="font-mono text-sm text-cyan-400/80">3D TAVERN TACTICAL WAR GAME</p>
          </div>

          {/* Warlord Username Selector */}
          <form onSubmit={handleUsernameSubmit} className="flex gap-2 bg-black/40 p-2 border border-cyan-500/20 rounded">
            <User className="text-cyan-400 self-center ml-1" size={18} />
            <input 
              type="text" 
              value={tempUsername}
              onChange={(e) => setTempUsername(e.target.value)}
              placeholder="WARLORD USERNAME"
              className="bg-transparent text-cyan-200 outline-none border-none flex-grow font-orbitron text-sm p-1 placeholder:text-cyan-800"
            />
            {tempUsername.trim() !== username && (
              <button type="submit" className="cyber-btn text-xs px-2 py-1">SAVE</button>
            )}
          </form>

          {matchState === 'searching' ? (
            // Matchmaking loading state
            <div className="flex flex-col items-center gap-6 py-4">
              <div className="glitch-loader">SEARCHING FOR ENEMIES</div>
              <div className="flex justify-around w-full font-mono text-xs border-y border-cyan-500/10 py-2 text-cyan-300/60">
                <div>Queue size: {onlineStats.queueLength}</div>
                <div>War Room: {onlineStats.onlinePlayers} active</div>
              </div>
              <button 
                onClick={onCancelMatchmaking}
                className="cyber-btn-orange w-full"
              >
                ABORT MATCHMAKING
              </button>
            </div>
          ) : (
            // Select Mode UI
            <div className="flex flex-col gap-4 py-2">
              <h2 className="font-orbitron text-sm text-cyan-300/50 uppercase tracking-widest">Select Battle Mode</h2>
              
              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={() => {
                    setGameMode('local');
                    onResetGame();
                  }}
                  className="cyber-btn flex items-center justify-between group"
                >
                  <span className="flex items-center gap-2">
                    <Play size={16} className="text-cyan-400 group-hover:text-black" />
                    LOCAL PASS & PLAY
                  </span>
                  <span className="font-mono text-xs text-cyan-300/40 group-hover:text-black">OFFLINE</span>
                </button>

                <button 
                  onClick={() => {
                    setGameMode('ai');
                    onResetGame();
                  }}
                  className="cyber-btn flex items-center justify-between group"
                >
                  <span className="flex items-center gap-2">
                    <Cpu size={16} className="text-cyan-400 group-hover:text-black" />
                    VS BOT WARLORD
                  </span>
                  <span className="font-mono text-xs text-cyan-300/40 group-hover:text-black">OFFLINE</span>
                </button>

                <button 
                  onClick={onFindMatch}
                  className="cyber-btn flex items-center justify-between group active-cyan"
                >
                  <span className="flex items-center gap-2">
                    <Globe size={16} className="text-cyan-400 group-hover:text-black" />
                    ONLINE WAR DEPLOY
                  </span>
                  <span className="font-mono text-xs text-cyan-300/60 group-hover:text-black">ONLINE</span>
                </button>
              </div>

              {/* Server Stats footer */}
              <div className="flex justify-between items-center text-xs font-mono text-cyan-400/40 mt-4 border-t border-cyan-500/15 pt-3">
                <span>WAR ROOM STABILITY: 100%</span>
                <span>MATCHES DEPLOYED: {onlineStats.activeMatches}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Active Gameplay HUD overlay
  const activeColorTheme = turn === 'w' ? 'cyan' : 'orange';
  const isMyTurn = gameMode !== 'online' || playerColor === turn;
  const teamLabel = playerColor === 'w' ? 'HERO CLAN (RED BASES)' : (playerColor === 'b' ? 'GOBLIN HORDE (BLUE BASES)' : 'SPECTATOR');

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-20 font-orbitron select-none">
      
      {/* HEADER BAR: Active Turn & Status plates */}
      <div className="w-full flex justify-between pointer-events-auto items-start">
        
        {/* Left Side: Active Player Warlord Info */}
        <div className={`hologram-panel p-3 rounded max-w-xs w-full flex flex-col gap-1 border-${playerColor === 'b' ? 'orange' : 'cyan'}`}>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">WARLORD COUNCIL</span>
            <div className={`w-2 h-2 rounded-full bg-${playerColor === 'b' ? 'neon-orange' : 'neon-cyan'} animate-pulse`}></div>
          </div>
          <div className={`text-lg font-black truncate uppercase text-${playerColor === 'b' ? 'neon-orange' : 'neon-cyan'}`}>
            {username}
          </div>
          <span className="text-2xs font-mono text-slate-500 tracking-wider">{teamLabel}</span>
        </div>

        {/* Center: Turn Timer and Status notifications */}
        <div className="flex flex-col items-center gap-2 max-w-sm w-full text-center">
          <div className={`hologram-panel px-6 py-2 rounded flex flex-col items-center gap-1 ${turn === 'w' ? 'active-cyan border-cyan' : 'active-orange border-orange'}`}>
            <span className="text-2xs font-mono tracking-widest text-slate-400">ACTIVE WAR TURN</span>
            <div className="flex items-center gap-3">
              <Swords className={`w-5 h-5 text-neon-${activeColorTheme}`} />
              <div className={`text-xl font-black tracking-wider text-neon-${activeColorTheme}`}>
                {turn === 'w' ? 'HERO CLAN' : 'GOBLIN HORDE'}
              </div>
            </div>
            <span className="font-mono text-2xs text-slate-400 mt-0.5">
              {isMyTurn ? 'AWAITING YOUR WAR COMMAND' : 'WAITING FOR OPPONENT ACTIONS'}
            </span>
          </div>

          {/* Turn timer clock */}
          <div className={`hologram-panel px-4 py-1 rounded-full flex items-center gap-2 text-xs border-${activeColorTheme} bg-black/40`}>
            <Timer size={13} className={`text-neon-${activeColorTheme} animate-pulse`} />
            <span className={`font-mono text-neon-${activeColorTheme}`}>{timeRemaining} SEC</span>
          </div>

          {/* CHECK WARNING */}
          {isCheck && (
            <div className="bg-red-950/80 border border-red-500 text-neon-red px-4 py-1.5 rounded flex items-center gap-2 font-black text-sm animate-bounce shadow-[0_0_15px_rgba(255,0,0,0.4)]">
              <ShieldAlert size={16} />
              LEADER UNDER THREAT (CHECK)
            </div>
          )}
        </div>

        {/* Right Side: Opponent Warlord Info */}
        <div className={`hologram-panel p-3 rounded max-w-xs w-full flex flex-col gap-1 border-${playerColor === 'w' ? 'orange' : 'cyan'}`}>
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>OPPONENT DECK</span>
            <div className={`w-2 h-2 rounded-full bg-${playerColor === 'w' ? 'neon-orange' : 'neon-cyan'} animate-pulse`}></div>
          </div>
          <div className={`text-lg font-black truncate uppercase text-${playerColor === 'w' ? 'neon-orange' : 'neon-cyan'}`}>
            {gameMode === 'ai' ? 'BOT WARLORD v1.0' : (gameMode === 'local' ? 'WARLORD 2' : opponentName || 'RECRUITING...')}
          </div>
          <span className="text-2xs font-mono text-slate-500 tracking-wider">
            {playerColor === 'w' ? 'GOBLIN HORDE (BLUE BASES)' : (playerColor === 'b' ? 'HERO CLAN (RED BASES)' : 'SPECTATOR')}
          </span>
        </div>

      </div>

      {/* FOOTER BAR: Battle logs & Chat panels */}
      <div className="w-full flex justify-between pointer-events-auto items-end gap-4 mt-auto">
        
        {/* Left Side Panel: Combat event feed (Parchment scroll) */}
        <div className="hologram-panel w-80 h-44 rounded flex flex-col p-2 border-cyan/30">
          <div className="border-b border-cyan-500/20 pb-1 mb-1.5 flex items-center gap-1.5 text-xs text-cyan-400 font-black">
            <Terminal size={14} />
            WAR SCROLL READOUTS
          </div>
          <div className="flex-grow overflow-y-auto font-mono text-2xs text-cyan-200/90 leading-tight space-y-1 pr-1">
            {gameLog.length === 0 ? (
              <div className="text-cyan-800 italic">WAR ROOM ONLINE: Standing by for unit movements...</div>
            ) : (
              gameLog.map((log, index) => (
                <div key={index} className="border-l-2 border-cyan-500/40 pl-1.5 py-0.5">
                  {log}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* Center Panel: Exit / Forfeit buttons */}
        <div className="flex flex-col gap-2 mb-2">
          {gameMode === 'online' ? (
            <button onClick={onForfeit} className="cyber-btn-orange text-xs py-1.5 px-4 flex items-center gap-2">
              <LogOut size={12} />
              SURRENDER COUNCIL
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={onResetGame} className="cyber-btn text-xs py-1.5 px-3 flex items-center gap-1.5">
                <RefreshCw size={12} />
                REBOOT BATTLE
              </button>
              <button onClick={() => setGameMode(null)} className="cyber-btn-orange text-xs py-1.5 px-3 flex items-center gap-1.5">
                <LogOut size={12} />
                WAR ROOM
              </button>
            </div>
          )}
        </div>

        {/* Right Side Panel: Chat / System logs */}
        <div className="hologram-panel w-80 h-44 rounded flex flex-col p-2 border-cyan/30">
          <div className="border-b border-cyan-500/20 pb-1 mb-1.5 flex items-center gap-1.5 text-xs text-cyan-400 font-black">
            <MessageSquare size={14} />
            WAR COUNCIL COM CHANNEL
          </div>
          {gameMode === 'online' ? (
            <>
              <div className="flex-grow overflow-y-auto font-mono text-2xs space-y-1.5 pr-1 mb-2">
                {chatMessages.length === 0 ? (
                  <div className="text-cyan-800 italic">No scrolls received. Council link stable.</div>
                ) : (
                  chatMessages.map((msg) => (
                    <div key={msg.id} className="text-cyan-200">
                      <span className={`font-bold ${msg.senderId === 'system' ? 'text-red-400' : 'text-neon-cyan'}`}>
                        [{msg.sender}]:
                      </span>{' '}
                      <span className="break-all">{msg.text}</span>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={handleSendChat} className="flex gap-1">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="SEND SIGNAL..."
                  className="bg-black/50 border border-cyan-500/20 rounded flex-grow text-xs px-2 py-1 text-cyan-200 focus:outline-none focus:border-cyan-500/50 font-mono placeholder:text-cyan-800"
                />
                <button type="submit" className="cyber-btn p-1.5 flex items-center justify-center">
                  <Send size={12} />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-grow flex items-center justify-center font-mono text-center text-xs text-cyan-800 p-4">
              Council channel unavailable. Deploy online to interface with other human warlords.
            </div>
          )}
        </div>

      </div>

      {/* GAME OVER MODAL OVERLAY */}
      {matchState === 'gameover' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-40 pointer-events-auto p-4 scan-overlay">
          <div className="max-w-md w-full hologram-panel p-8 rounded-lg flex flex-col gap-6 text-center border-red-500/50">
            <h2 className="font-orbitron font-black text-4xl text-neon-red tracking-widest animate-pulse">WAR CONCLUDED</h2>
            
            <div className="bg-black/40 border border-red-500/20 p-4 rounded flex flex-col gap-1">
              <span className="text-2xs text-slate-500 font-mono">COMBAT VERDICT</span>
              <div className="text-2xl font-black text-neon-cyan uppercase">
                {winner === 'draw' ? (
                  'STALEMATE - DRAW'
                ) : (
                  winner === playerColor ? 'VICTORY IN BATTLE' : 'MATCH DEFEAT'
                )}
              </div>
              <span className="text-sm font-mono text-slate-300 mt-2">{gameOverReason}</span>
            </div>

            <div className="flex gap-3">
              {gameMode !== 'online' && (
                <button onClick={onResetGame} className="cyber-btn flex-grow">
                  REBOOT BATTLE
                </button>
              )}
              <button onClick={() => setGameMode(null)} className="cyber-btn-orange flex-grow">
                RETURN TO WAR ROOM
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
