import type { tool, toolSelection } from '#constants/tool.constants.js';

export type Tool = (typeof tool)[keyof typeof tool];

export type ToolSelection = (typeof toolSelection)[keyof typeof toolSelection];

export type ToolWithSelection = ToolSelection | Tool[];
