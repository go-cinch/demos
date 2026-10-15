<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from 'vue';

import { usePreferredReducedMotion } from '@vueuse/core';

import { registerLoginTransition } from '../store/login-transition';

const props = defineProps<{ dark: boolean; formOnLeft?: boolean }>();
const darkScene = ref(props.dark);
const lighting = computed(() => (darkScene.value ? 'night' : 'day'));
const shipName = computed(() => `catamaran-${lighting.value}`);
const harborName = computed(() =>
  darkScene.value ? 'yacht-club' : 'yacht-club-day',
);
const oceanName = computed(() => `water-${lighting.value}`);
const root = ref<HTMLElement>();
const phase = ref<'arrived' | 'arriving' | 'cruising'>('cruising');
const reducedMotion = usePreferredReducedMotion();
const id = useId().replaceAll(':', '');
const paint = (name: string) => `url(#${id}-${name})`;
const asset = (name: string) =>
  `${import.meta.env.BASE_URL}images/auth-journey/${name}.webp`;
const ready = new Set<string>();
let parts = new Map<string, Element>();
let frame = 0;
let inView = true;
let observer: IntersectionObserver | undefined;
let lastTime = 0;
let elapsed = 0;
let travel = 0;
let arrivalStart: number | undefined;
let origin = { x: 0, y: 0, angle: 0 };
let pose = { x: 0, y: 0, angle: 0 };
let unregister: (() => void) | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let hold: ReturnType<typeof setTimeout> | undefined;
let finish: (() => void) | undefined;
let pending: Promise<void> | undefined;

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function attr(name: string, key: string, value: number | string) {
  parts.get(name)?.setAttribute(key, String(value));
}
function move(name: string, x: number, y = 0) {
  attr(name, 'transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
}
function settle() {
  clearTimeout(timer);
  clearTimeout(hold);
  finish?.();
  finish = undefined;
  pending = undefined;
}
function complete() {
  phase.value = 'arrived';
  render(1, 0);
  settle();
}
function arrive() {
  if (pending) return pending;
  if (phase.value === 'arrived') return;
  const required = [shipName.value, harborName.value, oceanName.value];
  if (
    !inView ||
    !root.value?.getBoundingClientRect().width ||
    !required.every((name) => ready.has(name)) ||
    document.hidden ||
    reducedMotion.value === 'reduce'
  ) {
    complete();
    return;
  }
  origin = { ...pose };
  arrivalStart = performance.now();
  phase.value = 'arriving';
  pending = new Promise<void>((resolve) => {
    finish = resolve;
    // Keep the decoration bounded even if frames or asset loading stall.
    timer = setTimeout(complete, 2000);
  });
  return pending;
}

function render(p: number, dt: number) {
  const arriving = phase.value !== 'cruising';
  const advance = 1 - (1 - p) ** 2;
  const speed = arriving ? 1 - p : 1;
  const damp = arriving ? 1 - smooth(0, 0.88, p) : 1;
  // The shore is a fixed reference. Only the yacht advances toward its berth;
  // the wakes and contact shadow follow the same hull pose.
  pose = {
    x: arriving
      ? mix(origin.x, 225, advance)
      : 125 + Math.sin(elapsed * 0.6) * 1.4,
    y: arriving
      ? mix(origin.y, 135.3, advance)
      : 106.3 + Math.sin(elapsed * 1.25) * 1.1,
    angle: arriving ? origin.angle * damp : Math.sin(elapsed * 0.85) * 0.3,
  };
  travel += dt * speed;
  for (let layer = 0; layer < 2; layer++) {
    // Crossfade the wrap while transparent; no tiled seam or reset jump.
    const progress = (travel / 5 + layer * 0.5) % 1;
    const offset = 24 - progress * 48;
    move(`sea-flow-${layer}`, offset, offset * 0.29);
    attr(
      `sea-flow-${layer}`,
      'opacity',
      Math.sin(progress * Math.PI) ** 2 * 0.55,
    );
  }
  // Small spreading wavelets leave the stern, widen and dissolve into the sea.
  // Each resets while transparent, so there is no looping ribbon or dashed line.
  for (let layer = 0; layer < 5; layer++) {
    const age = (travel / 2.8 + layer / 5) % 1;
    attr(
      `wake-flow-${layer}`,
      'transform',
      `translate(${(8 - age * 106).toFixed(2)} ${(68 - age * 30.7).toFixed(2)}) scale(${(0.6 + age * 2.4).toFixed(3)} ${(0.6 + age * 1.1).toFixed(3)})`,
    );
    attr(`wake-flow-${layer}`, 'opacity', Math.sin(age * Math.PI) ** 1.4 * 0.85);
  }
  attr('water-displacement', 'scale', 1.3 + Math.sin(elapsed * 1.1) * 0.45);
  attr('harbor', 'opacity', smooth(0.02, 0.22, p));
  // The same water remains underneath the quay during the entire approach.
  const transform = `translate(${pose.x.toFixed(2)} ${pose.y.toFixed(2)}) rotate(${pose.angle.toFixed(3)} 145 93)`;
  for (const name of [
    'vehicle',
    'contact',
    'wake',
    'bow-wash',
    'ship-reflection',
  ])
    attr(name, 'transform', transform);
  const wash = arriving ? 1 - smooth(0.18, 1, p) : 1;
  attr('wake', 'opacity', (darkScene.value ? 0.72 : 0.9) * wash);
  attr('bow-wash', 'opacity', (darkScene.value ? 0.65 : 0.9) * wash);
  attr('bow-foam', 'opacity', 0.7 + Math.sin(travel * 3) * 0.15);
}
function tick(now: number) {
  const dt = Math.min((now - (lastTime || now)) / 1000, 0.05);
  lastTime = now;
  elapsed += dt;
  const p =
    phase.value === 'arrived'
      ? 1
      : arrivalStart === undefined
        ? 0
        : clamp((now - arrivalStart) / 1600);
  render(p, dt);
  if (p === 1 && phase.value === 'arriving') {
    phase.value = 'arrived';
    hold = setTimeout(settle, 200);
  }
  if (phase.value !== 'arrived') frame = requestAnimationFrame(tick);
}
async function collect() {
  await nextTick();
  parts = new Map(
    [...(root.value?.querySelectorAll('[data-part]') ?? [])].map((el) => [
      el.getAttribute('data-part')!,
      el,
    ]),
  );
  render(phase.value === 'arrived' ? 1 : 0, 0);
}
watch(
  () => props.dark,
  (dark) => {
    darkScene.value = dark;
    if (phase.value === 'cruising') render(0, 0);
    else if (phase.value === 'arrived') render(1, 0);
  },
);
function schedule() {
  cancelAnimationFrame(frame);
  lastTime = 0;
  if (
    inView &&
    !document.hidden &&
    reducedMotion.value !== 'reduce' &&
    phase.value !== 'arrived'
  )
    frame = requestAnimationFrame(tick);
}
watch(reducedMotion, (value) => {
  if (value === 'reduce' && phase.value === 'arriving') complete();
  schedule();
});
function onVisibility() {
  if (document.hidden && phase.value === 'arriving') complete();
  schedule();
}
onMounted(() => {
  void collect();
  unregister = registerLoginTransition(arrive);
  document.addEventListener('visibilitychange', onVisibility);
  observer = new IntersectionObserver(([entry]) => {
    inView = entry?.isIntersecting ?? false;
    if (!inView && phase.value === 'arriving') complete();
    schedule();
  });
  if (root.value) observer.observe(root.value);
  schedule();
});
onBeforeUnmount(() => {
  unregister?.();
  observer?.disconnect();
  cancelAnimationFrame(frame);
  document.removeEventListener('visibilitychange', onVisibility);
  settle();
});
</script>

<template>
  <div
    ref="root"
    class="auth-journey"
    data-scene="ship"
    :data-lighting="lighting"
    :data-form-side="formOnLeft ? 'left' : 'right'"
    :data-phase="phase"
    data-testid="auth-journey"
  >
    <div class="journey-composition">
      <svg
        class="journey-stage"
        viewBox="0 0 600 360"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <radialGradient :id="`${id}-fade`">
            <stop offset=".45" stop-color="white" />
            <stop offset=".72" stop-color="white" stop-opacity=".85" />
            <stop offset="1" stop-color="white" stop-opacity="0" />
          </radialGradient>
          <mask
            :id="`${id}-edges`"
            maskUnits="userSpaceOnUse"
            x="0"
            y="65"
            width="600"
            height="280"
          >
            <ellipse
              cx="300"
              cy="211"
              rx="300"
              ry="126"
              :fill="paint('fade')"
            />
          </mask>
          <filter
            :id="`${id}-soft`"
            x="-30%"
            y="-100%"
            width="160%"
            height="300%"
          >
            <feGaussianBlur stdDeviation="2" />
          </filter>
          <filter
            :id="`${id}-water`"
            x="-5%"
            y="-10%"
            width="110%"
            height="120%"
            color-interpolation-filters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency=".018 .12"
              numOctaves="2"
              seed="21"
              result="noise"
            />
            <feDisplacementMap
              data-part="water-displacement"
              in="SourceGraphic"
              in2="noise"
              scale="1.3"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          <filter
            :id="`${id}-foam`"
            x="-30%"
            y="-100%"
            width="160%"
            height="300%"
            color-interpolation-filters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency=".11 .32"
              numOctaves="3"
              seed="8"
              result="grain"
            />
            <feColorMatrix
              in="grain"
              type="matrix"
              values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  8 0 0 0 -3.2"
              result="broken-foam"
            />
            <feComposite in="SourceGraphic" in2="broken-foam" operator="in" />
            <feGaussianBlur stdDeviation=".22" />
          </filter>
          <linearGradient
            :id="`${id}-wake-fade`"
            x1="-115"
            y1="0"
            x2="14"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop :stop-color="darkScene ? '#bed4df' : '#e6f4f7'" stop-opacity="0" />
            <stop offset=".35" :stop-color="darkScene ? '#bed4df' : '#e6f4f7'" stop-opacity=".15" />
            <stop offset=".78" :stop-color="darkScene ? '#bed4df' : '#e6f4f7'" stop-opacity=".55" />
            <stop offset="1" :stop-color="darkScene ? '#bed4df' : '#e6f4f7'" stop-opacity=".8" />
          </linearGradient>
          <linearGradient
            :id="`${id}-reflection-fade`"
            x1="0"
            y1="80"
            x2="0"
            y2="158"
            gradientUnits="userSpaceOnUse"
          >
            <stop stop-color="white" stop-opacity=".32" />
            <stop offset="1" stop-color="white" stop-opacity="0" />
          </linearGradient>
          <mask :id="`${id}-reflection-mask`">
            <path
              d="M7 66L197 120 282 108V185H0Z"
              :fill="paint('reflection-fade')"
            />
          </mask>
        </defs>
        <g :mask="paint('edges')">
          <g data-part="ocean" opacity="1" :filter="paint('water')">
            <image
              :href="asset(oceanName)"
              x="-50"
              y="20"
              width="700"
              height="350"
              preserveAspectRatio="xMidYMid slice"
              @load="ready.add(oceanName)"
            />
            <g
              v-for="layer in [0, 1]"
              :key="layer"
              :data-part="`sea-flow-${layer}`"
            >
              <image
                :href="asset(oceanName)"
                x="-80"
                y="0"
                width="760"
                height="380"
                preserveAspectRatio="xMidYMid slice"
              />
            </g>
          </g>
        </g>
        <!-- Keep the pavilion intact above the water; its fenders sit behind the hull. -->
        <g data-part="harbor" opacity="0" transform="translate(0 0)">
          <ellipse
            cx="430"
            cy="182"
            rx="125"
            ry="12"
            fill="#071829"
            :opacity="darkScene ? 0.24 : 0.12"
            transform="rotate(19 430 182)"
            :filter="paint('soft')"
          />
          <image
            :href="asset(harborName)"
            x="278"
            y="83"
            width="300"
            height="150"
            @load="ready.add(harborName)"
          />
        </g>
        <g :mask="paint('edges')">
          <g data-part="ship-reflection" opacity=".22">
            <g :mask="paint('reflection-mask')" :filter="paint('water')">
              <image
                :href="asset(shipName)"
                width="290"
                height="126"
                transform="matrix(1 .35 0 -.42 0 100)"
              />
            </g>
          </g>
          <g data-part="contact" opacity=".22" :filter="paint('soft')">
            <path
              d="M10 66Q85 99 197 121M222 94L281 108"
              stroke="#102f45"
              stroke-width="5"
            />
          </g>
          <g data-part="wake">
            <!-- A broad translucent disturbance sits on the water plane. Its
                 foam breaks up across the surface instead of forming white jets. -->
            <g :fill="paint('wake-fade')" :filter="paint('foam')">
              <path d="M14 64Q-25 48-105 24L-119 43Q-48 65 10 73Z" />
              <path d="M69 49Q23 34-48 16L-57 26Q11 47 64 54Z" opacity=".4" />
            </g>
            <g
              v-for="layer in [0, 1, 2, 3, 4]"
              :key="layer"
              :data-part="`wake-flow-${layer}`"
              :stroke="darkScene ? '#bed4df' : '#eaf6f8'"
              :filter="paint('foam')"
              stroke-width="1.2"
              stroke-linecap="round"
            >
              <path
:d="layer % 2 === 0
                ? 'M-7-5Q-1-2 1 1Q2 4-5 7M-10 1Q-7 3-9 5'
                : 'M-6-6Q1-3 2 1Q3 5-4 8M-9-2Q-5 1-7 4'"
/>
            </g>
          </g>
        </g>
        <g data-part="vehicle" transform="translate(125 106.3)">
          <image
            :href="asset(shipName)"
            width="290"
            height="126"
            @load="ready.add(shipName)"
          />
        </g>
        <g data-part="bow-wash" :filter="paint('foam')">
          <g data-part="bow-foam" :fill="darkScene ? '#b0c8d1' : '#eff9fa'">
            <path d="M167 118Q185 125 198 121L201 119Q205 125 196 128Q182 128 167 121Z" />
            <path d="M254 104Q272 111 282 108L284 106Q289 112 280 115Q267 114 254 107Z" />
          </g>
        </g>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.auth-journey {
  --sky: #edf2f8;
  --edge: hsl(var(--background));

  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--sky);
  isolation: isolate;
}
.auth-journey[data-lighting='night'] {
  --sky: #0c1727;
  --edge: hsl(var(--background-deep));
}
.auth-journey::after {
  position: absolute;
  z-index: 2;
  inset: 0;
  pointer-events: none;
  content: '';
  background: linear-gradient(90deg, transparent 82%, var(--edge) 100%);
}
.auth-journey[data-form-side='left']::after {
  background: linear-gradient(270deg, transparent 82%, var(--edge) 100%);
}
.journey-composition {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  width: min(88%, 560px);
  flex-direction: column;
  align-items: center;
  transform: translate(-50%, -50%);
}
.journey-stage {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
  pointer-events: none;
  user-select: none;
}
.auth-journey[data-form-side='left'] .journey-stage {
  transform: scaleX(-1);
}
@media (max-height: 640px) {
  .journey-composition {
    width: min(80%, 440px);
  }
}
</style>
