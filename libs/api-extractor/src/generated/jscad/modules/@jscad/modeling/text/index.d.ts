import type { Vec2 } from '@jscad/modeling';

export declare function vectorChar(): VectorChar;
export declare function vectorChar(char: string): VectorChar;
export declare function vectorChar(options: VectorCharOptions): VectorChar;
export declare function vectorChar(options: Omit<VectorCharOptions, 'input'>, char: string): VectorChar;
export interface VectorChar {
    width: number;
    height: number;
    segments: Array<Array<Vec2>>;
}
export interface VectorCharOptions {
    xOffset?: number;
    yOffset?: number;
    height?: number;
    extrudeOffset?: number;
    input?: string;
}
export declare function vectorText(): VectorText;
export declare function vectorText(text: string): VectorText;
export declare function vectorText(options: VectorTextOptions): VectorText;
export declare function vectorText(options: Omit<VectorTextOptions, 'input'>, text: string): VectorText;
export interface VectorText extends Array<Array<Vec2>> {
}
export interface VectorTextOptions {
    xOffset?: number;
    yOffset?: number;
    height?: number;
    lineSpacing?: number;
    letterSpacing?: number;
    align?: 'left' | 'center' | 'right';
    extrudeOffset?: number;
    input?: string;
}
