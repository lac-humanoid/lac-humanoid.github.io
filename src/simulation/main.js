import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DragStateManager } from './utils/DragStateManager.js';
import { downloadExampleScenesFolder, getPosition, getQuaternion, toMujocoPos, reloadScene, reloadPolicy, setLacInitialPose } from './mujocoUtils.js';
import { DEFAULT_BASE_HEIGHT, DEFAULT_STIFFNESS_5, DEFAULT_JOINT_POS_23 } from './lac/constants.js';

const defaultPolicy = "/examples/checkpoints/lac/policy.json";

export class MuJoCoDemo {
  constructor(mujoco) {
    this.mujoco = mujoco;
    mujoco.FS.mkdir('/working');
    mujoco.FS.mount(mujoco.MEMFS, { root: '.' }, '/working');

    this.params = { paused: true };
    // LAC command state — mutated by the Demo.vue UI, read by readPolicyState() each step.
    this.lacCmd = {
      linVel: new Float32Array([0, 0]),
      angVel: new Float32Array([0]),
      waistYaw: new Float32Array([0]),
      baseHeight: new Float32Array([DEFAULT_BASE_HEIGHT]),
      refArm10: Float32Array.from(DEFAULT_JOINT_POS_23.slice(13, 23)),
      stiffness5: Float32Array.from(DEFAULT_STIFFNESS_5),
    };
    this.policyRunner = null;
    this.kpPolicy = null;
    this.kdPolicy = null;
    this.actionTarget = null;
    this.model = null;
    this.data = null;
    this.simulation = null;
    this.currentPolicyPath = defaultPolicy;

    this.bodies = {};
    this.lights = {};

    this.container = document.getElementById('mujoco-container');

    this.scene = new THREE.Scene();
    this.scene.name = 'scene';

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.001, 100);
    this.camera.name = 'PerspectiveCamera';
    // Default view matches the deploy viewer's default free camera: distance = 1.5 x
    // stat.extent(2.0) = 3.0 m, azimuth -130 / elevation -20 (deploy scene <visual><global>).
    // This matters for perturb feel: pert.scale (mouse->world gain) is proportional to
    // camera distance, and the old 4.5 m default made every drag ramp force 1.5x faster
    // than the native default view — most noticeable on the stiff torso spring.
    // mujoco campos [1.812, 2.159, 1.726] -> three (x, z, -y):
    this.camera.position.set(1.812, 1.726, -2.159);
    this.scene.add(this.camera);

    this.scene.background = new THREE.Color(0.15, 0.25, 0.35);
    this.scene.fog = null;

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
    this.ambientLight.name = 'AmbientLight';
    this.scene.add(this.ambientLight);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderScale = 2.0;
    this.renderer.setPixelRatio(this.renderScale);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.simStepHz = 0;
    this._stepFrameCount = 0;
    this._stepLastTime = performance.now();
    this._lastRenderTime = 0;

    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.7, 0);
    this.controls.panSpeed = 2;
    this.controls.zoomSpeed = 1;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.10;
    this.controls.screenSpacePanning = true;
    this.controls.update();

    window.addEventListener('resize', this.onWindowResize.bind(this));

    this.dragStateManager = new DragStateManager(this.scene, this.renderer, this.camera, this.container.parentElement, this.controls);

    this.followEnabled = false;
    this.followHeight = 0.75;
    this.followLerp = 0.05;
    this.followTarget = new THREE.Vector3();
    this.followTargetDesired = new THREE.Vector3();
    this.followDelta = new THREE.Vector3();
    this.followOffset = new THREE.Vector3();
    this.followInitialized = false;
    this.followBodyId = null;
    this.followDistance = this.camera.position.distanceTo(this.controls.target);

    this.lastSimState = {
      bodies: new Map(),
      lights: new Map(),
      tendons: {
        numWraps: 0,
        matrix: new THREE.Matrix4()
      }
    };

    this.renderer.setAnimationLoop(this.render.bind(this));

    this.reloadScene = reloadScene.bind(this);
    this.reloadPolicy = reloadPolicy.bind(this);
  }

  async init() {
    await downloadExampleScenesFolder(this.mujoco);
    await this.reloadScene('lac_g1_23dof/g1_23dof.xml');
    this.updateFollowBodyId();
    await this.reloadPolicy(defaultPolicy);
    this.alive = true;
  }

  async reload(mjcf_path) {
    await this.reloadScene(mjcf_path);
    this.updateFollowBodyId();
    this.timestep = this.model.opt.timestep;
    this.decimation = Math.max(1, Math.round(0.02 / this.timestep));

    console.log('timestep:', this.timestep, 'decimation:', this.decimation);

    await this.reloadPolicy(this.currentPolicyPath ?? defaultPolicy);
    this.alive = true;
  }

  setFollowEnabled(enabled) {
    this.followEnabled = Boolean(enabled);
    this.followInitialized = false;
    if (this.followEnabled) {
      this.followOffset.subVectors(this.camera.position, this.controls.target);
      if (this.followOffset.lengthSq() === 0) {
        this.followOffset.set(0, 0, 1);
      }
      this.followOffset.setLength(this.followDistance);
      this.camera.position.copy(this.controls.target).add(this.followOffset);
      this.controls.update();
    }
  }

  updateFollowBodyId() {
    if (Number.isInteger(this.pelvis_body_id)) {
      this.followBodyId = this.pelvis_body_id;
      return;
    }
    if (this.model && this.model.nbody > 1) {
      this.followBodyId = 1;
    }
  }

  updateCameraFollow() {
    if (!this.followEnabled) {
      return;
    }
    // Freeze the follow-cam while a perturb drag is active: the native viewer's camera is
    // static, so the world-fixed spring anchor stays fixed ON SCREEN. With the follow-cam
    // chasing the pushed base, the whole frame swims and the pull feels floaty (torso only —
    // hand drags barely move the base). Follow resumes on release.
    if (this.dragStateManager?.active) {
      return;  // on release the lerp glides the camera back — no snap
    }
    const bodyId = Number.isInteger(this.followBodyId) ? this.followBodyId : null;
    if (bodyId === null) {
      return;
    }
    const cached = this.lastSimState.bodies.get(bodyId);
    if (!cached) {
      return;
    }
    this.followTargetDesired.set(cached.position.x, this.followHeight, cached.position.z);
    if (!this.followInitialized) {
      this.followTarget.copy(this.followTargetDesired);
      this.followInitialized = true;
    } else {
      this.followTarget.lerp(this.followTargetDesired, this.followLerp);
    }

    this.followDelta.subVectors(this.followTarget, this.controls.target);
    this.controls.target.copy(this.followTarget);
    this.camera.position.add(this.followDelta);
  }

  async main_loop() {
    if (!this.policyRunner) {
      return;
    }

    while (this.alive) {
      const loopStart = performance.now();

      if (!this.params.paused && this.model && this.data && this.simulation && this.policyRunner) {
        const state = this.readPolicyState();

        try {
          this.actionTarget = await this.policyRunner.step(state);
        } catch (e) {
          console.error('Inference error in main loop:', e);
          this.alive = false;
          break;
        }

        // MuJoCo-native perturb (Ctrl+left = torque, Ctrl+right = force at point).
        // Applied ONCE per 0.02 s outer tick and HELD constant across the substeps —
        // the exact cadence of the deploy viewer, where Simulate::Sync() (called at
        // VIEWER_DT = 0.02 by unitree_mujoco.py) does mju_zero(xfrc) +
        // mjv_applyPerturbForce once per sync while physics steps in between
        // (verified against simulate.cc 3.8.1). Recomputing per substep instead makes
        // the damping term (10·localmass·v) track gait velocity spikes at 500 Hz —
        // measured ±60% |F| swings on the torso vs ±10% on the hand.
        this.dragStateManager.applyPerturb();
        this.lastDragForce = this.dragStateManager.lastForce;
        this.lastDragTorque = this.dragStateManager.lastTorque;

        // PD recomputed EVERY physics substep (200 Hz) with fresh qpos/qvel — this is the
        // correct, stable choice (a headless closed-loop diagnostic showed per-substep PD is
        // smooth in all integrator/friction/foot configs, while holding ctrl across substeps
        // makes the arm joints explode). See export/diag_twitch.py.
        for (let substep = 0; substep < this.decimation; substep++) {
          if (this.control_type === 'joint_position') {
            for (let i = 0; i < this.numActions; i++) {
              const qpos_adr = this.qpos_adr_policy[i];
              const qvel_adr = this.qvel_adr_policy[i];
              const ctrl_adr = this.ctrl_adr_policy[i];

              const targetJpos = this.actionTarget ? this.actionTarget[i] : 0.0;
              const kp = this.kpPolicy ? this.kpPolicy[i] : 0.0;
              const kd = this.kdPolicy ? this.kdPolicy[i] : 0.0;
              const torque = kp * (targetJpos - this.simulation.qpos[qpos_adr]) + kd * (0 - this.simulation.qvel[qvel_adr]);
              let ctrlValue = torque;
              const ctrlRange = this.model?.actuator_ctrlrange;
              if (ctrlRange && ctrlRange.length >= (ctrl_adr + 1) * 2) {
                const min = ctrlRange[ctrl_adr * 2];
                const max = ctrlRange[(ctrl_adr * 2) + 1];
                if (Number.isFinite(min) && Number.isFinite(max) && min < max) {
                  ctrlValue = Math.min(Math.max(ctrlValue, min), max);
                }
              }
              this.simulation.ctrl[ctrl_adr] = ctrlValue;
            }
          } else if (this.control_type === 'torque') {
            console.error('Torque control not implemented yet.');
          }

          this.simulation.step();
        }

        for (let b = 0; b < this.model.nbody; b++) {
          if (!this.bodies[b]) {
            continue;
          }
          if (!this.lastSimState.bodies.has(b)) {
            this.lastSimState.bodies.set(b, {
              position: new THREE.Vector3(),
              quaternion: new THREE.Quaternion()
            });
          }
          const cached = this.lastSimState.bodies.get(b);
          getPosition(this.simulation.xpos, b, cached.position);
          getQuaternion(this.simulation.xquat, b, cached.quaternion);
        }

        const numLights = this.model.nlight;
        for (let l = 0; l < numLights; l++) {
          if (!this.lights[l]) {
            continue;
          }
          if (!this.lastSimState.lights.has(l)) {
            this.lastSimState.lights.set(l, {
              position: new THREE.Vector3(),
              direction: new THREE.Vector3()
            });
          }
          const cached = this.lastSimState.lights.get(l);
          getPosition(this.simulation.light_xpos, l, cached.position);
          getPosition(this.simulation.light_xdir, l, cached.direction);
        }

        this.lastSimState.tendons.numWraps = {
          count: this.model.nwrap,
          matrix: this.lastSimState.tendons.matrix
        };

        this._stepFrameCount += 1;
        const now = performance.now();
        const elapsedStep = now - this._stepLastTime;
        if (elapsedStep >= 500) {
          this.simStepHz = (this._stepFrameCount * 1000) / elapsedStep;
          this._stepFrameCount = 0;
          this._stepLastTime = now;
        }
      } else {
        this.simStepHz = 0;
        this._stepFrameCount = 0;
        this._stepLastTime = performance.now();
      }

      const loopEnd = performance.now();
      const elapsed = (loopEnd - loopStart) / 1000;
      const target = this.timestep * this.decimation;
      const sleepTime = Math.max(0, target - elapsed);
      await new Promise((resolve) => setTimeout(resolve, sleepTime * 1000));
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.renderScale);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this._lastRenderTime = 0;
    this.render();
  }

  setRenderScale(scale) {
    const clamped = Math.max(0.5, Math.min(2.0, scale));
    this.renderScale = clamped;
    this.renderer.setPixelRatio(this.renderScale);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this._lastRenderTime = 0;
    this.render();
  }

  getSimStepHz() {
    return this.simStepHz;
  }

  readPolicyState() {
    const qpos = this.simulation.qpos;
    const qvel = this.simulation.qvel;
    const n = this.numActions;
    // joint_pos_rel / joint_vel_rel are read in Articulation order (obs convention);
    // last_action stays J23 (the runner tracks it). cmd comes from the UI state.
    const jointPosArt = new Float32Array(n);
    const jointVelArt = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      jointPosArt[i] = qpos[this.qpos_adr_art[i]];
      jointVelArt[i] = qvel[this.qvel_adr_art[i]];
    }
    return {
      jointPosArt,
      jointVelArt,
      rootQuat: new Float32Array([qpos[3], qpos[4], qpos[5], qpos[6]]),  // w,x,y,z
      rootAngVel: new Float32Array([qvel[3], qvel[4], qvel[5]]),         // base-frame gyro
      cmd: this.lacCmd,
    };
  }

  resetSimulation() {
    if (!this.simulation) {
      return;
    }
    this.params.paused = true;
    setLacInitialPose(this);          // back to the default standing pose
    this.actionTarget = null;
    if (this.policyRunner) {
      this.policyRunner.reset();         // clear obs history + last_action
    }
    this.params.paused = false;
  }

  render() {
    if (!this.model || !this.data || !this.simulation) {
      return;
    }
    const now = performance.now();
    if (now - this._lastRenderTime < 30) {
      return;
    }
    this._lastRenderTime = now;

    this.updateCameraFollow();
    this.controls.update();

    for (const [b, cached] of this.lastSimState.bodies) {
      if (this.bodies[b]) {
        this.bodies[b].position.copy(cached.position);
        this.bodies[b].quaternion.copy(cached.quaternion);
        this.bodies[b].updateWorldMatrix();
      }
    }

    for (const [l, cached] of this.lastSimState.lights) {
      if (this.lights[l]) {
        this.lights[l].position.copy(cached.position);
        this.lights[l].lookAt(cached.direction.clone().add(this.lights[l].position));
      }
    }

    if (this.mujocoRoot && this.mujocoRoot.cylinders) {
      const numWraps = this.lastSimState.tendons.numWraps.count;
      this.mujocoRoot.cylinders.count = numWraps;
      this.mujocoRoot.spheres.count = numWraps > 0 ? numWraps + 1 : 0;
      this.mujocoRoot.cylinders.instanceMatrix.needsUpdate = true;
      this.mujocoRoot.spheres.instanceMatrix.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
