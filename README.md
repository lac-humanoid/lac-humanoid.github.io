# LAC — Interactive Web Demo

**Live demo: [lac-humanoid.github.io](https://lac-humanoid.github.io/)**

In-browser interactive demo for **LAC: Linear and Angular Compliance for Humanoid
Whole-body Control** (Unitree G1, 23 DOF). The compliant whole-body policy runs
entirely in your browser — MuJoCo (WebAssembly) simulates the robot at full rate
while the policy runs via ONNX Runtime Web. Drag the robot with MuJoCo's native
perturbation controls (double-click a body, then Ctrl+drag) and watch it comply.

- Paper: coming soon (arXiv)
- Code (model checkpoint + MuJoCo evaluation): [lac-humanoid/lac-code](https://github.com/lac-humanoid/lac-code)

## Run locally

```bash
npm install
npm run dev    # http://localhost:3000
```

`npm run build` produces the static site in `dist/`; `scripts/publish_pages.sh`
builds and publishes it to the `gh-pages` branch.

## Project structure

- `src/views/Demo.vue` — UI controls for the live demo
- `src/simulation/main.js` — bootstraps MuJoCo, Three.js renderer, and policy loop
- `src/simulation/mujocoUtils.js` — scene/policy loading and filesystem preloading
- `src/simulation/lac/policyRunner.js` — ONNX inference wrapper and observation pipeline
- `src/simulation/utils/DragStateManager.js` — MuJoCo-native perturbation (mjv_* via wasm)
- `public/examples/scenes/` — MJCF + meshes staged into MuJoCo's MEMFS
- `public/examples/checkpoints/` — policy ONNX, config, and pose presets

## Acknowledgments

The viewer is built on [humanoid-policy-viewer](https://github.com/Axellwppr/humanoid-policy-viewer)
by Qingzhou Lu ([@Axellwppr](https://github.com/Axellwppr)) — the same
Vue + MuJoCo-WASM + ONNX-Runtime-Web engine behind the GentleHumanoid web demo.
We thank the author for making it available.
