<template>
  <div id="mujoco-container"></div>

  <div class="global-alerts">
    <v-alert v-if="isSmallScreen" v-model="showSmallScreenAlert" type="warning" variant="flat"
      density="compact" closable class="small-screen-alert">
      Screen too small. The control panel is unavailable on small screens. Please use a desktop device.
    </v-alert>
    <v-alert v-if="isSafari" v-model="showSafariAlert" type="warning" variant="flat"
      density="compact" closable class="safari-alert">
      Safari has lower memory limits, which can cause WASM to crash. Chrome/Edge/Firefox recommended.
    </v-alert>
  </div>

  <div v-if="!isSmallScreen" class="controls">
    <v-card class="controls-card">
      <v-card-title class="text-subtitle-1">LAC G1 · Live Demo</v-card-title>
      <v-card-text class="py-0 controls-body">
        <div class="text-caption mb-1">
          MuJoCo-style interaction: <b>double-click</b> a link to select it, then
          <b>Ctrl + left-drag</b> applies a torque, <b>Ctrl + right-drag</b> applies a force at
          the selected point. Plain drag orbits the camera, right-drag pans, scroll zooms.
        </div>
        <div class="status-legend">
          <span class="status-name">Sim Freq</span><span class="text-caption">{{ simStepLabel }}</span>
          <span class="status-name">Perturb</span><span class="text-caption">{{ perturbLabel }}</span>
        </div>
        <v-progress-linear v-if="state === 0" indeterminate height="3" color="primary" class="mt-1" />

        <v-divider class="my-2" />
        <span class="status-name">Pose presets</span>
        <div class="presets mt-1">
          <v-chip v-for="(p, i) in presets" :key="p.name" size="x-small" class="preset-chip"
            :color="currentPreset === i ? 'primary' : undefined"
            :variant="currentPreset === i ? 'flat' : 'tonal'"
            :disabled="state !== 1" @click="applyPreset(i)">
            {{ i }}
          </v-chip>
        </div>

        <v-divider class="my-2" />
        <span class="status-name">Base height &nbsp;<span class="text-caption">{{ baseHeight.toFixed(2) }} m</span></span>
        <v-slider v-model="baseHeight" :min="0.56" :max="0.78" :step="0.01" density="compact"
          hide-details :disabled="state !== 1" @update:modelValue="onCmd" />

        <span class="status-name">Velocity command &nbsp;<span class="text-caption">vx {{ vx.toFixed(2) }} · vy {{ vy.toFixed(2) }} · yaw {{ yaw.toFixed(2) }}</span></span>
        <v-slider v-model="vx" label="vx" :min="-0.5" :max="0.5" :step="0.05" density="compact" hide-details :disabled="state !== 1" @update:modelValue="onCmd" />
        <v-slider v-model="vy" label="vy" :min="-0.5" :max="0.5" :step="0.05" density="compact" hide-details :disabled="state !== 1" @update:modelValue="onCmd" />
        <v-slider v-model="yaw" label="yaw" :min="-0.5" :max="0.5" :step="0.05" density="compact" hide-details :disabled="state !== 1" @update:modelValue="onCmd" />
        <v-btn size="x-small" variant="tonal" class="mt-1" :disabled="state !== 1" @click="stopVel">Zero velocity</v-btn>

        <v-divider class="my-2" />
        <!-- sliders travel in LOG space (matches the policy's log-stiffness obs encoding);
             labels/thumbs show the raw N/m · Nm/rad value -->
        <span class="status-name">Stiffness — linear (N/m) &nbsp;<span class="text-caption">L {{ stiff[0].toFixed(0) }} · R {{ stiff[1].toFixed(0) }} · Torso {{ stiff[2].toFixed(0) }}</span></span>
        <v-slider v-for="(lbl, i) in ['L hand', 'R hand', 'Torso']" :key="'lin' + i" v-model="stiffLog[i]"
          :label="lbl" :min="logLin[0]" :max="logLin[1]" :step="0.01" thumb-label density="compact" hide-details
          :disabled="state !== 1" @update:modelValue="onCmd">
          <template #thumb-label>{{ stiff[i].toFixed(0) }}</template>
        </v-slider>
        <span class="status-name">Stiffness — angular (Nm/rad) &nbsp;<span class="text-caption">L {{ stiff[3].toFixed(0) }} · R {{ stiff[4].toFixed(0) }}</span></span>
        <v-slider v-for="(lbl, i) in ['L hand', 'R hand']" :key="'ang' + i" v-model="stiffLog[i + 3]"
          :label="lbl" :min="logAng[0]" :max="logAng[1]" :step="0.01" thumb-label density="compact" hide-details
          :disabled="state !== 1" @update:modelValue="onCmd">
          <template #thumb-label>{{ stiff[i + 3].toFixed(0) }}</template>
        </v-slider>
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" block :disabled="state !== 1" @click="reset">Reset</v-btn>
      </v-card-actions>
    </v-card>
  </div>

  <v-dialog :model-value="state === 0" persistent max-width="600px">
    <v-card title="Loading Simulation Environment">
      <v-card-text><v-progress-linear indeterminate color="primary" /> Loading MuJoCo and the ONNX policy…</v-card-text>
    </v-card>
  </v-dialog>
  <v-dialog :model-value="state < 0" persistent max-width="600px">
    <v-card title="Simulation Error">
      <v-card-text>
        <span v-if="state === -1">Runtime error, please refresh.<br />{{ extra_error_message }}</span>
        <span v-else-if="state === -2">Your browser does not support WebAssembly. Use a recent Chrome/Edge/Firefox.</span>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script>
import { MuJoCoDemo } from '@/simulation/main.js';
import loadMujoco from 'mujoco-js';
import { DEFAULT_BASE_HEIGHT, DEFAULT_STIFFNESS_5, STIFFNESS_LIN_RANGE, STIFFNESS_ANG_RANGE } from '@/simulation/lac/constants.js';

export default {
  name: 'DemoPage',
  data: () => ({
    state: 0,
    extra_error_message: '',
    presets: [],
    currentPreset: -1,
    baseHeight: DEFAULT_BASE_HEIGHT,
    vx: 0, vy: 0, yaw: 0,
    stiffLog: DEFAULT_STIFFNESS_5.map(Math.log),   // slider space; raw K = exp()
    logLin: STIFFNESS_LIN_RANGE.map(Math.log),
    logAng: STIFFNESS_ANG_RANGE.map(Math.log),
    simStepHz: 0,
    dragForce: 0,
    dragTorque: 0,
    pollTimer: null,
    isSmallScreen: false,
    showSmallScreenAlert: true,
    isSafari: false,
    showSafariAlert: true,
    resize_listener: null,
    keydown_listener: null,
  }),
  computed: {
    stiff() { return this.stiffLog.map(Math.exp); },   // raw [Klin_la,Klin_ra,Klin_to,Kang_la,Kang_ra]
    simStepLabel() {
      return this.simStepHz && Number.isFinite(this.simStepHz) ? `${this.simStepHz.toFixed(1)} Hz` : '—';
    },
    perturbLabel() {
      if (this.dragForce > 0.5) return `${this.dragForce.toFixed(0)} N`;
      if (this.dragTorque > 0.05) return `${this.dragTorque.toFixed(1)} N·m`;
      return '—';
    },
  },
  methods: {
    detectSafari() {
      const ua = navigator.userAgent;
      return /Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua)
        && !/Edg\//.test(ua) && !/OPR\//.test(ua) && !/CriOS\//.test(ua) && !/FxiOS\//.test(ua);
    },
    updateScreenState() {
      const isSmall = window.innerWidth < 500 || window.innerHeight < 700;
      if (!isSmall && this.isSmallScreen) this.showSmallScreenAlert = true;
      this.isSmallScreen = isSmall;
    },
    async init() {
      if (typeof WebAssembly !== 'object') { this.state = -2; return; }
      try {
        const mujoco = await loadMujoco();
        this.demo = new MuJoCoDemo(mujoco);
        if (typeof window !== 'undefined') window.__demo = this.demo;  // debug hook (headless probing)
        await this.demo.init();
        this.demo.main_loop();
        this.demo.params.paused = false;
        this.presets = this.demo.lacPresets?.presets ?? [];
        // boot state == preset 0 (the demo-mode default stance)
        if (this.presets.length && this.presets[0].name === 'default') this.currentPreset = 0;
        // sync UI from the demo's command defaults
        this.baseHeight = this.demo.lacCmd.baseHeight[0];
        this.stiffLog = Array.from(this.demo.lacCmd.stiffness5).map(Math.log);
        this.pollTimer = setInterval(() => {
          this.simStepHz = this.demo.getSimStepHz?.() ?? 0;
          const dsm = this.demo.dragStateManager;
          this.dragForce = dsm?.active ? (dsm.lastForce ?? 0) : 0;
          this.dragTorque = dsm?.active ? (dsm.lastTorque ?? 0) : 0;
        }, 200);
        this.state = 1;
      } catch (e) {
        this.state = -1;
        this.extra_error_message = e.toString();
        console.error(e);
      }
    },
    onCmd() {
      if (!this.demo) return;
      const c = this.demo.lacCmd;
      c.baseHeight[0] = this.baseHeight;
      c.linVel[0] = this.vx; c.linVel[1] = this.vy; c.angVel[0] = this.yaw;
      for (let i = 0; i < 5; i++) c.stiffness5[i] = this.stiff[i];
    },
    stopVel() { this.vx = 0; this.vy = 0; this.yaw = 0; this.onCmd(); },
    applyPreset(i) {
      const p = this.presets[i];
      if (!p || !this.demo) return;
      this.demo.lacCmd.waistYaw[0] = p.waist_yaw;
      this.demo.lacCmd.refArm10.set(p.arm10);
      // each real-robot demo was designed at a specific stance height — apply it too
      if (typeof p.base_height === 'number') {
        this.baseHeight = p.base_height;
        this.demo.lacCmd.baseHeight[0] = p.base_height;
      }
      this.currentPreset = i;
    },
    reset() {
      if (!this.demo) return;
      this.demo.resetSimulation();
    },
  },
  mounted() {
    this.isSafari = this.detectSafari();
    this.updateScreenState();
    this.resize_listener = () => this.updateScreenState();
    window.addEventListener('resize', this.resize_listener);
    this.keydown_listener = (e) => { if (e.code === 'Backspace') this.reset(); };
    document.addEventListener('keydown', this.keydown_listener);
    this.init();
  },
  beforeUnmount() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.resize_listener) window.removeEventListener('resize', this.resize_listener);
    if (this.keydown_listener) document.removeEventListener('keydown', this.keydown_listener);
  },
};
</script>

<style scoped>
.controls { position: fixed; top: 20px; right: 20px; width: 400px; z-index: 1000; }
.global-alerts { position: fixed; top: 20px; left: 16px; right: 16px; max-width: 520px; margin: 0 auto;
  display: flex; flex-direction: column; gap: 8px; z-index: 1200; }
.controls-card { max-height: calc(100vh - 40px); }
.controls-body { max-height: calc(100vh - 150px); overflow-y: auto; overscroll-behavior: contain; }
.status-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.status-name { font-weight: 600; font-size: 0.8rem; }
.presets { display: flex; flex-wrap: wrap; gap: 4px; }
.preset-chip { min-width: 26px; justify-content: center; }
</style>
