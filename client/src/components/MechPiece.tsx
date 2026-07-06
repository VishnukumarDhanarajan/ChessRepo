import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

const getPieceName = (t: string) => {
  switch (t) {
    case 'p': return 'PAWN';
    case 'n': return 'KNIGHT';
    case 'b': return 'BISHOP';
    case 'r': return 'ROOK';
    case 'q': return 'QUEEN';
    case 'k': return 'KING';
    default: return 'UNIT';
  }
};

// ─── Color palettes ──────────────────────────────────────────────
const PALETTE = {
  w: {
    body: '#f5f0e8',
    limb: '#e8ddd0',
    accent: '#dc2626',
    accent2: '#f59e0b',
    glow: '#fbbf24',
    eyes: '#22d3ee',
    weapon: '#60a5fa',
    base: '#dc2626',
    baseGlow: '#fbbf24',
    crown: '#f5c542',
  },
  b: {
    body: '#1e293b',
    limb: '#334155',
    accent: '#3b82f6',
    accent2: '#8b5cf6',
    glow: '#818cf8',
    eyes: '#f43f5e',
    weapon: '#e879f9',
    base: '#2563eb',
    baseGlow: '#60a5fa',
    crown: '#a78bfa',
  }
};

// ─── Shared geometry constants ───────────────────────────────────
const HEAD_R = 0.11;
const BODY_R = 0.028;
const BODY_H = 0.28;
const ARM_R = 0.02;
const ARM_H = 0.22;
const LEG_R = 0.024;
const LEG_H = 0.24;
const JOINT_R = 0.03;
const HAND_R = 0.025;
const FOOT_W = 0.05;

// ─── Kill animation definitions (20 variations) ─────────────────
interface KillAnim {
  name: string;
  deathFn: (progress: number, refs: DeathRefs, seed: THREE.Vector3) => void;
}

interface DeathRefs {
  group: THREE.Group | null;
  head: THREE.Object3D | null;
  body: THREE.Object3D | null;
  leftArm: THREE.Object3D | null;
  rightArm: THREE.Object3D | null;
  leftLeg: THREE.Object3D | null;
  rightLeg: THREE.Object3D | null;
}

const KILL_ANIMATIONS: KillAnim[] = [
  {
    // 0: Classic explosion — parts fly outward
    name: 'explosion',
    deathFn: (p, refs, seed) => {
      const t = p * 3;
      if (refs.head) { refs.head.position.y += t * 0.8; refs.head.position.x += seed.x * t * 0.5; (refs.head as any).rotation.z += t * 4; }
      if (refs.leftArm) { refs.leftArm.position.x -= t * 0.6; refs.leftArm.position.y += t * 0.3; (refs.leftArm as any).rotation.z -= t * 3; }
      if (refs.rightArm) { refs.rightArm.position.x += t * 0.6; refs.rightArm.position.y += t * 0.3; (refs.rightArm as any).rotation.z += t * 3; }
      if (refs.leftLeg) { refs.leftLeg.position.x -= t * 0.4; (refs.leftLeg as any).rotation.z -= t * 2; }
      if (refs.rightLeg) { refs.rightLeg.position.x += t * 0.4; (refs.rightLeg as any).rotation.z += t * 2; }
      if (refs.group) refs.group.scale.setScalar(Math.max(0, 1 - p * 0.8));
    }
  },
  {
    // 1: Fly backward — knocked off the board
    name: 'flyback',
    deathFn: (p, refs) => {
      if (refs.group) {
        refs.group.position.z -= p * p * 4;
        refs.group.position.y += Math.sin(p * Math.PI) * 1.5;
        refs.group.rotation.x -= p * Math.PI * 2;
        refs.group.scale.setScalar(Math.max(0, 1 - p));
      }
    }
  },
  {
    // 2: Spin tornado — spins rapidly and shrinks
    name: 'tornado',
    deathFn: (p, refs) => {
      if (refs.group) {
        refs.group.rotation.y += p * Math.PI * 12;
        refs.group.position.y += p * 1.5;
        refs.group.scale.setScalar(Math.max(0, 1 - p * 1.2));
      }
    }
  },
  {
    // 3: Melt into ground
    name: 'melt',
    deathFn: (p, refs) => {
      if (refs.group) {
        refs.group.scale.y = Math.max(0.01, 1 - p);
        refs.group.scale.x = 1 + p * 0.5;
        refs.group.scale.z = 1 + p * 0.5;
        refs.group.position.y -= p * 0.3;
      }
    }
  },
  {
    // 4: Uppercut launch — fly straight up
    name: 'uppercut',
    deathFn: (p, refs) => {
      if (refs.group) {
        refs.group.position.y += p * p * 6;
        refs.group.rotation.x += p * Math.PI * 3;
        refs.group.scale.setScalar(Math.max(0, 1 - p * 0.7));
      }
      if (refs.leftArm) (refs.leftArm as any).rotation.z = -Math.PI * p;
      if (refs.rightArm) (refs.rightArm as any).rotation.z = Math.PI * p;
    }
  },
  {
    // 5: Squish flat
    name: 'squish',
    deathFn: (p, refs) => {
      if (refs.group) {
        refs.group.scale.y = Math.max(0.02, 1 - p * 0.95);
        refs.group.scale.x = 1 + p * 2;
        refs.group.scale.z = 1 + p * 2;
        refs.group.position.y = -p * 0.2;
      }
    }
  },
  {
    // 6: Disintegrate — scatter upward as dust
    name: 'disintegrate',
    deathFn: (p, refs) => {
      if (refs.group) {
        refs.group.position.y += p * 0.8;
        refs.group.scale.setScalar(Math.max(0, 1 - p * 1.3));
        refs.group.rotation.y += p * Math.PI * 4;
      }
      if (refs.head) refs.head.position.y += p * 0.5;
    }
  },
  {
    // 7: Baseball hit — fly sideways
    name: 'baseball',
    deathFn: (p, refs, seed) => {
      const dir = seed.x > 0 ? 1 : -1;
      if (refs.group) {
        refs.group.position.x += dir * p * p * 5;
        refs.group.position.y += Math.sin(p * Math.PI) * 2;
        refs.group.rotation.z += dir * p * Math.PI * 3;
        refs.group.scale.setScalar(Math.max(0, 1 - p * 0.6));
      }
    }
  },
  {
    // 8: Crumble — fall apart in place
    name: 'crumble',
    deathFn: (p, refs) => {
      const t = p * 2;
      if (refs.head) { refs.head.position.y -= t * 0.1; (refs.head as any).rotation.x += t * 0.5; }
      if (refs.body) { (refs.body as any).rotation.z += t * 0.3; }
      if (refs.leftArm) { refs.leftArm.position.y -= t * 0.4; (refs.leftArm as any).rotation.z -= t; }
      if (refs.rightArm) { refs.rightArm.position.y -= t * 0.4; (refs.rightArm as any).rotation.z += t; }
      if (refs.leftLeg) { (refs.leftLeg as any).rotation.x += t * 0.6; }
      if (refs.rightLeg) { (refs.rightLeg as any).rotation.x -= t * 0.6; }
      if (refs.group) refs.group.scale.setScalar(Math.max(0, 1 - p * 0.9));
    }
  },
  {
    // 9: Vaporize — flash bright then vanish
    name: 'vaporize',
    deathFn: (p, refs) => {
      if (refs.group) {
        const flash = p < 0.3 ? 1 + p * 5 : Math.max(0, (1 - p) * 2);
        refs.group.scale.setScalar(flash);
        refs.group.position.y += p * 0.5;
      }
    }
  },
  {
    // 10: Ragdoll backward flip
    name: 'backflip',
    deathFn: (p, refs) => {
      if (refs.group) {
        refs.group.rotation.x += p * Math.PI * 2.5;
        refs.group.position.z -= p * 2;
        refs.group.position.y += Math.sin(p * Math.PI) * 1.8;
        refs.group.scale.setScalar(Math.max(0, 1 - p * 0.5));
      }
    }
  },
  {
    // 11: Spiral down — corkscrews into the ground
    name: 'spiraldown',
    deathFn: (p, refs) => {
      if (refs.group) {
        refs.group.rotation.y += p * Math.PI * 8;
        refs.group.position.y -= p * 1.5;
        refs.group.scale.setScalar(Math.max(0, 1 - p * 1.1));
      }
    }
  },
  {
    // 12: Split in half vertically
    name: 'split',
    deathFn: (p, refs) => {
      const t = p * 2;
      if (refs.leftArm) refs.leftArm.position.x -= t * 0.3;
      if (refs.leftLeg) refs.leftLeg.position.x -= t * 0.3;
      if (refs.rightArm) refs.rightArm.position.x += t * 0.3;
      if (refs.rightLeg) refs.rightLeg.position.x += t * 0.3;
      if (refs.head) { refs.head.position.y += t * 0.2; (refs.head as any).rotation.z += t * 0.5; }
      if (refs.group) refs.group.scale.setScalar(Math.max(0, 1 - p * 0.8));
    }
  },
  {
    // 13: Bounce and vanish — bounces 3 times then poof
    name: 'bounce',
    deathFn: (p, refs) => {
      if (refs.group) {
        const bounceH = Math.abs(Math.sin(p * Math.PI * 3)) * (1 - p) * 1.5;
        refs.group.position.y = bounceH;
        refs.group.scale.setScalar(Math.max(0, 1 - p));
        refs.group.rotation.y += p * Math.PI * 6;
      }
    }
  },
  {
    // 14: Slow-mo fall — dramatic lean and topple
    name: 'topple',
    deathFn: (p, refs) => {
      if (refs.group) {
        refs.group.rotation.z += p * (Math.PI / 2);
        refs.group.position.x += p * 0.4;
        refs.group.position.y -= p * 0.15;
        if (p > 0.7) refs.group.scale.setScalar(Math.max(0, 1 - (p - 0.7) * 3));
      }
    }
  },
  {
    // 15: Rocket launch — shoots upward with spin
    name: 'rocket',
    deathFn: (p, refs) => {
      if (refs.group) {
        refs.group.position.y += p * p * p * 8;
        refs.group.rotation.y += p * Math.PI * 10;
        refs.group.scale.setScalar(Math.max(0, 1 - p * 0.5));
      }
      if (refs.leftArm) (refs.leftArm as any).rotation.z = -Math.PI * 0.8;
      if (refs.rightArm) (refs.rightArm as any).rotation.z = Math.PI * 0.8;
    }
  },
  {
    // 16: Shatter — limbs fly in all directions with spin
    name: 'shatter',
    deathFn: (p, refs, seed) => {
      const t = p * 4;
      if (refs.head) { refs.head.position.set(seed.x * t, 0.5 + t * 0.8, seed.z * t); (refs.head as any).rotation.set(t * 3, t * 2, t * 4); }
      if (refs.leftArm) { refs.leftArm.position.set(-t * 0.8, t * 0.3, -t * 0.4); (refs.leftArm as any).rotation.z = -t * 5; }
      if (refs.rightArm) { refs.rightArm.position.set(t * 0.8, t * 0.5, t * 0.4); (refs.rightArm as any).rotation.z = t * 5; }
      if (refs.leftLeg) { refs.leftLeg.position.set(-t * 0.5, -t * 0.2, t * 0.6); (refs.leftLeg as any).rotation.x = t * 3; }
      if (refs.rightLeg) { refs.rightLeg.position.set(t * 0.5, -t * 0.2, -t * 0.6); (refs.rightLeg as any).rotation.x = -t * 3; }
      if (refs.body) (refs.body as any).rotation.z += t * 2;
      if (refs.group) refs.group.scale.setScalar(Math.max(0, 1 - p));
    }
  },
  {
    // 17: Implode — suck inward then pop
    name: 'implode',
    deathFn: (p, refs) => {
      if (refs.group) {
        if (p < 0.6) {
          refs.group.scale.setScalar(1 - p * 1.5);
        } else {
          refs.group.scale.setScalar(Math.max(0, (p - 0.6) * 3));
          refs.group.position.y += (p - 0.6) * 5;
        }
        refs.group.rotation.y += p * Math.PI * 6;
      }
    }
  },
  {
    // 18: Zap — electrocution shake then fall
    name: 'zap',
    deathFn: (p, refs) => {
      if (refs.group) {
        if (p < 0.5) {
          // Shaking phase
          refs.group.position.x = Math.sin(p * 120) * 0.08;
          refs.group.position.z = Math.cos(p * 90) * 0.06;
          refs.group.scale.setScalar(1 + Math.sin(p * 60) * 0.05);
        } else {
          // Collapse
          refs.group.position.x = 0;
          refs.group.position.z = 0;
          refs.group.scale.setScalar(Math.max(0, 1 - (p - 0.5) * 2));
          refs.group.position.y -= (p - 0.5) * 2;
          refs.group.rotation.x += (p - 0.5) * Math.PI;
        }
      }
    }
  },
  {
    // 19: Cartwheel away
    name: 'cartwheel',
    deathFn: (p, refs, seed) => {
      const dir = seed.x > 0 ? 1 : -1;
      if (refs.group) {
        refs.group.position.x += dir * p * 3;
        refs.group.rotation.z += dir * p * Math.PI * 4;
        refs.group.position.y = Math.abs(Math.sin(p * Math.PI * 2)) * 0.8;
        refs.group.scale.setScalar(Math.max(0, 1 - p * 0.7));
      }
    }
  },
];

// ─── Attack animation variations ─────────────────────────────────
const ATTACK_ANIMS = [
  // 0: Overhead sword slash
  (t: number, refs: { rightArm: THREE.Object3D | null; body: THREE.Object3D | null; leftArm: THREE.Object3D | null }) => {
    if (refs.rightArm) (refs.rightArm as any).rotation.x = -Math.PI / 2 + Math.sin(t * 20) * Math.PI * 0.6;
    if (refs.body) (refs.body as any).rotation.z = Math.sin(t * 10) * 0.15;
  },
  // 1: Spinning attack
  (_t: number, refs: { rightArm: THREE.Object3D | null; body: THREE.Object3D | null; leftArm: THREE.Object3D | null }) => {
    if (refs.rightArm) (refs.rightArm as any).rotation.z = Math.PI / 2;
    if (refs.leftArm) (refs.leftArm as any).rotation.z = -Math.PI / 2;
    if (refs.body) (refs.body as any).rotation.y += 0.3;
  },
  // 2: Thrust / stab
  (t: number, refs: { rightArm: THREE.Object3D | null; body: THREE.Object3D | null; leftArm: THREE.Object3D | null }) => {
    if (refs.rightArm) {
      (refs.rightArm as any).rotation.x = -Math.PI / 4 + Math.sin(t * 18) * 0.8;
      (refs.rightArm as any).rotation.z = Math.sin(t * 18) * 0.3;
    }
    if (refs.body) (refs.body as any).rotation.x = Math.sin(t * 9) * 0.1;
  },
  // 3: Double-arm smash
  (t: number, refs: { rightArm: THREE.Object3D | null; body: THREE.Object3D | null; leftArm: THREE.Object3D | null }) => {
    const swing = Math.sin(t * 16) * Math.PI * 0.4;
    if (refs.rightArm) (refs.rightArm as any).rotation.x = -Math.PI / 3 + swing;
    if (refs.leftArm) (refs.leftArm as any).rotation.x = -Math.PI / 3 + swing;
    if (refs.body) (refs.body as any).rotation.x = swing * 0.2;
  },
  // 4: Kick
  (_t: number, refs: { rightArm: THREE.Object3D | null; body: THREE.Object3D | null; leftArm: THREE.Object3D | null }) => {
    if (refs.rightArm) (refs.rightArm as any).rotation.x = -0.3;
    if (refs.body) (refs.body as any).rotation.x = Math.sin(_t * 14) * 0.2;
  },
];

// ─── Component ───────────────────────────────────────────────────
interface MechPieceProps {
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  color: 'w' | 'b';
  position: [number, number, number];
  isWalking: boolean;
  isAttacking: boolean;
  isDying: boolean;
  isWreckage: boolean;
  targetPosition?: [number, number, number];
  onClick?: () => void;
}

export const MechPiece: React.FC<MechPieceProps> = ({
  type,
  color,
  position,
  isWalking,
  isAttacking,
  isDying,
  isWreckage,
  onClick
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const weaponRef = useRef<THREE.Group>(null);

  const pal = PALETTE[color];
  const isWhite = color === 'w';

  // Pick a random kill anim and attack anim at mount
  const killAnimIndex = useMemo(() => Math.floor(Math.random() * KILL_ANIMATIONS.length), []);
  const attackAnimIndex = useMemo(() => Math.floor(Math.random() * ATTACK_ANIMS.length), []);
  const deathSeed = useMemo(() => new THREE.Vector3(
    (Math.random() - 0.5) * 2,
    Math.random(),
    (Math.random() - 0.5) * 2
  ), []);

  const [deathProgress, setDeathProgress] = useState(0);
  const deathStarted = useRef(false);

  useEffect(() => {
    if (isDying && !deathStarted.current) {
      deathStarted.current = true;
      setDeathProgress(0.001);
    }
  }, [isDying]);

  // Materials (memoized)
  const mats = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({ color: pal.body, roughness: 0.6, metalness: 0.1 }),
    limb: new THREE.MeshStandardMaterial({ color: pal.limb, roughness: 0.5, metalness: 0.15 }),
    accent: new THREE.MeshStandardMaterial({ color: pal.accent, roughness: 0.4, metalness: 0.3 }),
    accent2: new THREE.MeshStandardMaterial({ color: pal.accent2, roughness: 0.35, metalness: 0.4 }),
    glow: new THREE.MeshStandardMaterial({ color: pal.glow, emissive: pal.glow, emissiveIntensity: 2.0, roughness: 0.1 }),
    eyes: new THREE.MeshStandardMaterial({ color: pal.eyes, emissive: pal.eyes, emissiveIntensity: 3.0, roughness: 0.1 }),
    weapon: new THREE.MeshStandardMaterial({ color: pal.weapon, emissive: pal.weapon, emissiveIntensity: 1.5, roughness: 0.2, metalness: 0.6 }),
    crown: new THREE.MeshStandardMaterial({ color: pal.crown, emissive: pal.crown, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: '#5c3a1e', roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ color: '#d1d5db', roughness: 0.2, metalness: 0.85 }),
    stone: new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.9 }),
  }), [pal]);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // ── Death animation ──
    if (isDying && deathProgress > 0) {
      const newP = Math.min(1, deathProgress + delta * 0.7);
      setDeathProgress(newP);
      const killAnim = KILL_ANIMATIONS[killAnimIndex];
      killAnim.deathFn(newP, {
        group: groupRef.current,
        head: headRef.current,
        body: bodyRef.current,
        leftArm: leftArmRef.current,
        rightArm: rightArmRef.current,
        leftLeg: leftLegRef.current,
        rightLeg: rightLegRef.current,
      }, deathSeed);
      return;
    }

    if (isWreckage) return;

    // ── Idle animation ──
    if (!isWalking && !isAttacking) {
      // Gentle breathing sway
      if (bodyRef.current) {
        (bodyRef.current as any).position.y = BODY_H / 2 + LEG_H + 0.02 + Math.sin(t * 1.8) * 0.01;
      }
      // Subtle arm sway
      if (leftArmRef.current) (leftArmRef.current as any).rotation.z = -0.15 + Math.sin(t * 1.2) * 0.04;
      if (rightArmRef.current) (rightArmRef.current as any).rotation.z = 0.15 + Math.sin(t * 1.2 + 1) * 0.04;
      // Legs neutral
      if (leftLegRef.current) (leftLegRef.current as any).rotation.x = 0;
      if (rightLegRef.current) (rightLegRef.current as any).rotation.x = 0;
    }

    // ── Walk animation ──
    if (isWalking) {
      const walkSpeed = 12;
      const legSwing = Math.sin(t * walkSpeed) * 0.7;
      const armSwing = Math.sin(t * walkSpeed) * 0.5;
      const bounce = Math.abs(Math.sin(t * walkSpeed * 2)) * 0.06;

      if (leftLegRef.current) (leftLegRef.current as any).rotation.x = legSwing;
      if (rightLegRef.current) (rightLegRef.current as any).rotation.x = -legSwing;
      if (leftArmRef.current) (leftArmRef.current as any).rotation.x = -armSwing;
      if (rightArmRef.current) (rightArmRef.current as any).rotation.x = armSwing;
      if (bodyRef.current) (bodyRef.current as any).position.y = BODY_H / 2 + LEG_H + 0.02 + bounce;
    }

    // ── Attack animation ──
    if (isAttacking) {
      ATTACK_ANIMS[attackAnimIndex](t, {
        rightArm: rightArmRef.current,
        body: bodyRef.current,
        leftArm: leftArmRef.current,
      });
    }

    // ── Weapon pulse ──
    if (weaponRef.current) {
      const s = 1 + Math.sin(t * 4) * 0.08;
      weaponRef.current.scale.set(s, s, s);
    }
  });

  // ─── Weapon / accessory per piece type ───
  const renderWeapon = useCallback(() => {
    switch (type) {
      case 'p': // Sword
        return (
          <group ref={weaponRef} position={[0, -ARM_H / 2 - 0.02, 0.04]} rotation={[0.3, 0, 0]}>
            <mesh material={mats.wood}><cylinderGeometry args={[0.012, 0.012, 0.08, 6]} /></mesh>
            <mesh position={[0, 0.08, 0]} material={mats.metal}><boxGeometry args={[0.012, 0.16, 0.035]} /></mesh>
            <mesh position={[0, 0.08, 0]} material={mats.weapon}><boxGeometry args={[0.004, 0.14, 0.015]} /></mesh>
            {/* Cross guard */}
            <mesh position={[0, 0.01, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.crown}><cylinderGeometry args={[0.008, 0.008, 0.06, 6]} /></mesh>
          </group>
        );
      case 'n': // Lance
        return (
          <group ref={weaponRef} position={[0, -ARM_H / 2, 0.05]} rotation={[0.5, 0, 0]}>
            <mesh material={mats.wood}><cylinderGeometry args={[0.01, 0.01, 0.45, 6]} /></mesh>
            <mesh position={[0, 0.24, 0]} material={mats.weapon}><coneGeometry args={[0.03, 0.08, 6]} /></mesh>
          </group>
        );
      case 'b': // Staff with orb
        return (
          <group ref={weaponRef} position={[0, -ARM_H / 2, 0.04]} rotation={[0.2, 0, 0]}>
            <mesh material={mats.wood}><cylinderGeometry args={[0.01, 0.012, 0.5, 6]} /></mesh>
            <mesh position={[0, 0.28, 0]} material={mats.glow}><sphereGeometry args={[0.04, 10, 10]} /></mesh>
            <mesh position={[0, 0.28, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.crown}>
              <torusGeometry args={[0.055, 0.005, 6, 12]} />
            </mesh>
          </group>
        );
      case 'r': // Shield
        return (
          <group ref={weaponRef} position={[0, -0.02, 0.06]}>
            <mesh material={mats.accent}><cylinderGeometry args={[0.1, 0.1, 0.015, 8]} /></mesh>
            <mesh position={[0, 0, 0.01]} material={mats.crown}><cylinderGeometry args={[0.04, 0.04, 0.02, 6]} /></mesh>
          </group>
        );
      case 'q': // Scepter
        return (
          <group ref={weaponRef} position={[0, -ARM_H / 2, 0.04]} rotation={[0.2, 0, 0]}>
            <mesh material={mats.crown}><cylinderGeometry args={[0.008, 0.01, 0.4, 6]} /></mesh>
            <mesh position={[0, 0.22, 0]} material={mats.glow}><octahedronGeometry args={[0.035, 0]} /></mesh>
          </group>
        );
      case 'k': // Broadsword
        return (
          <group ref={weaponRef} position={[0, -ARM_H / 2 - 0.02, 0.05]} rotation={[0.3, 0, 0]}>
            <mesh material={mats.wood}><cylinderGeometry args={[0.015, 0.015, 0.1, 6]} /></mesh>
            <mesh position={[0, 0.015, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.crown}><cylinderGeometry args={[0.01, 0.01, 0.1, 6]} /></mesh>
            <mesh position={[0, 0.16, 0]} material={mats.metal}><boxGeometry args={[0.02, 0.28, 0.06]} /></mesh>
            <mesh position={[0, 0.16, 0]} material={mats.weapon}><boxGeometry args={[0.006, 0.24, 0.025]} /></mesh>
          </group>
        );
      default: return null;
    }
  }, [type, mats]);

  // ─── Head decoration per piece type ───
  const renderHeadAccessory = useCallback(() => {
    switch (type) {
      case 'p': // Simple helmet band
        return (
          <mesh position={[0, 0.02, 0]} material={mats.accent}>
            <torusGeometry args={[HEAD_R * 0.85, 0.012, 6, 12]} />
          </mesh>
        );
      case 'n': // Plumed helmet
        return (
          <group>
            <mesh position={[0, 0.06, 0]} material={mats.metal}>
              <sphereGeometry args={[HEAD_R * 0.85, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
            <mesh position={[0, 0.1, -0.02]} material={mats.accent}>
              <boxGeometry args={[0.02, 0.06, 0.08]} />
            </mesh>
          </group>
        );
      case 'b': // Tall pointed hat
        return (
          <mesh position={[0, 0.12, 0]} material={mats.accent2}>
            <coneGeometry args={[0.08, 0.18, 8]} />
          </mesh>
        );
      case 'r': // Flat helmet
        return (
          <mesh position={[0, 0.06, 0]} material={mats.metal}>
            <cylinderGeometry args={[HEAD_R * 0.95, HEAD_R * 0.9, 0.04, 10]} />
          </mesh>
        );
      case 'q': // Crown with gems
        return (
          <group>
            <mesh position={[0, 0.07, 0]} material={mats.crown}>
              <cylinderGeometry args={[HEAD_R * 0.8, HEAD_R * 0.85, 0.05, 8]} />
            </mesh>
            {[0, 1, 2, 3, 4, 5].map(i => {
              const a = (i / 6) * Math.PI * 2;
              return (
                <mesh key={i} position={[Math.cos(a) * HEAD_R * 0.7, 0.1, Math.sin(a) * HEAD_R * 0.7]} material={mats.crown}>
                  <coneGeometry args={[0.012, 0.035, 4]} />
                </mesh>
              );
            })}
            <mesh position={[0, 0.1, 0]} material={mats.glow}><sphereGeometry args={[0.015, 6, 6]} /></mesh>
          </group>
        );
      case 'k': // Big elaborate crown
        return (
          <group>
            <mesh position={[0, 0.08, 0]} material={mats.crown}>
              <cylinderGeometry args={[HEAD_R * 0.85, HEAD_R * 0.9, 0.065, 8]} />
            </mesh>
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
              const a = (i / 8) * Math.PI * 2;
              return (
                <mesh key={i} position={[Math.cos(a) * HEAD_R * 0.75, 0.12, Math.sin(a) * HEAD_R * 0.75]} material={mats.crown}>
                  <coneGeometry args={[0.015, 0.045, 4]} />
                </mesh>
              );
            })}
            <mesh position={[0, 0.12, 0]} material={mats.glow}><sphereGeometry args={[0.02, 8, 8]} /></mesh>
          </group>
        );
      default: return null;
    }
  }, [type, mats]);

  // ─── Body decorations per piece type ───
  const renderBodyAccessory = useCallback(() => {
    switch (type) {
      case 'k': // Shoulder pauldrons + cape
        return (
          <group>
            <mesh position={[-0.1, BODY_H / 2 + LEG_H + BODY_H * 0.35, 0]} material={mats.crown}>
              <sphereGeometry args={[0.045, 8, 8]} />
            </mesh>
            <mesh position={[0.1, BODY_H / 2 + LEG_H + BODY_H * 0.35, 0]} material={mats.crown}>
              <sphereGeometry args={[0.045, 8, 8]} />
            </mesh>
            {/* Cape */}
            <mesh position={[0, BODY_H / 2 + LEG_H - 0.02, -0.04]} rotation={[0.15, 0, 0]} material={mats.accent}>
              <boxGeometry args={[0.16, BODY_H * 1.2, 0.01]} />
            </mesh>
          </group>
        );
      case 'q': // Cape
        return (
          <mesh position={[0, BODY_H / 2 + LEG_H - 0.02, -0.04]} rotation={[0.15, 0, 0]} material={mats.accent2}>
            <boxGeometry args={[0.14, BODY_H, 0.01]} />
          </mesh>
        );
      case 'r': // Chest plate
        return (
          <mesh position={[0, BODY_H / 2 + LEG_H + 0.04, 0.03]} material={mats.metal}>
            <boxGeometry args={[0.06, 0.08, 0.01]} />
          </mesh>
        );
      default: return null;
    }
  }, [type, mats]);

  // Scale by piece importance
  const pieceScale = useMemo(() => {
    switch (type) {
      case 'p': return 1.0;
      case 'n': return 1.08;
      case 'b': return 1.08;
      case 'r': return 1.12;
      case 'q': return 1.18;
      case 'k': return 1.25;
      default: return 1.0;
    }
  }, [type]);

  if (isWreckage) {
    return (
      <group position={position} raycast={() => null}>
        <group scale={[1.2, 1.2, 1.2]}>
          {/* Small broken cross gravestone */}
          <mesh position={[0, 0.12, 0]} castShadow material={mats.stone}>
            <boxGeometry args={[0.08, 0.24, 0.04]} />
          </mesh>
          <mesh position={[0, 0.18, 0]} castShadow material={mats.stone}>
            <boxGeometry args={[0.16, 0.04, 0.04]} />
          </mesh>
          {/* Rubble bits */}
          <mesh position={[0.08, 0.02, 0.04]} rotation={[0.3, 0.5, 0.2]} material={mats.stone}>
            <boxGeometry args={[0.05, 0.04, 0.04]} />
          </mesh>
        </group>
      </group>
    );
  }

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={(e) => { if (onClick) { e.stopPropagation(); onClick(); } }}
    >
      <group scale={[pieceScale, pieceScale, pieceScale]}>
        {/* ── HEAD ── */}
        <group ref={headRef as any} position={[0, BODY_H + LEG_H + HEAD_R + 0.02, 0]}>
          <mesh castShadow material={mats.body}>
            <sphereGeometry args={[HEAD_R, 14, 14]} />
          </mesh>
          {/* Eyes */}
          <mesh position={[-0.035, 0.01, HEAD_R * 0.85]} material={mats.eyes}>
            <sphereGeometry args={[0.018, 8, 8]} />
          </mesh>
          <mesh position={[0.035, 0.01, HEAD_R * 0.85]} material={mats.eyes}>
            <sphereGeometry args={[0.018, 8, 8]} />
          </mesh>
          {/* Mouth line */}
          <mesh position={[0, -0.03, HEAD_R * 0.9]} material={mats.limb}>
            <boxGeometry args={[0.04, 0.008, 0.005]} />
          </mesh>
          {renderHeadAccessory()}
        </group>

        {/* ── BODY (torso) ── */}
        <group ref={bodyRef as any} position={[0, BODY_H / 2 + LEG_H + 0.02, 0]}>
          <mesh castShadow material={mats.body}>
            <cylinderGeometry args={[BODY_R * 1.3, BODY_R * 1.1, BODY_H, 8]} />
          </mesh>
          {/* Neck joint */}
          <mesh position={[0, BODY_H / 2, 0]} material={mats.limb}>
            <sphereGeometry args={[JOINT_R * 0.8, 6, 6]} />
          </mesh>
          {/* Hip joint */}
          <mesh position={[0, -BODY_H / 2, 0]} material={mats.limb}>
            <sphereGeometry args={[JOINT_R, 6, 6]} />
          </mesh>
        </group>

        {/* ── LEFT ARM ── */}
        <group ref={leftArmRef as any} position={[-0.07, BODY_H + LEG_H - 0.04, 0]}>
          {/* Shoulder */}
          <mesh material={mats.limb}><sphereGeometry args={[JOINT_R, 6, 6]} /></mesh>
          {/* Upper arm */}
          <mesh position={[0, -ARM_H / 2, 0]} castShadow material={mats.limb}>
            <cylinderGeometry args={[ARM_R, ARM_R * 0.8, ARM_H, 6]} />
          </mesh>
          {/* Hand */}
          <mesh position={[0, -ARM_H, 0]} material={mats.body}>
            <sphereGeometry args={[HAND_R, 6, 6]} />
          </mesh>
          {/* Left hand item for rook (shield) */}
          {type === 'r' && renderWeapon()}
        </group>

        {/* ── RIGHT ARM ── */}
        <group ref={rightArmRef as any} position={[0.07, BODY_H + LEG_H - 0.04, 0]}>
          {/* Shoulder */}
          <mesh material={mats.limb}><sphereGeometry args={[JOINT_R, 6, 6]} /></mesh>
          {/* Upper arm */}
          <mesh position={[0, -ARM_H / 2, 0]} castShadow material={mats.limb}>
            <cylinderGeometry args={[ARM_R, ARM_R * 0.8, ARM_H, 6]} />
          </mesh>
          {/* Hand */}
          <mesh position={[0, -ARM_H, 0]} material={mats.body}>
            <sphereGeometry args={[HAND_R, 6, 6]} />
          </mesh>
          {/* Right hand weapon */}
          {type !== 'r' && renderWeapon()}
        </group>

        {/* ── LEFT LEG ── */}
        <group ref={leftLegRef as any} position={[-0.04, LEG_H, 0]}>
          {/* Hip joint */}
          <mesh material={mats.limb}><sphereGeometry args={[JOINT_R * 0.9, 6, 6]} /></mesh>
          {/* Leg */}
          <mesh position={[0, -LEG_H / 2, 0]} castShadow material={mats.limb}>
            <cylinderGeometry args={[LEG_R, LEG_R * 0.85, LEG_H, 6]} />
          </mesh>
          {/* Foot */}
          <mesh position={[0, -LEG_H + 0.01, 0.015]} material={mats.accent}>
            <boxGeometry args={[FOOT_W, 0.025, 0.07]} />
          </mesh>
        </group>

        {/* ── RIGHT LEG ── */}
        <group ref={rightLegRef as any} position={[0.04, LEG_H, 0]}>
          {/* Hip joint */}
          <mesh material={mats.limb}><sphereGeometry args={[JOINT_R * 0.9, 6, 6]} /></mesh>
          {/* Leg */}
          <mesh position={[0, -LEG_H / 2, 0]} castShadow material={mats.limb}>
            <cylinderGeometry args={[LEG_R, LEG_R * 0.85, LEG_H, 6]} />
          </mesh>
          {/* Foot */}
          <mesh position={[0, -LEG_H + 0.01, 0.015]} material={mats.accent}>
            <boxGeometry args={[FOOT_W, 0.025, 0.07]} />
          </mesh>
        </group>

        {/* ── Body accessories ── */}
        {renderBodyAccessory()}
      </group>

      {/* ── Base platform ── */}
      {!isDying && (
        <group>
          <mesh position={[0, 0.008, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.32, 0.36, 0.016, 20]} />
            <meshStandardMaterial color={pal.base} roughness={0.6} metalness={0.25} />
          </mesh>
          <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.29, 0.32, 20]} />
            <meshStandardMaterial color={pal.baseGlow} emissive={pal.baseGlow} emissiveIntensity={0.6} roughness={0.2} />
          </mesh>
        </group>
      )}

      {/* ── Floating label ── */}
      {!isDying && (
        <Html
          distanceFactor={4.5}
          position={[0, (type === 'k' ? 0.95 : type === 'q' ? 0.85 : 0.72) * pieceScale, 0]}
          center
        >
          <div style={{
            background: 'rgba(10, 8, 5, 0.9)',
            border: `1px solid ${isWhite ? 'rgba(251,191,36,0.8)' : 'rgba(96,165,250,0.8)'}`,
            color: isWhite ? '#fbbf24' : '#60a5fa',
            padding: '2px 6px',
            borderRadius: '3px',
            fontSize: '8px',
            fontFamily: "'Cinzel', serif",
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: `0 0 8px ${isWhite ? 'rgba(251,191,36,0.25)' : 'rgba(96,165,250,0.25)'}`,
            letterSpacing: '1.5px',
            fontWeight: 'bold'
          }}>
            {getPieceName(type)}
          </div>
        </Html>
      )}
    </group>
  );
};
