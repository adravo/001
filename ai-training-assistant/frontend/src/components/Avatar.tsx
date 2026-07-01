import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ResponseTone } from '../lib/api';
import type { MutableLevel } from '../lib/lipSyncEngine';

export interface AvatarHandle {
  triggerGesture: (tone: ResponseTone) => void;
}

interface AvatarProps {
  avatarUrl: string;
  mouthLevel: MutableLevel;
}

// RPM avatars export ARKit/Oculus blend shapes under these common names,
// depending on which viseme set was requested at export time.
const MOUTH_OPEN_KEYS = ['mouthOpen', 'viseme_aa', 'jawOpen'];
const BLINK_LEFT_KEYS = ['eyeBlinkLeft', 'eyesClosedL'];
const BLINK_RIGHT_KEYS = ['eyeBlinkRight', 'eyesClosedR'];

interface MorphTarget {
  mesh: THREE.Mesh;
  index: number;
}

function findMorphTargets(root: THREE.Object3D, candidateKeys: string[]): MorphTarget[] {
  const targets: MorphTarget[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const dict = mesh.morphTargetDictionary;
    if (!dict) return;
    for (const key of candidateKeys) {
      if (key in dict) {
        targets.push({ mesh, index: dict[key] });
        break;
      }
    }
  });
  return targets;
}

function findBone(root: THREE.Object3D, namePattern: RegExp): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (!found && (child as THREE.Bone).isBone && namePattern.test(child.name)) {
      found = child;
    }
  });
  return found;
}

const GESTURE_DURATION_MS = 700;

export const Avatar = forwardRef<AvatarHandle, AvatarProps>(({ avatarUrl, mouthLevel }, ref) => {
  const { scene } = useGLTF(avatarUrl);
  const group = useRef<THREE.Group>(null);

  const mouthTargets = useMemo(() => findMorphTargets(scene, MOUTH_OPEN_KEYS), [scene]);
  const blinkTargets = useMemo(
    () => [...findMorphTargets(scene, BLINK_LEFT_KEYS), ...findMorphTargets(scene, BLINK_RIGHT_KEYS)],
    [scene],
  );
  const headBone = useMemo(() => findBone(scene, /head/i), [scene]);

  const gestureRef = useRef<{ tone: ResponseTone; startedAt: number } | null>(null);
  const nextBlinkAt = useRef(performance.now() + 2000 + Math.random() * 2000);
  const BLINK_DURATION_MS = 140;

  useImperativeHandle(ref, () => ({
    triggerGesture: (tone: ResponseTone) => {
      gestureRef.current = { tone, startedAt: performance.now() };
    },
  }));

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [scene]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // Lip-sync: drive mouth-open morph targets from the current audio level.
    for (const { mesh, index } of mouthTargets) {
      if (!mesh.morphTargetInfluences) continue;
      const current = mesh.morphTargetInfluences[index] ?? 0;
      mesh.morphTargetInfluences[index] = THREE.MathUtils.lerp(current, mouthLevel.current, 0.4);
    }

    // Idle blinking: brief triangular pulse every ~2.5-5.5s.
    const now = performance.now();
    const msUntilBlink = nextBlinkAt.current - now;
    let blinkValue = 0;
    if (msUntilBlink <= 0 && msUntilBlink > -BLINK_DURATION_MS) {
      blinkValue = 1 - Math.abs(-msUntilBlink - BLINK_DURATION_MS / 2) / (BLINK_DURATION_MS / 2);
    } else if (msUntilBlink <= -BLINK_DURATION_MS) {
      nextBlinkAt.current = now + 2500 + Math.random() * 3000;
    }
    for (const { mesh, index } of blinkTargets) {
      if (!mesh.morphTargetInfluences) continue;
      mesh.morphTargetInfluences[index] = blinkValue;
    }

    // Idle breathing bob for the whole avatar.
    if (group.current) {
      group.current.position.y = Math.sin(t * 1.2) * 0.01;
    }

    // Gesture + idle head motion.
    if (headBone) {
      const gesture = gestureRef.current;
      const elapsed = gesture ? now - gesture.startedAt : Infinity;
      if (gesture && elapsed < GESTURE_DURATION_MS) {
        const progress = elapsed / GESTURE_DURATION_MS;
        const wave = Math.sin(progress * Math.PI);
        switch (gesture.tone) {
          case 'positive':
            headBone.rotation.x = -0.18 * wave; // gentle nod
            headBone.rotation.z = 0;
            break;
          case 'thinking':
            headBone.rotation.z = 0.14 * wave; // head tilt
            headBone.rotation.x = 0;
            break;
          case 'concerned':
            headBone.rotation.x = 0.08 * Math.sin(progress * Math.PI * 3); // slow shake
            headBone.rotation.z = 0;
            break;
          default:
            headBone.rotation.x = 0;
            headBone.rotation.z = 0;
        }
      } else {
        if (gesture) gestureRef.current = null;
        headBone.rotation.x = THREE.MathUtils.lerp(headBone.rotation.x, Math.sin(t * 0.6) * 0.02, 0.1);
        headBone.rotation.z = THREE.MathUtils.lerp(headBone.rotation.z, 0, 0.1);
      }
    }
  });

  return (
    <group ref={group} dispose={null}>
      <primitive object={scene} />
    </group>
  );
});

Avatar.displayName = 'Avatar';
