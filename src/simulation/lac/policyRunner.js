import * as ort from 'onnxruntime-web';
import { LacObsAssembler, HIST_LEN, FRAME_DIM } from './obsAssembler.js';
import { DEFAULT_JOINT_POS_ART, ACTION_SCALE_23, DEFAULT_JOINT_POS_23, NUM_JOINTS } from './constants.js';

// R^T v with q=(w,x,y,z). Matches torch_utils.quat_rotate_inverse exactly.
export function quatRotateInverse(qw, qx, qy, qz, vx, vy, vz) {
  const f = 2.0 * qw * qw - 1.0;
  const ax = vx * f, ay = vy * f, az = vz * f;
  const cx = qy * vz - qz * vy;          // cross(q_vec, v)
  const cy = qz * vx - qx * vz;
  const cz = qx * vy - qy * vx;
  const w2 = qw * 2.0;
  const bx = cx * w2, by = cy * w2, bz = cz * w2;
  const d = (qx * vx + qy * vy + qz * vz) * 2.0;   // dot(q_vec, v) * 2
  return [ax - bx + qx * d, ay - by + qy * d, az - bz + qz * d];
}

// Runs the LAC student policy in the browser.
//   state.jointPosArt / jointVelArt : (23,) Articulation order
//   state.rootQuat                  : (4,) w,x,y,z
//   state.rootAngVel                : (3,) base-frame angular velocity (IMU gyro analog)
//   state.cmd = { linVel(2), angVel(1), waistYaw(1), baseHeight(1), refArm10(10), stiffness5(5) }
// step() returns q_target (23,) in JOINT_NAMES_23DOF order (= viewer policy_joint_names).
export class LacPolicyRunner {
  constructor(config) {
    this.onnxPath = config.onnx.path;
    this.numActions = NUM_JOINTS;
    this.assembler = new LacObsAssembler();
    this.lastAction = new Float32Array(NUM_JOINTS);   // raw previous action (no clip, matches deploy)
    this.session = null;
    this.isInferencing = false;
  }

  async init() {
    const buf = await (await fetch(this.onnxPath)).arrayBuffer();
    this.session = await ort.InferenceSession.create(buf, {
      executionProviders: ['wasm'], graphOptimizationLevel: 'all',
    });
    this.reset();
  }

  reset() {
    this.assembler.reset();
    this.lastAction.fill(0.0);
  }

  async step(state) {
    if (this.isInferencing || !this.session) return null;
    this.isInferencing = true;
    try {
      const q = state.rootQuat;
      const projGrav = quatRotateInverse(q[0], q[1], q[2], q[3], 0.0, 0.0, -1.0);
      const jointPosRel = new Float32Array(NUM_JOINTS);
      for (let i = 0; i < NUM_JOINTS; i++) jointPosRel[i] = state.jointPosArt[i] - DEFAULT_JOINT_POS_ART[i];

      const c = state.cmd;
      const frames = this.assembler.pushAndBuild({
        base_ang_vel: state.rootAngVel,
        projected_gravity: projGrav,
        command_lin_vel: c.linVel,
        command_ang_vel: c.angVel,
        command_waist_yaw: c.waistYaw,
        command_base_height: c.baseHeight,
        ref_upper_dof_pos: c.refArm10,
        joint_pos_rel: jointPosRel,
        joint_vel_rel: state.jointVelArt,
        last_action: this.lastAction,
        stiffness: c.stiffness5,
      });

      const tensor = new ort.Tensor('float32', frames, [1, HIST_LEN, FRAME_DIM]);
      const out = await this.session.run({ frames: tensor });
      const action = out['action'].data;   // Float32Array(23), raw (graph outputs the actor mean)
      if (!action || action.length !== NUM_JOINTS) throw new Error('bad ONNX action output');

      const qTarget = new Float32Array(NUM_JOINTS);
      for (let i = 0; i < NUM_JOINTS; i++) {
        this.lastAction[i] = action[i];                                  // deploy: no clip
        qTarget[i] = DEFAULT_JOINT_POS_23[i] + ACTION_SCALE_23[i] * action[i];
      }
      return qTarget;
    } finally {
      this.isInferencing = false;
    }
  }
}
