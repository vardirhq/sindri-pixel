// Sindri Pixel Editor — core type definitions.

export type PixelGrid = (string | null)[][];

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  pixels: PixelGrid;
}

export interface Frame {
  id: string;
  duration: number; // ms
  layers: Layer[];
}

export type Tool =
  | 'pencil'
  | 'eraser'
  | 'fill'
  | 'picker'
  | 'line'
  | 'rect'
  | 'circle'
  | 'select'
  | 'wand'
  | 'lasso'
  | 'move'
  | 'pan';

export type ViewHelper = 'topdown' | 'side' | 'iso' | null;

export interface ToolOptions {
  brushSize: number;
  filled: boolean;
  perfectShapes: boolean;
  contiguous: boolean;
  threshold: number;
}

export type SymmetryMode = 'off' | 'v' | 'h' | 'both';

export interface Modifiers {
  symmetry: SymmetryMode;
  tile: boolean;
}

export type LeftTab = 'tools' | 'files' | 'history';
export type RightTab = 'layers' | 'palette' | 'inspector';
export type CenterTab = 'editor' | 'preview' | 'split';

export type Density = 'comfortable' | 'compact';

export type TutorialMode = 'off' | 'library' | 'playing' | 'authoring';

export interface ProposalChange {
  kind: 'frame' | 'palette' | 'layer';
  title: string;
  meta: string;
  body: string;
}

export interface Proposal {
  visible: boolean;
  busy?: boolean;
  prompt: string;
  title?: string;
  frame?: Frame;
  changes?: ProposalChange[];
}

export type AppStage = 'loading' | 'welcome' | 'editor';

export interface CursorPos {
  x: number;
  y: number;
}

export interface AppMenuState {
  anchorRect: DOMRect;
  tab: string;
}

export interface SpotlightRect {
  scope: 'center' | 'viewport';
  x: number;
  y: number;
  w: number;
  h: number;
  calloutSide: 'left' | 'right' | 'top' | 'bottom';
}

export interface LessonStep {
  id: string;
  kind: 'instruction' | 'task' | 'checkpoint';
  title: string;
  goalSummary: string;
  instruction: string;
  hint: string;
  spotlightTarget: string;
  highlightRegion: { x: number; y: number; w: number; h: number } | null;
  validation: { type: string; requiredTool?: string };
  allowedTools: Tool[];
  hasExampleArt: boolean;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  steps: LessonStep[] | number;
  coverPixels?: PixelGrid | null;
}

export interface AIStatus {
  text: string;
  dot: string;
  kind: 'idle' | 'review' | 'busy';
  amber: boolean;
}
