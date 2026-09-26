// AI-art frame workspace: shared by the web tool (pixel.vardir.no) and the
// editor's Import AI Art dialog so both offer the same downscale-and-animate
// flow from one implementation.

export { FrameWorkspace, type FrameWorkspaceProps, type WorkspaceView } from './FrameWorkspace';
export { Timeline, type TimelineProps } from './Timeline';
export { useEngine, type EngineOutput } from './useEngine';
export type { FrameResult } from './engine';
export { useComposition, usePlayer, frameDuration, playOrder, type AnimSettings, type Composition, type Player } from './useAnimation';
export { EMPTY_HISTORY, framesReducer, makeFrame, newFrameId, naturalCompare, type FrameAction, type FrameHistory, type FrameItem, type FramePatch } from './frames';
export { framesFromFiles, pickImageFiles, IMAGE_ACCEPT } from './files';
export { imageCanvas, paintFitted, useBoxSize, useFittedCanvas } from './canvas';
export { Icon, type IconName } from './icons';
