import { Easing } from "remotion";

export const easings = {
  easeOutCubic: Easing.bezier(0.33, 1, 0.68, 1),
  easeOutQuart: Easing.bezier(0.25, 1, 0.5, 1),
  easeInOutCubic: Easing.bezier(0.65, 0, 0.35, 1),
  easeInOutSine: Easing.bezier(0.37, 0, 0.63, 1),
  easeOutExpo: Easing.bezier(0.16, 1, 0.3, 1),
  easeOutBackSubtle: Easing.bezier(0.34, 1.3, 0.64, 1),
  easeInCubic: Easing.bezier(0.32, 0, 0.67, 0),
  easeInQuad: Easing.bezier(0.11, 0, 0.5, 0),
} as const;

export const easingBezier = {
  easeOutCubic: [0.33, 1, 0.68, 1],
  easeOutQuart: [0.25, 1, 0.5, 1],
  easeInOutCubic: [0.65, 0, 0.35, 1],
  easeInOutSine: [0.37, 0, 0.63, 1],
  easeOutExpo: [0.16, 1, 0.3, 1],
  easeOutBackSubtle: [0.34, 1.3, 0.64, 1],
  easeInCubic: [0.32, 0, 0.67, 0],
  easeInQuad: [0.11, 0, 0.5, 0],
} as const;

export type EasingName = keyof typeof easings;

export const motionRole = {
  cardReveal: "easeOutCubic",
  labelReveal: "easeOutCubic",
  panelReveal: "easeOutCubic",
  nodeActivate: "easeOutQuart",
  systemModuleEnter: "easeOutQuart",
  signalTravel: "easeInOutCubic",
  chartGrow: "easeInOutCubic",
  progressLine: "easeInOutCubic",
  metricCountUp: "easeOutCubic",
  cameraDrift: "easeInOutSine",
  parallax: "easeInOutSine",
  finalInsight: "easeOutExpo",
  resolution: "easeOutExpo",
  keyCallout: "easeOutBackSubtle",
  warningMarker: "easeOutBackSubtle",
  bottleneckBuildup: "easeInCubic",
  costEscalation: "easeInQuad",
} as const satisfies Record<string, EasingName>;

export type MotionRole = keyof typeof motionRole;

export const duration = {
  textReveal: 0.5,
  cardReveal: 0.6,
  nodeActivate: 0.5,
  signalTravel: 1.0,
  chartGrow: 3.0,
  finalInsightHold: 3.0,
  importantLabelHold: 2.0,
} as const;

export const parallax = {
  background: { min: 1, max: 3 },
  midground: { min: 3, max: 8 },
  foreground: { min: 8, max: 16 },
} as const;

export const camera = {
  subtleZoom: { from: 1.0, to: 1.03 },
  premiumZoom: { from: 1.0, to: 1.06 },
  panMaxPx: 40,
  maxZoom: 1.1,
} as const;

export const storyPattern = {
  problemSystemResult: "A",
  inputAgentDecisionAction: "B",
  beforeBottleneckAfter: "C",
  signalVsNoise: "D",
  layersOfLeverage: "E",
} as const;

export type StoryPatternKey = keyof typeof storyPattern;

export function easingFor(role: MotionRole) {
  return easings[motionRole[role]];
}

export const beat = {
  HOOK_END: 1.2,
  ORIENTATION_END: 3.0,
  MECHANISM_END: 8.0,
  INSIGHT_END: 11.5,
  MEMORY_ANCHOR_END: 15.0,
} as const;

export const shortBeat = {
  HOOK_END: 1.5,
  MECHANISM_END: 5.5,
  MEMORY_ANCHOR_END: 8.0,
} as const;

export const durationMs = {
  tinyUi: { min: 200, max: 350 },
  label: { min: 300, max: 500 },
  card: { min: 400, max: 700 },
  mainPanel: { min: 600, max: 900 },
  chartGrowth: { min: 1200, max: 2500 },
  signalTravel: { min: 700, max: 1500 },
  cameraMovement: { min: 3000, max: 8000 },
  finalInsight: { min: 500, max: 900 },
} as const;

export const staggerMs = {
  smallLabel: { min: 50, max: 80 },
  cardGroup: { min: 100, max: 160 },
  workflowNode: { min: 180, max: 300 },
  majorSection: { min: 400, max: 700 },
  maxElements: 7,
} as const;

export const pauseMs = {
  afterHeadline: { min: 300, max: 500 },
  afterProblemState: { min: 400, max: 700 },
  afterBottleneck: { min: 300, max: 600 },
  beforeFinalTakeaway: { min: 250, max: 500 },
  finalHoldMin: 2500,
  finalHoldMax: 3500,
} as const;

export const anticipationMs = { min: 200, max: 500 } as const;
export const focusLockMs = { min: 700, max: 1500 } as const;

export const motionPriority = {
  P1_CORE: 1,
  P2_SUPPORTING: 2,
  P3_ATMOSPHERE: 3,
  P4_STATIC: 4,
} as const;

export const motionPriorityLimit = {
  maxSimultaneousP1: 2,
} as const;
