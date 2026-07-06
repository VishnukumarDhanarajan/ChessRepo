import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { MechPiece } from './MechPiece';

// Map Chess Grid cell dimensions
const TILE_SIZE = 1.25;

// Translate chess row/col to 3D coordinate space
const getXYZ = (row: number, col: number): [number, number, number] => {
  const x = (col - 3.5) * TILE_SIZE;
  const z = (row - 3.5) * TILE_SIZE;
  return [x, 0.08, z]; // Raised slightly above the 3D board block height
};

// Particle sparks generator (glowing gold embers for fantasy combat hits)
interface Particle {
  id: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: string;
  size: number;
}

const CombatSparks: React.FC<{ active: boolean; position: [number, number, number]; color: string }> = ({
  active,
  position
}) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    if (!active) {
      setParticles([]);
      return;
    }

    const arr: Particle[] = [];
    for (let i = 0; i < 40; i++) {
      arr.push({
        id: nextId.current++,
        pos: new THREE.Vector3(
          position[0] + (Math.random() - 0.5) * 0.4,
          position[1] + 0.3 + (Math.random() - 0.5) * 0.3,
          position[2] + (Math.random() - 0.5) * 0.4
        ),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          Math.random() * 4 + 2.5,
          (Math.random() - 0.5) * 3
        ),
        color: '#ffaa33', // glowing gold sparks
        size: Math.random() * 0.07 + 0.03
      });
    }
    setParticles(arr);
  }, [active, position]);

  useFrame((_, delta) => {
    if (particles.length === 0) return;
    setParticles((prev) =>
      prev
        .map((p) => {
          const newPos = p.pos.clone().addScaledVector(p.vel, delta);
          p.vel.y -= 9.8 * delta; // Gravity
          return { ...p, pos: newPos };
        })
        .filter((p) => p.pos.y > 0)
    );
  });

  return (
    <group>
      {particles.map((p) => (
        <mesh key={p.id} position={[p.pos.x, p.pos.y, p.pos.z]}>
          <boxGeometry args={[p.size, p.size, p.size]} />
          <meshBasicMaterial color={p.color} />
        </mesh>
      ))}
    </group>
  );
};

// Custom Camera Rig supporting smooth kinematic panning
const CameraController: React.FC<{
  cameraTarget: THREE.Vector3;
  cameraOffset: THREE.Vector3;
  cinematicMode: boolean;
}> = ({ cameraTarget, cameraOffset, cinematicMode }) => {
  const { camera } = useThree();

  useFrame(() => {
    camera.position.lerp(cameraOffset, cinematicMode ? 0.06 : 0.04);
    camera.lookAt(cameraTarget);
  });

  return null;
};

// Rustic Tabletop Base with rich wood grain banding
const TabletopRoom: React.FC = () => {
  return (
    <group>
      {/* Main tabletop surface — warm polished oak */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[26, 26]} />
        <meshStandardMaterial color="#2c1a0e" roughness={0.85} metalness={0.08} />
      </mesh>
      {/* Outer dark void floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#0a0705" roughness={0.98} />
      </mesh>
      {/* Table edge trim — lighter wood border around board area */}
      <mesh position={[0, -0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[7.5, 8.5, 4]} />
        <meshStandardMaterial color="#3d2415" roughness={0.88} />
      </mesh>
    </group>
  );
};

// 3D raised slate-stone and wood block chessboard
const Chessboard3D: React.FC = () => {
  const tiles = useMemo(() => {
    const arr = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const isDark = (r + c) % 2 === 1;
        const x = (c - 3.5) * TILE_SIZE;
        const z = (r - 3.5) * TILE_SIZE;
        
        arr.push(
          <mesh key={`tile_${r}_${c}`} position={[x, 0.04, z]} receiveShadow castShadow>
            <boxGeometry args={[TILE_SIZE * 0.98, 0.08, TILE_SIZE * 0.98]} />
            <meshStandardMaterial 
              color={isDark ? '#4a2c17' : '#e8e0d4'} // rich walnut wood vs creamy marble stone
              roughness={isDark ? 0.85 : 0.5} 
              metalness={isDark ? 0.08 : 0.15} 
            />
          </mesh>
        );
      }
    }
    return arr;
  }, []);

  const borderThickness = TILE_SIZE * 0.55;
  const frameLength = TILE_SIZE * 9.1;

  return (
    <group>
      {/* 64 raised grid blocks */}
      {tiles}

      {/* Slate outer coordinate frame borders */}
      <mesh position={[-4.32 * TILE_SIZE, 0.04, 0]} receiveShadow castShadow>
        <boxGeometry args={[borderThickness, 0.09, frameLength]} />
        <meshStandardMaterial color="#474b4e" roughness={0.9} />
      </mesh>
      <mesh position={[4.32 * TILE_SIZE, 0.04, 0]} receiveShadow castShadow>
        <boxGeometry args={[borderThickness, 0.09, frameLength]} />
        <meshStandardMaterial color="#474b4e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.04, -4.32 * TILE_SIZE]} receiveShadow castShadow>
        <boxGeometry args={[frameLength, 0.09, borderThickness]} />
        <meshStandardMaterial color="#474b4e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.04, 4.32 * TILE_SIZE]} receiveShadow castShadow>
        <boxGeometry args={[frameLength, 0.09, borderThickness]} />
        <meshStandardMaterial color="#474b4e" roughness={0.9} />
      </mesh>
    </group>
  );
};


// Warm golden glowing sparks drifting upward from the candlelights
const SpaceEmbers: React.FC = () => {
  const count = 40;
  const particles = useMemo(() => {
    const arr = [];
    const seedRandom = (s: number) => {
      const val = Math.sin(s) * 10000;
      return val - Math.floor(val);
    };

    for (let i = 0; i < count; i++) {
      arr.push({
        x: (seedRandom(i * 3) - 0.5) * 18,
        y: seedRandom(i * 7) * 6,
        z: (seedRandom(i * 11) - 0.5) * 18,
        speedY: seedRandom(i * 5) * 0.25 + 0.05,
        speedX: (seedRandom(i * 9) - 0.5) * 0.1,
        size: seedRandom(i * 12) * 0.035 + 0.015,
        color: seedRandom(i * 2) < 0.65 ? '#ff9d24' : '#ffd700' // warm orange and gold sparks
      });
    }
    return arr;
  }, []);

  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (!groupRef.current) return;
    
    groupRef.current.children.forEach((child, idx) => {
      const p = particles[idx];
      child.position.y += p.speedY * 0.015;
      child.position.x += Math.sin(t * 0.5 + idx) * 0.002 + p.speedX * 0.008;
      
      if (child.position.y > 6.0) {
        child.position.y = -1.0;
        child.position.x = p.x;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {particles.map((p, idx) => (
        <mesh key={idx} position={[p.x, p.y, p.z]}>
          <boxGeometry args={[p.size, p.size, p.size]} />
          <meshBasicMaterial color={p.color} transparent opacity={0.45} />
        </mesh>
      ))}
    </group>
  );
};

// Flickering Candlesticks (pulsing light intensities)
const CandlestickLights: React.FC = () => {
  const leftCandleRef = useRef<THREE.PointLight>(null);
  const rightCandleRef = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (leftCandleRef.current) {
      leftCandleRef.current.intensity = 3.5 + Math.sin(t * 7.5) * 0.65 + Math.cos(t * 16) * 0.3;
    }
    if (rightCandleRef.current) {
      rightCandleRef.current.intensity = 3.5 + Math.cos(t * 6.5) * 0.65 + Math.sin(t * 22) * 0.3;
    }
  });

  return (
    <group>
      {/* Warm Left Tabletop Candle */}
      <pointLight 
        ref={leftCandleRef} 
        position={[-5.8, 2.2, 0]} 
        color="#ffd39a" 
        distance={15} 
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
      />
      {/* Warm Right Tabletop Candle */}
      <pointLight 
        ref={rightCandleRef} 
        position={[5.8, 2.2, 0]} 
        color="#ffd39a" 
        distance={15} 
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
      />
    </group>
  );
};

// Props structure for active battlefield coordination
interface VisualPiece {
  id: string; // FEN board identifier
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  color: 'w' | 'b';
  row: number; // 0 to 7
  col: number; // 0 to 7
  visualPos: [number, number, number];
  isWalking: boolean;
  isAttacking: boolean;
  isDying: boolean;
}

interface WreckageItem {
  id: string;
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  color: 'w' | 'b';
  position: [number, number, number];
}

interface BattlefieldProps {
  boardState: any[][];
  validMoves: { from: string; to: string }[];
  selectedSquare: string | null;
  onSquareClick: (square: string) => void;
  playerColor: 'w' | 'b' | null;
  activeTurn: 'w' | 'b';
  lastMove: { from: string; to: string; captured?: string } | null;
  wreckageList: WreckageItem[];
  setWreckageList: React.Dispatch<React.SetStateAction<WreckageItem[]>>;
  isAnimating: boolean;
  setIsAnimating: (animating: boolean) => void;
}

export const Battlefield: React.FC<BattlefieldProps> = ({
  boardState,
  validMoves,
  selectedSquare,
  onSquareClick,
  playerColor,
  activeTurn,
  lastMove,
  wreckageList,
  setWreckageList,
  isAnimating,
  setIsAnimating
}) => {
  const squareToRowCol = (sq: string) => {
    const col = sq.charCodeAt(0) - 97;
    const row = 8 - parseInt(sq[1]);
    return { row, col };
  };

  const rowColToSquare = (row: number, col: number) => {
    const file = String.fromCharCode(97 + col);
    const rank = 8 - row;
    return `${file}${rank}`;
  };

  const [visualPieces, setVisualPieces] = useState<VisualPiece[]>([]);
  const [sparkEffect, setSparkEffect] = useState<{ active: boolean; position: [number, number, number]; color: string }>({
    active: false,
    position: [0, 0, 0],
    color: '#ffd700'
  });

  // Camera settings (shifted target along Z pushes the board UP to avoid click blocks)
  const defaultTarget = useMemo(() => {
    if (playerColor === 'b') {
      return new THREE.Vector3(0, -0.6, -1.25);
    }
    return new THREE.Vector3(0, -0.6, 1.25);
  }, [playerColor]);

  const [cameraTarget, setCameraTarget] = useState<THREE.Vector3>(defaultTarget);

  const defaultOffset = useMemo(() => {
    if (playerColor === 'b') {
      return new THREE.Vector3(0, 9.2, -10.0);
    }
    return new THREE.Vector3(0, 9.2, 10.0);
  }, [playerColor]);
  
  const [cameraOffset, setCameraOffset] = useState<THREE.Vector3>(defaultOffset);
  const [cinematicMode, setCinematicMode] = useState(false);

  // Sync camera offset defaults
  useEffect(() => {
    setCameraTarget(defaultTarget);
    setCameraOffset(defaultOffset);
  }, [defaultTarget, defaultOffset]);

  const highlightedSquares = useMemo(() => {
    if (!selectedSquare) return [];
    return validMoves
      .filter(m => m.from === selectedSquare)
      .map(m => m.to);
  }, [selectedSquare, validMoves]);

  // Synchronize visual mechs
  useEffect(() => {
    if (isAnimating) return;

    const nextPieces: VisualPiece[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = boardState[r][c];
        if (cell) {
          const sq = rowColToSquare(r, c);
          const xyz = getXYZ(r, c);
          nextPieces.push({
            id: `${cell.color}${cell.type}_${sq}`,
            type: cell.type,
            color: cell.color,
            row: r,
            col: c,
            visualPos: xyz,
            isWalking: false,
            isAttacking: false,
            isDying: false
          });
        }
      }
    }
    setVisualPieces(nextPieces);
  }, [boardState, isAnimating]);

  // Intercept moves to animate
  useEffect(() => {
    if (!lastMove) return;

    const { from, to, captured } = lastMove;
    const fromRC = squareToRowCol(from);
    const toRC = squareToRowCol(to);
    
    const movingPiece = visualPieces.find(p => p.row === fromRC.row && p.col === fromRC.col);
    if (!movingPiece) return;

    setIsAnimating(true);

    const startPos = getXYZ(fromRC.row, fromRC.col);
    const endPos = getXYZ(toRC.row, toRC.col);

    // cinematic pan focus
    setCinematicMode(true);
    setCameraTarget(new THREE.Vector3(endPos[0], 0.2, endPos[2]));
    setCameraOffset(new THREE.Vector3(endPos[0] + (playerColor === 'b' ? 1.5 : -1.5), 1.8, endPos[2] + 2));

    setVisualPieces(prev =>
      prev.map(p => (p.id === movingPiece.id ? { ...p, isWalking: true } : p))
    );

    const animObj = { x: startPos[0], z: startPos[2] };
    
    gsap.to(animObj, {
      x: endPos[0],
      z: endPos[2],
      duration: 1.5,
      ease: 'power1.inOut',
      onUpdate: () => {
        setVisualPieces(prev =>
          prev.map(p =>
            p.id === movingPiece.id ? { ...p, visualPos: [animObj.x, 0.08, animObj.z] } : p
          )
        );
      },
      onComplete: () => {
        setVisualPieces(prev =>
          prev.map(p => (p.id === movingPiece.id ? { ...p, isWalking: false } : p))
        );

        if (captured) {
          const defenderPiece = visualPieces.find(p => p.row === toRC.row && p.col === toRC.col);

          if (defenderPiece) {
            setVisualPieces(prev =>
              prev.map(p => {
                if (p.id === movingPiece.id) return { ...p, isAttacking: true };
                if (p.id === defenderPiece.id) return { ...p, isDying: true };
                return p;
              })
            );

            setSparkEffect({
              active: true,
              position: endPos,
              color: '#ffd700'
            });

            setTimeout(() => {
              setVisualPieces(prev =>
                prev.map(p =>
                  p.id === movingPiece.id ? { ...p, isAttacking: false } : p
                )
              );
              setSparkEffect(prev => ({ ...prev, active: false }));

              // spawn wreckage (fantasy tombstones)
              const wreckageId = `wreck_${defenderPiece.type}_${Date.now()}`;
              setWreckageList(prev => [
                ...prev,
                {
                  id: wreckageId,
                  type: defenderPiece.type,
                  color: defenderPiece.color,
                  position: endPos
                }
              ]);

              setVisualPieces(prev =>
                prev
                  .filter(p => p.id !== defenderPiece.id)
                  .map(p => (p.id === movingPiece.id ? { ...p, row: toRC.row, col: toRC.col } : p))
              );

              concludeAnimation();
            }, 1800);
          } else {
            concludeAnimation();
          }
        } else {
          setVisualPieces(prev =>
            prev.map(p => (p.id === movingPiece.id ? { ...p, row: toRC.row, col: toRC.col } : p))
          );
          concludeAnimation();
        }
      }
    });

    const concludeAnimation = () => {
      setCinematicMode(false);
      setCameraTarget(defaultTarget);
      setCameraOffset(defaultOffset);
      setIsAnimating(false);
    };

  }, [lastMove]);

  const handleGroundClick = (row: number, col: number) => {
    if (isAnimating) return;
    const targetSquare = rowColToSquare(row, col);
    const cell = boardState[row][col];
    
    if (selectedSquare) {
      onSquareClick(targetSquare);
    } else if (cell && cell.color === activeTurn) {
      onSquareClick(targetSquare);
    }
  };

  // Render valid move highlight cells (gold warm glow)
  const renderTargetHighlights = () => {
    return highlightedSquares.map((sq) => {
      const { row, col } = squareToRowCol(sq);
      const [x, , z] = getXYZ(row, col);
      return (
        <group key={`hl_${sq}`}>
          <mesh position={[x, 0.1, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.42, 0.48, 16]} />
            <meshBasicMaterial 
              color="#ffd700" 
              transparent 
              opacity={0.8} 
              side={THREE.DoubleSide} 
            />
          </mesh>
          <mesh position={[x, 0.09, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.45]} />
            <meshBasicMaterial 
              color="#ffd700" 
              transparent 
              opacity={0.12} 
            />
          </mesh>
        </group>
      );
    });
  };

  // Render selection ring (gold)
  const renderSelectionHighlight = () => {
    if (!selectedSquare) return null;
    const { row, col } = squareToRowCol(selectedSquare);
    const [x, , z] = getXYZ(row, col);
    return (
      <mesh position={[x, 0.1, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.52, 0.58, 20]} />
        <meshBasicMaterial 
          color="#f59e0b" 
          transparent 
          opacity={0.9} 
        />
      </mesh>
    );
  };

  // Click tiles
  const renderClickTiles = () => {
    const tiles = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const [x, , z] = getXYZ(r, c);
        tiles.push(
          <mesh 
            key={`click_${r}_${c}`} 
            position={[x, 0.09, z]} 
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={(e) => {
              e.stopPropagation();
              handleGroundClick(r, c);
            }}
          >
            <planeGeometry args={[TILE_SIZE * 0.95, TILE_SIZE * 0.95]} />
            <meshBasicMaterial transparent opacity={0.0} color="#ff0000" />
          </mesh>
        );
      }
    }
    return tiles;
  };

  return (
    <div className="w-full h-full relative">
      <Canvas shadows camera={{ position: [0, 9.2, 10.0], fov: 45 }}>
        
        <color attach="background" args={['#0d0906']} />
        
        <CameraController 
          cameraTarget={cameraTarget} 
          cameraOffset={cameraOffset} 
          cinematicMode={cinematicMode} 
        />

        {/* Balanced ambient — slightly cool to prevent orange muddy tint */}
        <ambientLight intensity={1.8} color="#f5f0ea" />
        
        {/* Main warm key light (sun through window) */}
        <directionalLight 
          position={[6, 14, 5]} 
          intensity={3.5} 
          color="#ffe0b5" 
          castShadow 
          shadow-mapSize-width={2048} 
          shadow-mapSize-height={2048} 
        />

        {/* Cool fill light from opposite side — reduces muddy orange */}
        <directionalLight 
          position={[-5, 8, -4]} 
          intensity={1.2} 
          color="#c7d2fe" 
        />

        {/* Overhead board spotlight for clarity */}
        <pointLight position={[0, 6, 0]} intensity={2.5} distance={14} color="#fff5eb" />

        {/* Flicker candles Left & Right */}
        <CandlestickLights />

        {/* Floating warm embers */}
        <SpaceEmbers />

        {/* Cozy tabletop room background and raised 3D grid */}
        <TabletopRoom />
        <Chessboard3D />

        {/* Interactive tiles and glowing target guides */}
        {renderClickTiles()}
        {renderTargetHighlights()}
        {renderSelectionHighlight()}

        {/* Active Mechas rendering */}
        {visualPieces.map((p) => (
          <MechPiece
            key={p.id}
            type={p.type}
            color={p.color}
            position={p.visualPos}
            isWalking={p.isWalking}
            isAttacking={p.isAttacking}
            isDying={p.isDying}
            isWreckage={false}
            targetPosition={p.isWalking ? getXYZ(squareToRowCol(lastMove!.to).row, squareToRowCol(lastMove!.to).col) : undefined}
            onClick={() => handleGroundClick(p.row, p.col)}
          />
        ))}

        {/* Captured scrap metal wreckage props */}
        {wreckageList.map((w) => (
          <MechPiece
            key={w.id}
            type={w.type}
            color={w.color}
            position={w.position}
            isWalking={false}
            isAttacking={false}
            isDying={false}
            isWreckage={true}
          />
        ))}

        {/* Fatality spark explosion particles */}
        <CombatSparks 
          active={sparkEffect.active} 
          position={sparkEffect.position} 
          color={sparkEffect.color} 
        />

        {/* Coordinate labels borders (gold text) */}
        {(() => {
          const files = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
          const coords = [];
          
          for (let c = 0; c < 8; c++) {
            const x = (c - 3.5) * TILE_SIZE;
            coords.push(
              <Html key={`file_bot_${c}`} position={[x, 0.1, 4.32 * TILE_SIZE]} center distanceFactor={6}>
                <div style={{
                  color: 'rgba(212, 175, 55, 0.75)',
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: '11px',
                  fontWeight: 'bold',
                  pointerEvents: 'none',
                  textShadow: '0 0 5px rgba(212, 175, 55, 0.5)'
                }}>
                  {files[c]}
                </div>
              </Html>
            );
            coords.push(
              <Html key={`file_top_${c}`} position={[x, 0.1, -4.32 * TILE_SIZE]} center distanceFactor={6}>
                <div style={{
                  color: 'rgba(239, 68, 68, 0.75)',
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: '11px',
                  fontWeight: 'bold',
                  pointerEvents: 'none',
                  textShadow: '0 0 5px rgba(239, 68, 68, 0.5)'
                }}>
                  {files[c]}
                </div>
              </Html>
            );
          }

          for (let r = 0; r < 8; r++) {
            const z = (r - 3.5) * TILE_SIZE;
            const rank = 8 - r;
            coords.push(
              <Html key={`rank_left_${r}`} position={[-4.32 * TILE_SIZE, 0.1, z]} center distanceFactor={6}>
                <div style={{
                  color: 'rgba(212, 175, 55, 0.75)',
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: '11px',
                  fontWeight: 'bold',
                  pointerEvents: 'none',
                  textShadow: '0 0 5px rgba(212, 175, 55, 0.5)'
                }}>
                  {rank}
                </div>
              </Html>
            );
            coords.push(
              <Html key={`rank_right_${r}`} position={[4.32 * TILE_SIZE, 0.1, z]} center distanceFactor={6}>
                <div style={{
                  color: 'rgba(239, 68, 68, 0.75)',
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: '11px',
                  fontWeight: 'bold',
                  pointerEvents: 'none',
                  textShadow: '0 0 5px rgba(239, 68, 68, 0.5)'
                }}>
                  {rank}
                </div>
              </Html>
            );
          }
          return coords;
        })()}

        {!cinematicMode && (
          <OrbitControls 
            enablePan={false} 
            maxPolarAngle={Math.PI / 2.25} 
            minDistance={4.5} 
            maxDistance={13} 
          />
        )}
      </Canvas>
    </div>
  );
};
