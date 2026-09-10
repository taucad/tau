# @jscad/modeling — text

1 top-level symbols. Signatures are verbatim typescript.

text

declare function vectorChar(): VectorChar
declare function vectorChar(char: string): VectorChar
declare function vectorChar(options: VectorCharOptions): VectorChar
declare function vectorChar(options: Omit<VectorCharOptions, 'input'>, char: string): VectorChar

VectorChar: export interface VectorChar

    width: number

    height: number

    segments: Array<Array<Vec2>>

VectorCharOptions: export interface VectorCharOptions

    xOffset: number

    yOffset: number

    height: number

    extrudeOffset: number

    input: string

declare function vectorText(): VectorText
declare function vectorText(text: string): VectorText
declare function vectorText(options: VectorTextOptions): VectorText
declare function vectorText(options: Omit<VectorTextOptions, 'input'>, text: string): VectorText

VectorText: export interface VectorText extends Array<Array<Vec2>>

VectorTextOptions: export interface VectorTextOptions

    xOffset: number

    yOffset: number

    height: number

    lineSpacing: number

    letterSpacing: number

    align: 'left' | 'center' | 'right'

    extrudeOffset: number

    input: string
