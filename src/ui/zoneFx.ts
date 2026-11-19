/**
 * Zone effects on a skinned character: how much of every vertex belongs to the head, the body or the legs (from the weights of
 * the bones that move it); a material that flashes a zone when it is struck; and a halo, a second copy of the mesh on the same
 * skeleton, pushed out along its normals by a fixed thickness and drawn from the back, so that the aimed-at or guarded zone is
 * outlined along its own silhouette by a glow of an even width. The same two effects the primitive fighters have.
 */
import { AdditiveBlending, AlwaysStencilFunc, BackSide, BufferAttribute, Color, KeepStencilOp, MeshBasicMaterial, NotEqualStencilFunc, ReplaceStencilOp, SkinnedMesh, Vector3, type BufferGeometry, type Material, type MeshStandardMaterial, type Object3D } from 'three'
import type { Zone } from '../sim'
import { boneName } from './rig'

export const ZONE_INDEX: Record<Zone, number> = { head: 0, body: 1, legs: 2 }

/**
 * The zone of the body a bone moves. The neck belongs to the head; the legs start at the thighs, so the hips (the pelvis and the
 * hem of a top) belong to the body, and the outline of the body reaches down to the legs; the arms and hands belong to the body.
 */
export function zoneOfBone(name: string): Zone {
  const n = boneName(name)
  if (/^(Head|Neck)/.test(n)) return 'head'
  if (/^(Left|Right)(UpLeg|Leg|Foot|Toe)/.test(n)) return 'legs'
  return 'body'
}

/**
 * Adds a `zoneW` attribute (the share of the vertex that belongs to the head, the body and the legs) to the geometry of a skinned
 * mesh: the weights of the bones that move the vertex, added up by zone. A vertex between two zones belongs to both, so the
 * flash and the glow fade across the boundary instead of cutting along the triangles.
 */
export function addZoneAttribute(mesh: SkinnedMesh): void {
  const geo: BufferGeometry = mesh.geometry
  if (geo.getAttribute('zoneW')) return
  const skinIndex = geo.getAttribute('skinIndex')
  const skinWeight = geo.getAttribute('skinWeight')
  const zoneOfJoint = mesh.skeleton.bones.map((b) => ZONE_INDEX[zoneOfBone(b.name)])
  const zoneW = new Float32Array(skinIndex.count * 3)
  for (let v = 0; v < skinIndex.count; v++) {
    let total = 0
    for (let k = 0; k < 4; k++) {
      const w = skinWeight.getComponent(v, k)
      zoneW[v * 3 + (zoneOfJoint[skinIndex.getComponent(v, k)] ?? 1)]! += w
      total += w
    }
    if (total > 0) for (let z = 0; z < 3; z++) zoneW[v * 3 + z]! /= total
  }
  geo.setAttribute('zoneW', new BufferAttribute(zoneW, 3))
}

/** The values the shader reads: how much each zone flashes / glows, and in what colours. */
export interface ZoneFx {
  flash: Vector3
  flashColor: Color
  glow: Vector3
  glowColor: Color
  time: { value: number }
  /** how far the halo stands off the body (in the units of the rig's space) */
  thick: { value: number }
}

export const createZoneFx = (): ZoneFx => ({
  flash: new Vector3(),
  flashColor: new Color('#ffffff'),
  glow: new Vector3(),
  glowColor: new Color('#ffc857'),
  time: { value: 0 },
  thick: { value: 0.03 },
})

/** Sets the amount for a zone in a (head, body, legs) vector. */
export const setZone = (v: Vector3, zone: Zone, amount: number): void => {
  v.setComponent(ZONE_INDEX[zone], amount)
}

/** Gives a (cloned) material the flash of a struck zone. The uniforms are shared by all of one fighter's materials. */
export function applyZoneFx(m: MeshStandardMaterial, fx: ZoneFx): void {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFlash = { value: fx.flash }
    shader.uniforms.uFlashColor = { value: fx.flashColor }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 zoneW;\nvarying vec3 vZoneW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZoneW = zoneW;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vZoneW;\nuniform vec3 uFlash;\nuniform vec3 uFlashColor;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uFlashColor * dot(vZoneW, uFlash) * 0.5;')
  }
  m.customProgramCacheKey = () => 'zone-fx'
  m.needsUpdate = true
}

/** The character writes 1 into the stencil buffer wherever it is drawn (its materials); the halo is drawn only where it did not. */
export function writeStencil(m: MeshStandardMaterial): void {
  m.stencilWrite = true
  m.stencilRef = 1
  m.stencilFunc = AlwaysStencilFunc
  m.stencilZPass = ReplaceStencilOp
}

/**
 * The glow of a zone: a copy of the skinned mesh (same geometry, same skeleton) that is pushed out along the normals where the
 * vertices belong to a glowing zone and drawn from the back, additively. It is invisible until `fx.glow` is set for some zone.
 * It is drawn only where the character itself is not (the stencil), so what is left is a thin outline along the silhouette:
 * no lines across the body where an arm is in front of the chest, no bubble where a headphone cup is in front of the face.
 */
export function createHalo(mesh: SkinnedMesh, fx: ZoneFx): SkinnedMesh {
  const material = new MeshBasicMaterial({
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: BackSide,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: NotEqualStencilFunc,
    stencilZPass: KeepStencilOp,
  })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = { value: fx.glow }
    shader.uniforms.uGlowColor = { value: fx.glowColor }
    shader.uniforms.uTime = fx.time
    shader.uniforms.uThick = fx.thick
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 zoneW;\nuniform vec3 uGlow;\nuniform float uThick;\nvarying float vGlow;')
      .replace(
        '#include <skinning_vertex>',
        '#include <skinning_vertex>\nvGlow = dot(zoneW, uGlow);\ntransformed += normalize(objectNormal) * uThick * smoothstep(0.0, 0.5, vGlow);',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;\nuniform vec3 uGlowColor;\nuniform float uTime;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = uGlowColor;\ndiffuseColor.a = vGlow * (0.5 + 0.2 * sin(uTime * 4.0));')
  }
  material.customProgramCacheKey = () => 'zone-halo'
  const halo = new SkinnedMesh(mesh.geometry, Array.isArray(mesh.material) ? mesh.material.map(() => material) : material)
  halo.bind(mesh.skeleton, mesh.bindMatrix)
  halo.position.copy(mesh.position)
  halo.quaternion.copy(mesh.quaternion)
  halo.scale.copy(mesh.scale)
  halo.frustumCulled = false
  halo.renderOrder = 2
  halo.visible = false
  return halo
}

/**
 * Tidies the materials of a character the way a fight needs them: opaque skin and clothes, cut-out eyelashes.
 * Mixamo's glTF marks some materials as blended; blended materials do not write depth (three.js sets that when it loads
 * them), and once they are drawn as opaque that is wrong: the parts that are drawn later (the floor, the inside of a
 * headphone cup) paint over the parts that are drawn earlier, depending on the draw order, so the body "disappears".
 */
export function tidyMaterial(m: Material): void {
  const mat = m as MeshStandardMaterial
  mat.transparent = false
  mat.depthWrite = true
  mat.depthTest = true
  mat.alphaTest = /lash|hair/i.test(mat.name) ? 0.5 : 0
}

/** Every skinned mesh under an object. */
export function skinnedMeshes(root: Object3D): SkinnedMesh[] {
  const out: SkinnedMesh[] = []
  root.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) out.push(o as SkinnedMesh)
  })
  return out
}
