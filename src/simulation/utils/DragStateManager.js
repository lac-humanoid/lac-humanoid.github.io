import * as THREE from 'three';

// MuJoCo-native perturb interaction, matching the deploy sim2sim viewer
// (mujoco.viewer.launch_passive) exactly:
//   double-click        : select body (double-click empty space to deselect)
//   Ctrl + left-drag    : ROTATE perturb  -> pure torque   (+Shift: horizontal-plane variant)
//   Ctrl + right-drag   : TRANSLATE perturb -> force at the selection point (+Shift: horizontal)
//   plain drags / wheel : camera only (OrbitControls: left rotate, right pan, wheel zoom)
//
// Instead of re-implementing the spring math, this calls the SAME native functions the
// desktop viewer uses — mjv_initPerturb / mjv_movePerturb / mjv_applyPerturbForce — via
// the wasm bindings. Cross-checked bit-identical (0.0) against python mujoco 3.8.1 on the
// deploy G1 scene for translate (mass-scaled spring + damping), rotate (pure torque),
// localmass, scale, and the camera-plane mouse mapping (scratchpad perturb_node.mjs /
// perturb_py.py, 2026-07-31). No force clamp — same as the deploy viewer.
//
// Coordinate note: three.js is y-up, MuJoCo z-up. three (x,y,z) -> mujoco (x,-z,y).

const MJ_MOUSE = { ROTATE_V: 1, ROTATE_H: 2, MOVE_V: 3, MOVE_H: 4 };
const MJ_PERT = { TRANSLATE: 1, ROTATE: 2 };

// rotate mujoco vector v by quat q (w,x,y,z); invert=true applies q^-1 (world -> body)
function mjQuatRotate(q, v, invert) {
  let [w, x, y, z] = q;
  if (invert) { x = -x; y = -y; z = -z; }
  const uvx = y * v[2] - z * v[1], uvy = z * v[0] - x * v[2], uvz = x * v[1] - y * v[0];
  const uuvx = y * uvz - z * uvy, uuvy = z * uvx - x * uvz, uuvz = x * uvy - y * uvx;
  return [v[0] + 2 * (w * uvx + uuvx), v[1] + 2 * (w * uvy + uuvy), v[2] + 2 * (w * uvz + uuvz)];
}

export class DragStateManager {
  constructor(scene, renderer, camera, container, controls) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.controls = controls;
    this.mousePos = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Line.threshold = 0.1;

    // mujoco handles — set via setMujoco() after each scene load
    this.mujoco = null;
    this.model = null;
    this.data = null;
    this.pert = null;
    this.mjCam = null;
    this.mjOpt = null;
    this.mjScene = null;

    // selection state
    this.selBody = -1;             // mujoco body id (>0) or -1
    this.selLocalPos = [0, 0, 0];  // selection point in body frame (mujoco coords)
    this.previouslySelected = null;
    this.higlightColor = 0xff0000;

    // perturb-drag state
    this.active = false;           // a Ctrl-drag is in progress
    this.mode = 0;                 // MJ_PERT.TRANSLATE or .ROTATE while active
    this.shift = false;
    this.lastX = 0;
    this.lastY = 0;

    // Perturb gain policy (user decision 2026-07-31, after hands-on testing): EVERY body
    // uses the HAND's localmass (wrist_roll_rubber_hand ≈ 2.1) instead of its own native
    // value (torso 23.1, pelvis 20.5, ... — 11× spread). The user is happy with the hand
    // feel and wants it uniform; it also kills the force fluctuation, since both sources
    // (spring response to gait sway, damping 10·localmass·v response to velocity spikes)
    // are proportional to localmass — torso drops 2218→210 N/m spring, 222→21 N·s/m
    // damping. localmassOverride = null restores native per-body localmass; localmassScale
    // multiplies on top. Both live-tunable: __demo.dragStateManager.* (read at Ctrl-press).
    this.localmassOverride = 2.1;
    this.localmassScale = 1.0;

    // Wrench clamps (user decision 2026-08-01): cap at the TRAINING single-event limits —
    // force 70 N (the training single-event force cap), torque 5 N·m. Keeps every interaction inside the
    // training distribution. TRANSLATE clamps |F| and scales the lever torque by the same
    // factor (τ = (p−xipos)×F, so proportional scaling keeps the wrench physical);
    // ROTATE clamps the pure |τ|. Set to Infinity to disable.
    this.forceClamp = 70.0;
    this.torqueClamp = 5.0;

    // wrench readout (updated each applyPerturb)
    this.lastForce = 0;            // |F| N
    this.lastTorque = 0;           // |tau| N.m

    // force arrow (red) at the selection point; torque arrow (purple) on the body axis
    this.arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 1, 0xff3b3b);
    this.torqueArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 1, 0xb266ff);
    for (const a of [this.arrow, this.torqueArrow]) {
      a.line.material.transparent = true; a.cone.material.transparent = true;
      a.line.material.opacity = 0.85; a.cone.material.opacity = 0.85;
      a.visible = false;
      this.scene.add(a);
    }

    container.addEventListener('pointerdown', this.onPointer.bind(this), true);
    document.addEventListener('pointermove', this.onPointer.bind(this), true);
    document.addEventListener('pointerup', this.onPointer.bind(this), true);
    container.addEventListener('dblclick', this.onPointer.bind(this), false);
    // OrbitControls already suppresses the context menu on its own element, but the
    // Ctrl+right-drag gesture must never open one even if that changes.
    container.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // (Re)bind mujoco objects after a scene (re)load. Recreates the MjvScene mirror.
  setMujoco(mujoco, model, data) {
    if (this.mjScene) { this.mjScene.delete(); this.mjScene = null; }
    if (this.pert) { this.pert.delete(); this.pert = null; }
    if (this.mjCam) { this.mjCam.delete(); this.mjCam = null; }
    if (this.mjOpt) { this.mjOpt.delete(); this.mjOpt = null; }
    this.mujoco = mujoco;
    this.model = model;
    this.data = data;
    this.pert = new mujoco.MjvPerturb();
    mujoco.mjv_defaultPerturb(this.pert);
    this.mjCam = new mujoco.MjvCamera();
    mujoco.mjv_defaultCamera(this.mjCam);
    this.mjOpt = new mujoco.MjvOption();
    mujoco.mjv_defaultOption(this.mjOpt);
    this.mjScene = new mujoco.MjvScene(model, 2000);
    this.selBody = -1;
    this.active = false;
    if (this.previouslySelected) {
      this.previouslySelected.material.emissive.setHex(0x000000);
      this.previouslySelected = null;
    }
  }

  // Mirror the three.js orbit camera into the MjvCamera and refresh the MjvScene, so
  // mjv_initPerturb / mjv_movePerturb see the same view the user does. az/el convention
  // verified numerically: forward = normalize(lookat - campos), az = atan2(fy,fx),
  // el = asin(fz) (degrees).
  syncCamera() {
    const t = this.controls.target, c = this.camera.position;
    // three -> mujoco coords
    const lookat = [t.x, -t.z, t.y];
    const campos = [c.x, -c.z, c.y];
    const dx = lookat[0] - campos[0], dy = lookat[1] - campos[1], dz = lookat[2] - campos[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
    this.mjCam.lookat[0] = lookat[0]; this.mjCam.lookat[1] = lookat[1]; this.mjCam.lookat[2] = lookat[2];
    this.mjCam.distance = dist;
    this.mjCam.azimuth = Math.atan2(dy, dx) * 180 / Math.PI;
    this.mjCam.elevation = Math.asin(Math.max(-1, Math.min(1, dz / dist))) * 180 / Math.PI;
    this.mujoco.mjv_updateScene(this.model, this.data, this.mjOpt, this.pert, this.mjCam, 7, this.mjScene);
  }

  updateRaycaster(x, y) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mousePos.x = ((x - rect.left) / rect.width) * 2 - 1;
    this.mousePos.y = -((y - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mousePos, this.camera);
  }

  // Double-click: raycast-select a body and store the surface point in body-local
  // mujoco coordinates (= pert.localpos, like the native viewer's mjv_select).
  selectAt(x, y) {
    this.updateRaycaster(x, y);
    const intersects = this.raycaster.intersectObjects(this.scene.children);
    for (const it of intersects) {
      const obj = it.object;
      if (obj.bodyID === undefined || obj.bodyID === null) continue;
      if (obj.bodyID <= 0) break;  // world body -> treat as empty space
      const b = obj.bodyID;
      const p = it.point;               // three world coords
      const pm = [p.x, -p.z, p.y];      // mujoco world coords
      const xpos = this.data.xpos, xquat = this.data.xquat;
      const rel = [pm[0] - xpos[3 * b], pm[1] - xpos[3 * b + 1], pm[2] - xpos[3 * b + 2]];
      const q = [xquat[4 * b], xquat[4 * b + 1], xquat[4 * b + 2], xquat[4 * b + 3]];
      this.selLocalPos = mjQuatRotate(q, rel, true);
      this.selBody = b;
      if (this.previouslySelected) this.previouslySelected.material.emissive.setHex(0x000000);
      obj.material.emissive.setHex(this.higlightColor);
      this.previouslySelected = obj;
      return;
    }
    // empty space -> deselect
    this.selBody = -1;
    if (this.previouslySelected) {
      this.previouslySelected.material.emissive.setHex(0x000000);
      this.previouslySelected = null;
    }
  }

  startPerturb(button, x, y, shiftKey) {
    if (this.selBody <= 0 || !this.pert) return;
    this.syncCamera();
    this.pert.select = this.selBody;
    this.pert.flexselect = -1;
    this.pert.skinselect = -1;
    for (let i = 0; i < 3; i++) this.pert.localpos[i] = this.selLocalPos[i];
    this.pert.active = 0;
    this.mujoco.mjv_initPerturb(this.model, this.data, this.mjScene, this.pert);
    this.pert.localmass = (this.localmassOverride ?? this.pert.localmass) * this.localmassScale;
    this.mode = (button === 2) ? MJ_PERT.TRANSLATE : MJ_PERT.ROTATE;
    this.pert.active = this.mode;
    this.active = true;
    this.shift = !!shiftKey;
    this.lastX = x; this.lastY = y;
    this.controls.enabled = false;
  }

  movePerturb(x, y, shiftKey) {
    if (!this.active) return;
    this.shift = !!shiftKey;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const reldx = (x - this.lastX) / rect.height;   // same normalization as the native app
    const reldy = (y - this.lastY) / rect.height;   // browser y-down == GLFW y-down
    this.lastX = x; this.lastY = y;
    const action = (this.mode === MJ_PERT.TRANSLATE)
      ? (this.shift ? MJ_MOUSE.MOVE_H : MJ_MOUSE.MOVE_V)
      : (this.shift ? MJ_MOUSE.ROTATE_H : MJ_MOUSE.ROTATE_V);
    // NO syncCamera here: the camera cannot move during an active perturb (OrbitControls
    // disabled, follow-cam frozen), and mjv_updateScene per pointermove (100+ Hz mouse
    // events, full scene rebuild each call) was measured to drag the sim from 50 to
    // ~30 Hz. The MjvScene mirrored at Ctrl-press stays valid for the whole drag.
    this.mujoco.mjv_movePerturb(this.model, this.data, action, reldx, reldy, this.mjScene, this.pert);
  }

  endPerturb() {
    if (this.pert) this.pert.active = 0;
    this.active = false;
    this.mode = 0;
    this.controls.enabled = true;
    this.lastForce = 0;
    this.lastTorque = 0;
    this.arrow.visible = false;
    this.torqueArrow.visible = false;
  }

  // Called once per 0.02 s outer tick (NOT per substep) from the main loop: zero xfrc and
  // let the native perturb spring write the wrench, which is then HELD across the physics
  // substeps — the exact Simulate::Sync() cadence of the deploy viewer (VIEWER_DT = 0.02).
  // Recomputing per substep makes the damping term track gait velocity spikes at 500 Hz
  // (measured ±60% |F| swings on the torso); the 50 Hz sample-and-hold matches native feel.
  applyPerturb() {
    if (!this.data) return;
    const xfrc = this.data.xfrc_applied;
    for (let i = 0; i < xfrc.length; i++) xfrc[i] = 0;
    if (!this.active || this.selBody <= 0) return;
    this.mujoco.mjv_applyPerturbForce(this.model, this.data, this.pert);

    const b = this.selBody;
    let fx = xfrc[6 * b], fy = xfrc[6 * b + 1], fz = xfrc[6 * b + 2];
    let tx = xfrc[6 * b + 3], ty = xfrc[6 * b + 4], tz = xfrc[6 * b + 5];
    let fMag = Math.sqrt(fx * fx + fy * fy + fz * fz);
    let tMag = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (this.mode === MJ_PERT.TRANSLATE && fMag > this.forceClamp) {
      const s = this.forceClamp / fMag;   // scale F and its lever torque together
      fx *= s; fy *= s; fz *= s; tx *= s; ty *= s; tz *= s;
      fMag = this.forceClamp; tMag *= s;
    } else if (this.mode === MJ_PERT.ROTATE && tMag > this.torqueClamp) {
      const s = this.torqueClamp / tMag;
      tx *= s; ty *= s; tz *= s;
      tMag = this.torqueClamp;
    }
    xfrc[6 * b] = fx; xfrc[6 * b + 1] = fy; xfrc[6 * b + 2] = fz;
    xfrc[6 * b + 3] = tx; xfrc[6 * b + 4] = ty; xfrc[6 * b + 5] = tz;
    this.lastForce = fMag;
    this.lastTorque = tMag;

    // visuals (mujoco -> three: (x,y,z) -> (x, z, -y))
    if (this.mode === MJ_PERT.TRANSLATE && this.lastForce > 1e-6) {
      // arrow from the selection point along F, length ~ |F|
      const xpos = this.data.xpos, xquat = this.data.xquat;
      const q = [xquat[4 * b], xquat[4 * b + 1], xquat[4 * b + 2], xquat[4 * b + 3]];
      const off = mjQuatRotate(q, this.selLocalPos, false);
      const px = xpos[3 * b] + off[0], py = xpos[3 * b + 1] + off[1], pz = xpos[3 * b + 2] + off[2];
      this.arrow.position.set(px, pz, -py);
      this.arrow.setDirection(new THREE.Vector3(fx, fz, -fy).normalize());
      this.arrow.setLength(Math.min(1.2, 0.006 * this.lastForce), 0.06, 0.03);
      this.arrow.visible = true;
      this.torqueArrow.visible = false;
    } else if (this.mode === MJ_PERT.ROTATE && this.lastTorque > 1e-6) {
      const xpos = this.data.xpos;
      this.torqueArrow.position.set(xpos[3 * b], xpos[3 * b + 2], -xpos[3 * b + 1]);
      this.torqueArrow.setDirection(new THREE.Vector3(tx, tz, -ty).normalize());
      this.torqueArrow.setLength(Math.min(1.2, 0.05 * this.lastTorque), 0.06, 0.03);
      this.torqueArrow.visible = true;
      this.arrow.visible = false;
    } else {
      this.arrow.visible = false;
      this.torqueArrow.visible = false;
    }
  }

  onPointer(evt) {
    if (evt.type === 'pointerdown') {
      if (evt.ctrlKey && (evt.button === 0 || evt.button === 2)) {
        this.startPerturb(evt.button, evt.clientX, evt.clientY, evt.shiftKey);
        if (this.active) { evt.preventDefault(); evt.stopPropagation(); }
      }
    } else if (evt.type === 'pointermove') {
      if (this.active) this.movePerturb(evt.clientX, evt.clientY, evt.shiftKey);
    } else if (evt.type === 'pointerup') {
      if (this.active) this.endPerturb();
    } else if (evt.type === 'dblclick') {
      this.selectAt(evt.clientX, evt.clientY);
    }
  }
}
