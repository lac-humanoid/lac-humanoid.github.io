// LAC deploy constants.
// All length-23 arrays are in JOINT_NAMES_23DOF order (the policy action order) unless the
// name says _ART (Articulation order, used only for joint_pos_rel / joint_vel_rel obs terms).

export const NUM_JOINTS = 23;

// Policy action order (= MuJoCo tree order for the first 23 joints; = policy_joint_names).
export const JOINT_NAMES_23DOF = [
  'left_hip_pitch_joint', 'left_hip_roll_joint', 'left_hip_yaw_joint', 'left_knee_joint',
  'left_ankle_pitch_joint', 'left_ankle_roll_joint', 'right_hip_pitch_joint', 'right_hip_roll_joint',
  'right_hip_yaw_joint', 'right_knee_joint', 'right_ankle_pitch_joint', 'right_ankle_roll_joint',
  'waist_yaw_joint', 'left_shoulder_pitch_joint', 'left_shoulder_roll_joint', 'left_shoulder_yaw_joint',
  'left_elbow_joint', 'left_wrist_roll_joint', 'right_shoulder_pitch_joint', 'right_shoulder_roll_joint',
  'right_shoulder_yaw_joint', 'right_elbow_joint', 'right_wrist_roll_joint',
];

// Articulation order — joint_pos_rel / joint_vel_rel obs terms are built in THIS order
// (IsaacLab mdp.joint_pos_rel returns Articulation order).
export const JOINT_NAMES_ART = [
  'left_hip_pitch_joint', 'right_hip_pitch_joint', 'waist_yaw_joint', 'left_hip_roll_joint',
  'right_hip_roll_joint', 'left_shoulder_pitch_joint', 'right_shoulder_pitch_joint', 'left_hip_yaw_joint',
  'right_hip_yaw_joint', 'left_shoulder_roll_joint', 'right_shoulder_roll_joint', 'left_knee_joint',
  'right_knee_joint', 'left_shoulder_yaw_joint', 'right_shoulder_yaw_joint', 'left_ankle_pitch_joint',
  'right_ankle_pitch_joint', 'left_elbow_joint', 'right_elbow_joint', 'left_ankle_roll_joint',
  'right_ankle_roll_joint', 'left_wrist_roll_joint', 'right_wrist_roll_joint',
];

// default joint pos in Articulation order (offset subtracted in joint_pos_rel)
export const DEFAULT_JOINT_POS_ART = [
  -0.312, -0.312, 0.0, 0.0, 0.0, 0.2, 0.2, 0.0, 0.0, 0.2, -0.2, 0.669,
  0.669, 0.0, 0.0, -0.363, -0.363, 0.6, 0.6, 0.0, 0.0, 0.0, 0.0,
];

// q_target_i = DEFAULT_JOINT_POS_23[i] + ACTION_SCALE_23[i] * action_i  (JOINT_NAMES_23DOF order)
export const DEFAULT_JOINT_POS_23 = [
  -0.312, 0.0, 0.0, 0.669, -0.363, 0.0, -0.312, 0.0, 0.0, 0.669, -0.363, 0.0,
  0.0, 0.2, 0.2, 0.0, 0.6, 0.0, 0.2, -0.2, 0.0, 0.6, 0.0,
];
export const ACTION_SCALE_23 = [
  0.5475464652142303, 0.3506614663788243, 0.5475464652142303, 0.3506614663788243,
  0.4385773139233672, 0.4385773139233672, 0.5475464652142303, 0.3506614663788243,
  0.5475464652142303, 0.3506614663788243, 0.4385773139233672, 0.4385773139233672,
  0.5475464652142303, 0.4385773139233672, 0.4385773139233672, 0.4385773139233672,
  0.4385773139233672, 0.4385773139233672, 0.4385773139233672, 0.4385773139233672,
  0.4385773139233672, 0.4385773139233672, 0.4385773139233672,
];
// PD gains for the viewer's external-PD control loop (JOINT_NAMES_23DOF order).
export const STIFFNESS_23 = [
  40.18, 99.10, 40.18, 99.10, 28.50, 28.50, 40.18, 99.10, 40.18, 99.10, 28.50, 28.50,
  40.18, 14.30, 14.30, 14.30, 14.30, 14.30, 14.30, 14.30, 14.30, 14.30, 14.30,
];
export const DAMPING_23 = [
  2.56, 6.31, 2.56, 6.31, 1.81, 1.81, 2.56, 6.31, 2.56, 6.31, 1.81, 1.81,
  2.56, 0.907, 0.907, 0.907, 0.907, 0.907, 0.907, 0.907, 0.907, 0.907, 0.907,
];

// ---- command defaults (the DEMO-mode stance) ----
export const DEFAULT_BASE_HEIGHT = 0.78;     // DEMO stance height (teleop node used 0.74); clamp [0.56, 0.78]
export const HEIGHT_MIN = 0.56;
export const HEIGHT_MAX = 0.78;
export const VEL_MAX = 0.5;                   // training range [-0.5, 0.5] for vx/vy/yaw
// stiffness command = [K_lin_la, K_lin_ra, K_lin_to, K_ang_la, K_ang_ra] (RAW, 5-D:
// torso-angular is unused — dead constant).
// Web boot values sit near the LOG midpoint of each range so the sliders start centered,
// rounded to whole numbers (the real-robot deploy node boots
// [250,250,250,55,55] instead): linear ~sqrt(10*500)≈70.7 → 70, angular ~31.6 → 30.
export const DEFAULT_STIFFNESS_5 = [70.0, 70.0, 70.0, 30.0, 30.0];
export const STIFFNESS_LIN_RANGE = [10.0, 500.0];
export const STIFFNESS_ANG_RANGE = [10.0, 100.0];

// upper-body preset arm joints (ref_upper_dof_pos) order = JOINT_NAMES_23DOF[13:23]
export const ARM_JOINT_ORDER = JOINT_NAMES_23DOF.slice(13, 23);
