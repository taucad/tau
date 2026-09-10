# @jscad/modeling — colors

1 top-level symbols. Signatures are verbatim typescript.

colors

declare function colorize<T extends Geometry>(color: RGB | RGBA, object: T): T & Colored
declare function colorize<T extends Geometry>(color: RGB | RGBA, ...objects: RecursiveArray<T>): Array<T & Colored>
declare function colorize(color: RGB | RGBA, ...objects: RecursiveArray<Geometry>): Array<Geometry & Colored>

declare function colorNameToRgb(s: string): RGB

cssColors

    black: RGB

    silver: RGB

    gray: RGB

    white: RGB

    maroon: RGB

    red: RGB

    purple: RGB

    fuchsia: RGB

    green: RGB

    lime: RGB

    olive: RGB

    yellow: RGB

    navy: RGB

    blue: RGB

    teal: RGB

    aqua: RGB

    aliceblue: RGB

    antiquewhite: RGB

    aquamarine: RGB

    azure: RGB

    beige: RGB

    bisque: RGB

    blanchedalmond: RGB

    blueviolet: RGB

    brown: RGB

    burlywood: RGB

    cadetblue: RGB

    chartreuse: RGB

    chocolate: RGB

    coral: RGB

    cornflowerblue: RGB

    cornsilk: RGB

    crimson: RGB

    cyan: RGB

    darkblue: RGB

    darkcyan: RGB

    darkgoldenrod: RGB

    darkgray: RGB

    darkgreen: RGB

    darkgrey: RGB

    darkkhaki: RGB

    darkmagenta: RGB

    darkolivegreen: RGB

    darkorange: RGB

    darkorchid: RGB

    darkred: RGB

    darksalmon: RGB

    darkseagreen: RGB

    darkslateblue: RGB

    darkslategray: RGB

    darkslategrey: RGB

    darkturquoise: RGB

    darkviolet: RGB

    deeppink: RGB

    deepskyblue: RGB

    dimgray: RGB

    dimgrey: RGB

    dodgerblue: RGB

    firebrick: RGB

    floralwhite: RGB

    forestgreen: RGB

    gainsboro: RGB

    ghostwhite: RGB

    gold: RGB

    goldenrod: RGB

    greenyellow: RGB

    grey: RGB

    honeydew: RGB

    hotpink: RGB

    indianred: RGB

    indigo: RGB

    ivory: RGB

    khaki: RGB

    lavender: RGB

    lavenderblush: RGB

    lawngreen: RGB

    lemonchiffon: RGB

    lightblue: RGB

    lightcoral: RGB

    lightcyan: RGB

    lightgoldenrodyellow: RGB

    lightgray: RGB

    lightgreen: RGB

    lightgrey: RGB

    lightpink: RGB

    lightsalmon: RGB

    lightseagreen: RGB

    lightskyblue: RGB

    lightslategray: RGB

    lightslategrey: RGB

    lightsteelblue: RGB

    lightyellow: RGB

    limegreen: RGB

    linen: RGB

    magenta: RGB

    mediumaquamarine: RGB

    mediumblue: RGB

    mediumorchid: RGB

    mediumpurple: RGB

    mediumseagreen: RGB

    mediumslateblue: RGB

    mediumspringgreen: RGB

    mediumturquoise: RGB

    mediumvioletred: RGB

    midnightblue: RGB

    mintcream: RGB

    mistyrose: RGB

    moccasin: RGB

    navajowhite: RGB

    oldlace: RGB

    olivedrab: RGB

    orange: RGB

    orangered: RGB

    orchid: RGB

    palegoldenrod: RGB

    palegreen: RGB

    paleturquoise: RGB

    palevioletred: RGB

    papayawhip: RGB

    peachpuff: RGB

    peru: RGB

    pink: RGB

    plum: RGB

    powderblue: RGB

    rosybrown: RGB

    royalblue: RGB

    saddlebrown: RGB

    salmon: RGB

    sandybrown: RGB

    seagreen: RGB

    seashell: RGB

    sienna: RGB

    skyblue: RGB

    slateblue: RGB

    slategray: RGB

    slategrey: RGB

    snow: RGB

    springgreen: RGB

    steelblue: RGB

    tan: RGB

    thistle: RGB

    tomato: RGB

    turquoise: RGB

    violet: RGB

    wheat: RGB

    whitesmoke: RGB

    yellowgreen: RGB

declare function hexToRgb(hex: string): RGB | RGBA

declare function hslToRgb(hsl: HSL): RGB
declare function hslToRgb(hsl: HSLA): RGBA
declare function hslToRgb(...hsl: HSL): RGB
declare function hslToRgb(...hsl: HSLA): RGBA

declare function hsvToRgb(hsv: HSV): RGB
declare function hsvToRgb(hsv: HSVA): RGBA
declare function hsvToRgb(...hsv: HSV): RGB
declare function hsvToRgb(...hsv: HSVA): RGBA

declare function hueToColorComponent(p: number, q: number, t: number): number

declare function rgbToHex(rgb: RGB | RGBA): string
declare function rgbToHex(...rgb: RGB | RGBA): string

declare function rgbToHsl(rgb: RGB): HSL
declare function rgbToHsl(rgb: RGBA): HSLA
declare function rgbToHsl(...rgb: RGB): HSL
declare function rgbToHsl(...rgb: RGBA): HSLA

declare function rgbToHsv(rgb: RGB): HSV
declare function rgbToHsv(rgb: RGBA): HSVA
declare function rgbToHsv(...rgb: RGB): HSV
declare function rgbToHsv(...rgb: RGBA): HSVA

RGB: [number, number, number]

RGBA: [number, number, number, number]

HSL: [number, number, number]

HSLA: [number, number, number, number]

HSV: [number, number, number]

HSVA: [number, number, number, number]
