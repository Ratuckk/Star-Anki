// Harness headless (Node) que roda o sistema de inimigos REAL (createEnemiesSystem) por frames
// simulados, com trilho/efeitos mínimos. Usado pelos validators de Tank e do Dourado: observa
// estado por frame e projéteis no sistema — não chama funções internas de gameplay para "forçar"
// resultado (só posiciona o jogador/aliados e dispara o pipeline normal de update).
import * as THREE from 'three'
import { createEnemiesSystem } from '../../src/enemies/index.js'

export function makeRail(isArena = false) {
  const frame = { position: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(1, 0, 0) }
  const v0 = new THREE.Vector3()
  const base = {
    isArena: () => isArena, getArenaCenter: () => v0, getArenaRadius: () => 120, getArenaSpeed: () => 0,
    getSpawnFrame: () => frame, getFrameAt: () => frame, getPlayerPosition: () => v0, getShipNosePosition: () => v0,
    getDistance: () => 0, getFrameAtDistance: () => frame, getShipHitboxPoints: () => [{ worldPos: v0, radius: 1.0 }],
    getPlayerLateral: () => ({ x: 0, y: 0 }), getPlayerLateralOffset: () => ({ x: 0, y: 0 }), getPlayerLateralVelocity: () => ({ x: 0, y: 0 }),
    isLateralDashActive: () => false, isTumbling: () => false, isTumbleControlLocked: () => false, isFullSpinActive: () => false,
    getArenaAttitude: () => ({ pitch: 0, roll: 0 }),
  }
  const rail = new Proxy(base, { get: (t, p) => (p in t ? t[p] : () => {}) })
  return { rail, frame }
}

export function makeEffects() {
  return new Proxy({}, { get: () => () => {} })
}

export function createEnemyRuntime({ isArena = false, level = 1 } = {}) {
  const scene = new THREE.Scene()
  const { rail, frame } = makeRail(isArena)
  const enemies = createEnemiesSystem(scene, rail, makeEffects())
  if (enemies.setDifficultyLevel) enemies.setDifficultyLevel(level)
  const playerPosition = new THREE.Vector3()
  return { THREE, scene, rail, frame, enemies, playerPosition }
}
