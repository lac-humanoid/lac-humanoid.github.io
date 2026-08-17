// Deploy-side obs history for the LAC policy.
//
// Maintains ONE 64-deep ring buffer of RAW 95-dim per-frame term vectors (oldest-first,
// newest at the back), reproducing IsaacLab's CircularBuffer semantics (first push fills
// all 64 slots; subsequent pushes drop the oldest and append at the back). The deploy
// builder's stride=1 / command_prefill=False defaults make it a plain ring.
//
// The exported ONNX takes this raw (1,64,95) buffer and does
// log-stiffness + term-major flatten (-> policy 950 + policy_hist 6080) + both normalizers +
// adapt + student_actor INSIDE the graph. So this assembler only has to lay out the raw frame
// in TERM_ORDER and roll the buffer — no log / flatten / normalization here.

export const TERM_ORDER = [
  'base_ang_vel', 'projected_gravity', 'command_lin_vel', 'command_ang_vel',
  'command_waist_yaw', 'command_base_height', 'ref_upper_dof_pos', 'joint_pos_rel',
  'joint_vel_rel', 'last_action', 'stiffness',
];
export const TERM_DIM = {
  base_ang_vel: 3, projected_gravity: 3, command_lin_vel: 2, command_ang_vel: 1,
  command_waist_yaw: 1, command_base_height: 1, ref_upper_dof_pos: 10, joint_pos_rel: 23,
  joint_vel_rel: 23, last_action: 23, stiffness: 5,
};
export const FRAME_DIM = 95;   // sum of TERM_DIM
export const HIST_LEN = 64;    // policy_hist depth (= adapt_seq_len)

// column offset of each term inside a 95-dim frame
const COL = {};
{
  let off = 0;
  for (const n of TERM_ORDER) { COL[n] = off; off += TERM_DIM[n]; }
  if (off !== FRAME_DIM) throw new Error(`frame dim ${off} != ${FRAME_DIM}`);
}

export class LacObsAssembler {
  constructor() {
    this.buf = null;            // Float32Array(HIST_LEN*FRAME_DIM) or null until first push
  }

  reset() { this.buf = null; }

  // terms: object with one entry per TERM_ORDER name, each an array/Float32Array of TERM_DIM[name].
  //   joint_pos_rel : 23, Articulation order, ALREADY minus DEFAULT_JOINT_POS_ART
  //   joint_vel_rel : 23, Articulation order
  //   last_action   : 23, JOINT_NAMES_23DOF order (raw previous policy output)
  //   stiffness     : 5, RAW (graph applies log)
  // Returns the (1,64,95) buffer as a flat Float32Array(64*95), oldest-first (frame[-1]=newest).
  pushAndBuild(terms) {
    const frame = new Float32Array(FRAME_DIM);
    for (const n of TERM_ORDER) {
      const v = terms[n];
      if (v == null || v.length !== TERM_DIM[n]) {
        throw new Error(`obs term ${n}: expected length ${TERM_DIM[n]}, got ${v == null ? 'null' : v.length}`);
      }
      frame.set(v, COL[n]);
    }

    if (this.buf === null) {
      // first push: replicate current frame across all HIST_LEN slots
      this.buf = new Float32Array(HIST_LEN * FRAME_DIM);
      for (let t = 0; t < HIST_LEN; t++) this.buf.set(frame, t * FRAME_DIM);
    } else {
      // roll: drop oldest (slot 0), shift left one frame, write newest into the last slot
      this.buf.copyWithin(0, FRAME_DIM);
      this.buf.set(frame, (HIST_LEN - 1) * FRAME_DIM);
    }
    return this.buf;
  }
}
