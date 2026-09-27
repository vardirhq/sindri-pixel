import React from 'react';

export interface IconProps {
  size?: number;
  stroke?: string;
  sw?: number;
  style?: React.CSSProperties;
}

const Icon: React.FC<IconProps & { children?: React.ReactNode }> = ({
  size = 14,
  stroke = 'currentColor',
  sw = 1.4,
  children,
  style,
  ...rest
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke={stroke}
    strokeWidth={sw}
    strokeLinecap="square"
    strokeLinejoin="miter"
    style={style}
    {...rest}
  >
    {children}
  </svg>
);

// — playback / nav —
export const IconPlay     = (p: IconProps) => <Icon {...p}><path d="M5 3 L13 8 L5 13 Z"/></Icon>;
export const IconPause    = (p: IconProps) => <Icon {...p}><path d="M5 3 V13 M11 3 V13"/></Icon>;
export const IconStop     = (p: IconProps) => <Icon {...p}><path d="M4 4 H12 V12 H4 Z"/></Icon>;
export const IconChevron  = (p: IconProps) => <Icon {...p}><path d="M5 6 L8 9 L11 6"/></Icon>;
export const IconChevronR = (p: IconProps) => <Icon {...p}><path d="M6 4 L9 8 L6 12"/></Icon>;
export const IconPlus     = (p: IconProps) => <Icon {...p}><path d="M8 3 V13 M3 8 H13"/></Icon>;
export const IconX        = (p: IconProps) => <Icon {...p}><path d="M4 4 L12 12 M12 4 L4 12"/></Icon>;
export const IconCheck    = (p: IconProps) => <Icon {...p}><path d="M3 8 L7 12 L13 4"/></Icon>;
export const IconTrash    = (p: IconProps) => <Icon {...p}><path d="M3 4 H13 M6 4 V2 H10 V4 M5 4 V14 H11 V4 M7 7 V11 M9 7 V11"/></Icon>;
export const IconCopy     = (p: IconProps) => <Icon {...p}><path d="M3 3 H10 V10 H3 Z M6 6 H13 V13 H6"/></Icon>;
export const IconEye      = (p: IconProps) => <Icon {...p}><path d="M1 8 C 3 4, 6 3, 8 3 C 10 3, 13 4, 15 8 C 13 12, 10 13, 8 13 C 6 13, 3 12, 1 8 Z"/><circle cx="8" cy="8" r="2"/></Icon>;
export const IconEyeOff   = (p: IconProps) => <Icon {...p}><path d="M2 4 L14 12 M1 8 C 3 4, 6 3, 8 3 C 10 3, 13 4, 15 8 C 14 10, 12.5 11, 11 11.5 M5 11.5 C 3.5 11, 2 10, 1 8"/></Icon>;
export const IconArrowUp  = (p: IconProps) => <Icon {...p}><path d="M8 13 V3 M4 7 L8 3 L12 7"/></Icon>;
export const IconArrowDn  = (p: IconProps) => <Icon {...p}><path d="M8 3 V13 M4 9 L8 13 L12 9"/></Icon>;
export const IconUndo     = (p: IconProps) => <Icon {...p}><path d="M5 5 L2 8 L5 11 M2 8 H10 A4 4 0 0 1 14 12"/></Icon>;
export const IconRedo     = (p: IconProps) => <Icon {...p}><path d="M11 5 L14 8 L11 11 M14 8 H6 A4 4 0 0 0 2 12"/></Icon>;
export const IconSparkle  = (p: IconProps) => <Icon {...p} sw={p.sw ?? 1.1}><path d="M8 2 L9 6 L13 7 L9 8 L8 13 L7 8 L3 7 L7 6 Z"/></Icon>;
export const IconSearch   = (p: IconProps) => <Icon {...p}><circle cx="7" cy="7" r="4"/><path d="M10 10 L14 14"/></Icon>;
export const IconFolder   = (p: IconProps) => <Icon {...p}><path d="M2 4 H6 L8 6 H14 V13 H2 Z"/></Icon>;
export const IconFile     = (p: IconProps) => <Icon {...p}><path d="M4 2 H10 L13 5 V14 H4 Z M10 2 V5 H13"/></Icon>;
export const IconHistory  = (p: IconProps) => <Icon {...p}><path d="M3 8 A5 5 0 1 1 8 13 M3 8 H1 M3 8 L5 6 M8 5 V8 L10 10"/></Icon>;
export const IconGrid     = (p: IconProps) => <Icon {...p}><path d="M2 2 H14 V14 H2 Z M2 6 H14 M2 10 H14 M6 2 V14 M10 2 V14"/></Icon>;
export const IconLock     = (p: IconProps) => <Icon {...p}><rect x="3" y="7" width="10" height="7"/><path d="M5 7 V5 A3 3 0 0 1 11 5 V7"/></Icon>;
export const IconGroup    = (p: IconProps) => <Icon {...p}><rect x="2" y="2" width="7" height="7"/><rect x="7" y="7" width="7" height="7"/></Icon>;
export const IconMerge    = (p: IconProps) => <Icon {...p}><path d="M3 3 H8 V13 H3 Z M8 8 H13"/></Icon>;
export const IconRefresh  = (p: IconProps) => <Icon {...p}><path d="M3 8 A5 5 0 0 1 13 5 M13 2 V5 H10 M13 8 A5 5 0 0 1 3 11 M3 14 V11 H6"/></Icon>;
export const IconDownload = (p: IconProps) => <Icon {...p}><path d="M8 2 V11 M4 7 L8 11 L12 7 M2 13 H14"/></Icon>;
export const IconSettings = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="2"/><path d="M8 1 V3 M8 13 V15 M1 8 H3 M13 8 H15 M3.5 3.5 L5 5 M11 11 L12.5 12.5 M3.5 12.5 L5 11 M11 5 L12.5 3.5"/></Icon>;

// — tools (pixel editor) —
export const IconPencil   = (p: IconProps) => <Icon {...p}><path d="M11 2 L14 5 L6 13 L2 14 L3 10 Z M10 3 L13 6"/></Icon>;
export const IconShade    = (p: IconProps) => <Icon {...p}><path d="M2 14 L14 2 M2 2 H14 V14 H2 Z M6 14 V10 M10 14 V6 M14 10 H10"/></Icon>;
export const IconEraser   = (p: IconProps) => <Icon {...p}><path d="M2 11 L8 5 L13 10 L9 14 H6 Z M5 8 L10 13"/></Icon>;
export const IconFill     = (p: IconProps) => <Icon {...p}><path d="M2 8 L8 2 L14 8 L8 14 Z M14 11 C 14 13, 12 13, 12 11 C 12 10, 14 9, 14 11 Z"/></Icon>;
export const IconPicker   = (p: IconProps) => <Icon {...p}><path d="M14 2 L13 1 L9 5 L7 4 L4 7 L9 12 L12 9 L11 7 L15 3 Z M3 13 L2 14"/></Icon>;
export const IconLine     = (p: IconProps) => <Icon {...p}><path d="M3 13 L13 3"/></Icon>;
export const IconRect     = (p: IconProps) => <Icon {...p}><rect x="3" y="3" width="10" height="10"/></Icon>;
export const IconCircle   = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="5"/></Icon>;
export const IconSelect   = (p: IconProps) => <Icon {...p}><path d="M3 3 L7 14 L8.5 9 L13.5 7.5 Z"/></Icon>;
export const IconMarquee  = (p: IconProps) => <Icon {...p}><path d="M2 2 H4 M6 2 H10 M12 2 H14 V4 M14 6 V10 M14 12 V14 H12 M10 14 H6 M4 14 H2 V12 M2 10 V6 M2 4 V2" strokeDasharray="2 2"/></Icon>;
export const IconLasso    = (p: IconProps) => <Icon {...p}><path d="M3 7 C 3 3, 13 3, 13 7 C 13 10, 9 11, 6 11 L7 14"/></Icon>;
export const IconWand     = (p: IconProps) => <Icon {...p}><path d="M2 14 L11 5 M9 3 L13 7 M11 2 L10 4 M14 5 L12 6 M3 4 L4 5 M4 2 L3 3"/></Icon>;
export const IconPan      = (p: IconProps) => <Icon {...p}><path d="M8 13 V5 M5 8 V4 A1 1 0 0 1 7 4 V8 M7 5 V3 A1 1 0 0 1 9 3 V8 M9 4 V3 A1 1 0 0 1 11 3 V11 C 11 13, 9 14, 7 14 C 5 14, 4 12, 4 10 V8"/></Icon>;
export const IconMove     = (p: IconProps) => <Icon {...p}><path d="M8 2 V14 M2 8 H14 M5 5 L2 8 L5 11 M11 5 L14 8 L11 11 M5 5 L8 2 L11 5 M5 11 L8 14 L11 11"/></Icon>;

// — view helpers —
export const IconAxis     = (p: IconProps) => <Icon {...p}><path d="M8 2 V14 M2 8 H14"/></Icon>;
export const IconSide     = (p: IconProps) => <Icon {...p}><path d="M3 12 H13 M5 12 V6 M11 12 V8"/></Icon>;
export const IconIso      = (p: IconProps) => <Icon {...p}><path d="M8 2 L14 6 V11 L8 14 L2 11 V6 Z M8 2 V14 M2 6 L14 11 M14 6 L2 11"/></Icon>;
export const IconSymmetry = (p: IconProps) => <Icon {...p}><path d="M8 2 V14 M3 5 L6 8 L3 11 M13 5 L10 8 L13 11"/></Icon>;
export const IconTile     = (p: IconProps) => <Icon {...p}><rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/></Icon>;

// — frame / animation —
export const IconOnion    = (p: IconProps) => <Icon {...p}><rect x="2" y="2" width="8" height="8"/><rect x="6" y="6" width="8" height="8" strokeDasharray="2 1"/></Icon>;
