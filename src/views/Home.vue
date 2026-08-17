<template>
  <div class="home">
    <!-- ======================= FULL-SCREEN HERO ======================= -->
    <!-- Background video carousel: videos in HERO_VIDEOS play one after another
         with a crossfade. Drop real-robot clips into viewer/public/media/hero/
         and list them below (root-absolute paths — relative paths break under
         the /demo/ directory URL). -->
    <section class="hero-full">
      <div class="hero-fallback"></div>
      <video
        ref="videoA" class="hero-video" :class="{ visible: frontLayer === 0 }"
        muted playsinline preload="auto"
        @ended="onEnded(0)" @error="onError(0)"
      ></video>
      <video
        ref="videoB" class="hero-video" :class="{ visible: frontLayer === 1 }"
        muted playsinline preload="auto"
        @ended="onEnded(1)" @error="onError(1)"
      ></video>
      <div class="hero-shade"></div>

      <!-- top-right nav -->
      <nav class="hero-nav">
        <v-btn class="nav-pill" rounded="xl" variant="flat" disabled>
          <v-icon start size="22">mdi-file-document-outline</v-icon> arXiv
        </v-btn>
        <v-btn
          class="nav-pill" rounded="xl" variant="flat"
          href="https://github.com/lac-humanoid/lac-code" target="_blank"
        >
          <v-icon start size="22">mdi-github</v-icon> Code
        </v-btn>
        <!-- Full page load (not SPA nav): Demo.vue has no sim teardown, a fresh
             document per entry avoids leaking wasm/render-loop instances. -->
        <v-btn class="nav-pill" rounded="xl" variant="flat" href="demo">
          <v-icon start size="22">mdi-gamepad-variant-outline</v-icon> Live Demo
        </v-btn>
      </nav>

      <!-- centered title block -->
      <div class="hero-center">
        <h1 class="hero-name">LAC</h1>
        <p class="hero-sub">
          Linear and Angular Compliance for<br class="sub-break">
          Humanoid Whole-body Control
        </p>
        <p class="hero-authors">
          Yang Liu, Zhongkai Gu, Wei Zhu, Mitsuhiro Hayashibe
        </p>
        <p class="hero-affil">Tohoku University</p>
      </div>

      <a class="hero-scroll" href="#abstract" aria-label="Scroll down">
        <v-icon size="36">mdi-chevron-down</v-icon>
      </a>
    </section>

    <!-- ======================= ABSTRACT ======================= -->
    <section id="abstract">
      <v-container style="max-width: 75%">
        <h2 class="section-title abstract-title">Abstract</h2>
        <p class="body-text abstract-text">
          Real-world humanoid tasks involve physical interaction with objects and
          people, yet learned controllers either reject external forces as
          disturbances or restrict compliance to the linear response of a few
          contact sites. We present LAC, a general whole-body controller that
          realizes commanded <u>L</u>inear and <u>A</u>ngular <u>C</u>ompliance
          for wrenches applied to the upper body. Sampled force and couple events
          are applied to contact frames extracted from human interaction data. At
          each loaded link, the external force and a virtual torque obtained from
          the passively yielding kinematic chain drive a virtual admittance under
          the commanded stiffness, synthesizing whole-body compliant responses
          into a large-scale augmented dataset. Teacher&ndash;student
          reinforcement learning then trains a single policy on the augmented
          data to realize the stiffness commands. Extensive simulation and
          experiments validate LAC in three aspects. Under wrenches applied from
          the hand to the torso, the robot responds with balanced whole-body
          compliant motion that existing controllers fail to produce. The
          realized compliance varies monotonically over the full range of both
          stiffness commands and is reproduced on the real robot. Under
          teleoperation with online stiffness adjustment, the robot gently
          interacts with people, transports soft objects, and completes
          force-demanding tasks such as opening a spring-loaded door.
        </p>
        <img
          class="abstract-figure"
          src="/media/framework2.png"
          alt="Compliant motion augmentation overview"
        >
      </v-container>
    </section>

    <!-- ============== COMPLIANT BEHAVIORS VIDEO GRID ============== -->
    <!-- Videos pending from user: entries with src rendered as <video>,
         entries without src rendered as placeholders. Files go to
         viewer/public/media/compliance/ (root-absolute paths). -->
    <section id="compliance" class="section-alt">
      <v-container style="max-width: 75%">
        <h2 class="section-title abstract-title">
          Whole-body compliant behaviors for wrenches applied to the upper body
        </h2>
        <v-row dense justify="center">
          <v-col v-for="(v, i) in complianceVideos" :key="i" cols="12" sm="4">
            <div class="video-card">
              <video
                v-if="v.src" v-lazy-video="v.src"
                autoplay muted loop playsinline
              ></video>
              <div v-else class="media-placeholder ratio-16-9">
                <span>{{ v.caption }} — video</span>
              </div>
              <div class="video-card-label">{{ v.caption }}</div>
            </div>
          </v-col>
        </v-row>
      </v-container>
    </section>

    <!-- ============ ANGULAR STIFFNESS PAIR COMPARISON ============ -->
    <!-- 4 groups of left/right comparisons; arrows cycle through groups.
         Left is always low / right always high angular stiffness.
         Files: viewer/public/media/angular/pairN_{low,high}.mp4 (groups 2-4 pending). -->
    <section id="angular">
      <v-container style="max-width: 75%">
        <h2 class="section-title abstract-title">
          Under the same linear stiffness, the angular stiffness command alone
          reshapes the response
        </h2>
        <div class="pair-row">
          <v-btn class="pair-arrow" icon variant="text" aria-label="Previous pair" @click="prevPair">
            <v-icon size="44">mdi-chevron-left</v-icon>
          </v-btn>
          <Transition :name="slideDir" mode="out-in">
          <v-row dense class="flex-grow-1" :key="pairIdx">
            <v-col cols="12" sm="6">
              <div class="video-card">
                <video
                  v-if="angularPairs[pairIdx].left" v-lazy-video="angularPairs[pairIdx].left"
                  ref="leftVid" autoplay muted playsinline @ended="onPairEnded"
                ></video>
                <div v-else class="media-placeholder ratio-16-9">
                  <span>Group {{ pairIdx + 1 }} — video</span>
                </div>
                <div class="video-card-label">Low angular stiffness</div>
              </div>
            </v-col>
            <v-col cols="12" sm="6">
              <div class="video-card">
                <video
                  v-if="angularPairs[pairIdx].right" v-lazy-video="angularPairs[pairIdx].right"
                  ref="rightVid" autoplay muted playsinline @ended="onPairEnded"
                ></video>
                <div v-else class="media-placeholder ratio-16-9">
                  <span>Group {{ pairIdx + 1 }} — video</span>
                </div>
                <div class="video-card-label">High angular stiffness</div>
              </div>
            </v-col>
          </v-row>
          </Transition>
          <v-btn class="pair-arrow" icon variant="text" aria-label="Next pair" @click="nextPair">
            <v-icon size="44">mdi-chevron-right</v-icon>
          </v-btn>
        </div>
        <div class="pair-dots">
          <button
            v-for="(g, i) in angularPairs" :key="i"
            class="pair-dot" :class="{ active: i === pairIdx }"
            :aria-label="`Group ${i + 1}`" @click="goPair(i)"
          ></button>
        </div>
      </v-container>
    </section>

    <!-- ============== BASELINES VS LAC COMPARISON ============== -->
    <section id="baselines" class="section-alt">
      <v-container style="max-width: 75%">
        <h2 class="section-title abstract-title">Baselines vs LAC Comparison</h2>
        <!-- 2x2 four-method video is 4:3 — keep its natural aspect, no crop -->
        <video
          class="baseline-video"
          v-lazy-video="'/media/baseline/lhforce_4methods.mp4'"
          autoplay muted loop playsinline
        ></video>
        <p class="figure-caption text-center">
          With the robot standing in place under each controller, we apply a force
          at the palm.
        </p>
      </v-container>
    </section>

    <!-- ========== LOCO-MANIPULATION UNDER VR TELEOPERATION ========== -->
    <!-- Videos pending from user; same card layout as the compliance grid. -->
    <section id="teleop">
      <v-container style="max-width: 75%">
        <h2 class="section-title abstract-title">
          Loco-manipulation tasks under VR teleoperation
        </h2>
        <v-row dense justify="center">
          <v-col v-for="(v, i) in teleopVideos" :key="i" cols="12" sm="4">
            <div class="video-card">
              <video
                v-if="v.src" v-lazy-video="v.src"
                autoplay muted loop playsinline
              ></video>
              <div v-else class="media-placeholder ratio-16-9">
                <span>{{ v.caption }} — video</span>
              </div>
              <div class="video-card-label">{{ v.caption }}</div>
            </div>
          </v-col>
        </v-row>
      </v-container>
    </section>

    <!-- ======================= FOOTER ======================= -->
    <footer class="page-footer">
      <v-container class="text-center" style="max-width: 800px">
        <p class="footer-text">
          Website viewer built on
          <a href="https://github.com/Axellwppr/humanoid-policy-viewer" target="_blank">humanoid-policy-viewer</a>.
        </p>
      </v-container>
    </footer>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

// v-lazy-video: defer setting <video src> until the element nears the
// viewport (300px margin), so ~90MB of below-the-fold clips don't all
// download on page open. Hero videos stay eager (above the fold).
const vLazyVideo = {
  mounted (el, binding) {
    const src = binding.value
    if (!src) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        el.src = src
        el.play?.().catch(() => {})
        io.disconnect()
      }
    }, { rootMargin: '300px' })
    io.observe(el)
    el._lazyIO = io
  },
  unmounted (el) { el._lazyIO?.disconnect() },
}

// files live in viewer/public/media/compliance/
const complianceVideos = [
  { src: '/media/compliance/g1_4.mp4', caption: 'Hand' },
  { src: '/media/compliance/g1_6.mp4', caption: 'Hand' },
  { src: '/media/compliance/g1_8.mp4', caption: 'Hand' },
  { src: '/media/compliance/g1_1.mp4', caption: 'Elbow' },
  { src: '/media/compliance/g1_2.mp4', caption: 'Shoulder' },
  { src: '/media/compliance/g1_5.mp4', caption: 'Both arms' },
  { src: '/media/compliance/g1_3.mp4', caption: 'Torso' },
  { src: '/media/compliance/g1_7.mp4', caption: 'Torso' },
]

// ---- hero video carousel -------------------------------------------------
// Root-absolute paths only. Swap in real-robot clips by replacing the files
// (or editing this list); H.264 + yuv420p + faststart, muted (autoplay policy).
const HERO_VIDEOS = [
  '/media/hero/mainpage1.mp4',
  '/media/hero/mainpage2.mp4',
  '/media/hero/mainpage3.mp4',
]

const videoA = ref(null)
const videoB = ref(null)
const frontLayer = ref(0)

let playlist = [...HERO_VIDEOS]
let playIdx = 0            // index (into playlist) of the clip on the front layer
let switching = false
let fadeTimer = null

function layerEl (i) { return i === 0 ? videoA.value : videoB.value }

async function startFirst () {
  if (!playlist.length) return
  const el = layerEl(frontLayer.value)
  el.src = playlist[playIdx]
  if (playlist.length === 1) el.loop = true
  try { await el.play() } catch { /* autoplay blocked: fallback bg remains */ }
}

async function advance () {
  if (switching || playlist.length < 2) return
  switching = true
  const back = 1 - frontLayer.value
  const nextIdx = (playIdx + 1) % playlist.length
  const el = layerEl(back)
  el.src = playlist[nextIdx]
  try {
    await el.play()
    const old = layerEl(frontLayer.value)
    frontLayer.value = back
    playIdx = nextIdx
    // pause the hidden layer once the 0.8 s crossfade is over
    fadeTimer = setTimeout(() => { old.pause() }, 900)
  } catch {
    // next clip failed to start: keep showing the frozen last frame, drop it
    playlist.splice(nextIdx, 1)
    if (nextIdx < playIdx) playIdx -= 1
  }
  switching = false
}

function onEnded (layer) {
  if (layer !== frontLayer.value) return
  if (playlist.length === 1) return // looped natively
  advance()
}

function onError (layer) {
  const el = layerEl(layer)
  const bad = el?.currentSrc || el?.src
  if (!bad) return
  const i = playlist.findIndex(p => bad.endsWith(p))
  if (i >= 0) {
    playlist.splice(i, 1)
    if (i === playIdx && playlist.length) {
      playIdx = i % playlist.length
      if (layer === frontLayer.value) startFirst()
    } else if (i < playIdx) {
      playIdx -= 1
    }
  }
}

onMounted(startFirst)
onBeforeUnmount(() => { if (fadeTimer) clearTimeout(fadeTimer) })

// ---- angular-stiffness pair comparison ----------------------------------
// left = low / right = high angular stiffness; '' = placeholder until the
// user's clips arrive (groups 2-4)
const angularPairs = [
  { left: '/media/angular/pair1_low.mp4', right: '/media/angular/pair1_high.mp4' },
  { left: '/media/angular/pair2_low.mp4', right: '/media/angular/pair2_high.mp4' },
  { left: '/media/angular/pair3_low.mp4', right: '/media/angular/pair3_high.mp4' },
  { left: '/media/angular/pair4_low.mp4', right: '/media/angular/pair4_high.mp4' },
]
// ---- loco-manipulation under VR teleoperation ---------------------------
// clips pending from user; files will go to viewer/public/media/teleop/
const teleopVideos = [
  { src: '/media/teleop/g3_1.mp4', caption: 'Low stiffness' },
  { src: '/media/teleop/g3_2.mp4', caption: 'High stiffness' },
  { src: '/media/teleop/g3_3.mp4', caption: 'High stiffness' },
]

const pairIdx = ref(0)
const slideDir = ref('slide-left')
const prevPair = () => {
  slideDir.value = 'slide-right'
  pairIdx.value = (pairIdx.value + angularPairs.length - 1) % angularPairs.length
}
const nextPair = () => {
  slideDir.value = 'slide-left'
  pairIdx.value = (pairIdx.value + 1) % angularPairs.length
}
const goPair = (i) => {
  if (i === pairIdx.value) return
  slideDir.value = i > pairIdx.value ? 'slide-left' : 'slide-right'
  pairIdx.value = i
}

// The two clips of a pair usually differ in length: no `loop` — the shorter
// one freezes on its last frame, and once BOTH have ended they restart together.
const leftVid = ref(null)
const rightVid = ref(null)
function onPairEnded () {
  const l = leftVid.value
  const r = rightVid.value
  const lDone = !l || l.ended
  const rDone = !r || r.ended
  if (lDone && rDone) {
    for (const v of [l, r]) {
      if (v) { v.currentTime = 0; v.play().catch(() => {}) }
    }
  }
}
</script>

<style scoped>
.home {
  background: #ffffff;
  color: #1a1a1a;
  min-height: 100vh;
}

section { padding: 28px 0; }

/* alternate section background: light gray band framed by divider lines */
.section-alt {
  background: #f6f7f9;
  border-top: 1px solid #e3e6ea;
  border-bottom: 1px solid #e3e6ea;
  padding: 44px 0 52px;
  margin: 20px 0;
}

/* ---------------- full-screen hero ---------------- */
.hero-full {
  position: relative;
  height: 100vh;
  height: 100svh;
  min-height: 560px;
  padding: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0d1117;
}

.hero-fallback {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 35%, #24303f 0%, #0d1117 75%);
}

.hero-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.8s ease;
}
.hero-video.visible { opacity: 1; }

.hero-shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.18) 30%,
                    rgba(0,0,0,0.18) 70%, rgba(0,0,0,0.5) 100%);
}

.hero-nav {
  position: absolute;
  top: 20px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
  z-index: 3;
}

.nav-pill {
  background: rgba(0, 0, 0, 0.28) !important;
  color: #fff !important;
  border: 1.5px solid rgba(255, 255, 255, 0.9);
  text-transform: none;
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0;
  height: 44px !important;
}
.nav-pill.v-btn--disabled { opacity: 0.55; }

.hero-center {
  position: relative;
  z-index: 2;
  text-align: center;
  color: #fff;
  padding: 0 16px;
  text-shadow: 0 2px 12px rgba(0,0,0,0.55);
}

.hero-name {
  font-size: clamp(4rem, 13vw, 9rem);
  font-weight: 700;
  line-height: 1.0;
  margin-bottom: 8px;
}

.hero-sub {
  font-size: clamp(1.8rem, 5vw, 3.9rem);
  font-weight: 400;
  line-height: 1.3;
  margin-bottom: 30px;
}

.hero-authors {
  font-size: clamp(1.2rem, 2.6vw, 1.8rem);
  margin-bottom: 6px;
}

.hero-affil {
  font-size: clamp(1.2rem, 2.6vw, 1.8rem);
  opacity: 0.85;
}

.hero-scroll {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  color: #fff;
  opacity: 0.85;
  z-index: 2;
  animation: bounce 2.2s infinite;
}
@keyframes bounce {
  0%, 100% { transform: translate(-50%, 0); }
  50% { transform: translate(-50%, 8px); }
}

@media (max-width: 600px) {
  .hero-nav { top: 12px; right: 12px; left: 12px; }
  .sub-break { display: none; }
}

/* ---------------- content sections ---------------- */
.section-title {
  font-size: 1.6rem;
  font-weight: 700;
  margin-bottom: 16px;
}

.body-text { font-size: 1.05rem; line-height: 1.7; color: #333; }

.abstract-title {
  text-align: center;
  font-size: 2.2rem;
  margin-bottom: 22px;
}
.abstract-text {
  font-size: 1.05rem;
  text-align: justify;
}

.abstract-figure {
  display: block;
  /* container is 75% of the page; 86.7% of it = 0.65 page width */
  width: 86.7%;
  margin: 34px auto 0;
}

.media-placeholder {
  background: #f0f2f5;
  border: 2px dashed #c3c9d1;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8a919b;
  font-size: 0.95rem;
  width: 100%;
}
.ratio-16-9 { aspect-ratio: 16 / 9; }

.video-card {
  border: 1px solid #e3e6ea;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.video-card video {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  background: #000;
}
.video-card .media-placeholder {
  border: none;
  border-radius: 0;
}
.video-card-label {
  text-align: center;
  font-size: 0.95rem;
  font-weight: 600;
  padding: 10px 8px;
  border-top: 1px solid #eef0f3;
}

.baseline-video {
  display: block;
  width: 74%;
  margin: 0 auto;
  border-radius: 10px;
  border: 1px solid #e3e6ea;
  background: #000;
}
.figure-caption {
  color: #555;
  font-size: 1rem;
  line-height: 1.55;
  margin-top: 14px;
}

.pair-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pair-arrow { color: #444; }
.pair-dots {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 18px;
}
.pair-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: none;
  background: #c9ced5;
  cursor: pointer;
  padding: 0;
}
.pair-dot.active { background: #1867c0; }

/* direction-aware slide between comparison groups */
.slide-left-enter-active, .slide-left-leave-active,
.slide-right-enter-active, .slide-right-leave-active {
  transition: transform 0.28s ease, opacity 0.28s ease;
}
.slide-left-enter-from { transform: translateX(70px); opacity: 0; }
.slide-left-leave-to { transform: translateX(-70px); opacity: 0; }
.slide-right-enter-from { transform: translateX(-70px); opacity: 0; }
.slide-right-leave-to { transform: translateX(70px); opacity: 0; }

.page-footer { padding: 32px 0 40px; border-top: 1px solid #eee; margin-top: 24px; }
.footer-text { color: #888; font-size: 0.9rem; }
.footer-text a { color: #666; }
</style>
