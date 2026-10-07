# @tscircuit/core — Footprint strings

1 top-level symbols. Signatures are verbatim typescript.

// Category: Footprint strings
// Valid footprint functions — a footprint string is a function name, an optional pin count, then _<param><value> pairs, like soic8_p1.27mm, pinrow6_p2.54mm or 0402
footprint strings: string

  dip: (num_pins?: number) => FootprinterParamsBuilder<"w" | "p" | "id" | "od" | "wide" | "narrow">

  dpak: (num_pins?: number) => FootprinterParamsBuilder<"p" | "pw" | "pl" | "tabw" | "tabh" | "span" | "w" | "h">

  d2pak: (num_pins?: number) => FootprinterParamsBuilder<"p" | "pw" | "pl" | "tabw" | "tabh" | "span" | "w" | "h">

  to252: (num_pins?: number) => FootprinterParamsBuilder<"p" | "pw" | "pl" | "tabw" | "tabh" | "span" | "w" | "h">

  to263: (num_pins?: number) => FootprinterParamsBuilder<"p" | "pw" | "pl" | "tabw" | "tabh" | "span" | "w" | "h">

  cap: () => FootprinterParamsBuilder<CommonPassiveOptionKey>

  crystal: (num_pins?: number) => FootprinterParamsBuilder<"px" | "py" | "pw" | "ph">

  res: () => FootprinterParamsBuilder<CommonPassiveOptionKey>

  diode: () => FootprinterParamsBuilder<CommonPassiveOptionKey>

  led: () => FootprinterParamsBuilder<CommonPassiveOptionKey>

  led2835: () => FootprinterParamsBuilder<"p1w" | "p2w" | "ph" | "p1x" | "p2x" | "w" | "h">

  led5050: () => FootprinterParamsBuilder<"p" | "rowspan" | "pl" | "pw" | "w" | "h">

  lr: (num_pins?: number) => FootprinterParamsBuilder<"w" | "l" | "pl" | "pr">

  qfp: (num_pins?: number) => FootprinterParamsBuilder<"w" | "p" | "id" | "od" | "wide" | "narrow" | "pillpads">

  quad: (num_pins?: number) => FootprinterParamsBuilder<"w" | "l" | "square" | "pl" | "pr" | "pb" | "pt" | "p" | "pw" | "ph" | "pillpads">

  bga: (num_pins?: number) => FootprinterParamsBuilder<"grid" | "p" | "w" | "h" | "ball" | "pad" | "missing" | "tlorigin" | "blorigin" | "trorigin" | "brorigin" | "circularpads">

  qfn: (num_pins?: number) => FootprinterParamsBuilder<"w" | "h" | "p" | "px" | "py" | "pw" | "pl" | "lrpw" | "lrpl" | "leftrightpadwidth" | "leftrightpadlength" | "leftpins" | "toppins" | "rightpins" | "bottompins" | "lrpins" | "leftrightpins" | "tbpins" | "topbottompins" | "thermalpad" | "thermalpadcenteroffsetx" | "thermalpadcenteroffsety" | "thermalvias" | "thermalviapitch" | "thermalviaid" | "thermalviaod" | "pillpads">

  tqfp: (num_pins?: number) => FootprinterParamsBuilder<"w" | "h" | "p" | "pillpads">

  soic: (num_pins?: number) => FootprinterParamsBuilder<"w" | "p" | "pw" | "pl" | "id" | "od" | "pillpads" | "thermalpad" | "thermalpadcenteroffsetx" | "thermalpadcenteroffsety">

  mlp: (num_pins?: number) => FootprinterParamsBuilder<"w" | "h" | "p" | "pillpads">

  ssop: (num_pins?: number) => FootprinterParamsBuilder<"w" | "p" | "thermalpad" | "thermalpadcenteroffsetx" | "thermalpadcenteroffsety">

  tssop: (num_pins?: number) => FootprinterParamsBuilder<"w" | "p" | "thermalpad" | "thermalpadcenteroffsetx" | "thermalpadcenteroffsety">

  dfn: (num_pins?: number) => FootprinterParamsBuilder<"w" | "p" | "pw" | "pl" | "missing" | "pillpads" | "thermalpad" | "thermalpadcenteroffsetx" | "thermalpadcenteroffsety" | "thermalvias" | "thermalviapitch" | "thermalviaid" | "thermalviaod" | "cornerpads" | "cornerpadcutlength">

  pinrow: (num_pins?: number) => FootprinterParamsBuilder<"p" | "id" | "od" | "male" | "female" | "rows" | "smd" | "surfacemount" | "rightangle" | "pw" | "pl" | "pinlabeltextalignleft" | "pinlabeltextaligncenter" | "pinlabeltextalignright" | "pinlabelverticallyinverted" | "pinlabelorthogonal" | "nosquareplating" | "nopinlabels" | "doublesidedpinlabel" | "bottomsidepinlabel" | "silkscreenborder" | "silkscreenlabel">

  headermodule: (num_pins?: number) => FootprinterParamsBuilder<"p" | "id" | "od" | "male" | "female" | "rows" | "smd" | "surfacemount" | "rightangle" | "pw" | "pl" | "pinlabeltextalignleft" | "pinlabeltextaligncenter" | "pinlabeltextalignright" | "pinlabelverticallyinverted" | "pinlabelorthogonal" | "nosquareplating" | "nopinlabels" | "doublesidedpinlabel" | "bottomsidepinlabel" | "silkscreenborder" | "silkscreenlabel">

  smdpinheader: (num_pins?: number) => FootprinterParamsBuilder<"p" | "py" | "pw" | "ph" | "bh">

  axial: () => FootprinterParamsBuilder<"p" | "id" | "od">

  radial: () => FootprinterParamsBuilder<"p" | "id" | "od" | "ceramic" | "electrolytic" | "polarized">

  rj45: (num_pins?: number) => FootprinterParamsBuilder<"ledpins" | "firstpinleft" | "firstpintop" | "p" | "py" | "id" | "od" | "shieldx" | "shieldy" | "shieldid" | "shieldod" | "holex" | "holey" | "holed" | "ledx" | "ledp" | "ledy" | "w" | "h" | "bodyy">

  hc49: () => FootprinterParamsBuilder<"p" | "id" | "od" | "w" | "h">

  to220: () => FootprinterParamsBuilder<"w" | "h" | "p" | "id" | "od">

  to220f: () => FootprinterParamsBuilder<"w" | "h" | "p" | "id" | "od">

  sot363: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sot886: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sot457: () => FootprinterParamsBuilder<"w" | "p" | "h" | "pl" | "pw" | "wave" | "reflow" | "pillr" | "pillh" | "pillw">

  sot563: () => FootprinterParamsBuilder<"w" | "p" | "pl" | "pw">

  sot723: () => FootprinterParamsBuilder<"w" | "h" | "pl" | "pw" | "p">

  sot23: () => FootprinterParamsBuilder<"w" | "h" | "pl" | "pw">

  sot25: () => FootprinterParamsBuilder<"w" | "h" | "pl" | "pw">

  sot: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sot143: () => FootprinterParamsBuilder<"w" | "h" | "p" | "px" | "pw" | "ph" | "pin1padwidth" | "pin1centeroffsetx">

  sot323: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sot89: () => FootprinterParamsBuilder<"w" | "p" | "pl" | "pw" | "h">

  sot343: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sod323w: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  smc: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pw" | "pl">

  minimelf: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pw" | "pl">

  melf: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pw" | "pl">

  jst: () => FootprinterParamsBuilder<"w" | "h" | "p" | "id" | "pw" | "pl" | "ph" | "sh" | "smd" | "mpx" | "mpy" | "mpw" | "mpl" | "mounttop">

  micromelf: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pw" | "pl">

  ms013: () => FootprinterParamsBuilder<"w" | "p">

  ms012: () => FootprinterParamsBuilder<"w" | "p">

  lqfp: (num_pins?: number) => FootprinterParamsBuilder<"w" | "h" | "pl" | "pw" | "pillpads">

  lga: (num_pins?: number) => FootprinterParamsBuilder<"grid" | "p" | "w" | "h" | "pl" | "pw" | "pillpads">

  sma: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  smf: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  smb: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  smbf: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  potentiometer: () => FootprinterParamsBuilder<"w" | "h" | "p" | "id" | "od" | "pw" | "ca">

  electrolytic: () => FootprinterParamsBuilder<"d" | "p" | "id" | "od">

  sod923: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sod323: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sod80: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sod882: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sod882d: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sod723: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sod523: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sod323f: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sod323fl: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sod128: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sod123f: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sod123fl: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sod123: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sod123w: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  sod110: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  to92: () => FootprinterParamsBuilder<"w" | "h" | "p" | "id" | "od" | "inline">

  to92s: () => FootprinterParamsBuilder<"w" | "h" | "p" | "id" | "od">

  to92l: () => FootprinterParamsBuilder<"w" | "h" | "p" | "id" | "od">

  sot223: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw" | "tabpl" | "tabpw" | "taboffset">

  m2host: () => FootprinterParamsBuilder<never>

  son: (num_pins?: number) => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw" | "epw" | "eph" | "ep">

  vson: (num_pins?: number) => FootprinterParamsBuilder<"p" | "w" | "grid" | "ep" | "epx" | "pinw" | "pinh">

  wson: (num_pins?: number) => FootprinterParamsBuilder<"p" | "rowspan" | "pl" | "pw" | "ep" | "epw" | "eph" | "w" | "h">

  vssop: (num_pins?: number) => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw" | "thermalpad" | "thermalpadcenteroffsetx" | "thermalpadcenteroffsety">

  msop: (num_pins?: number) => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw" | "thermalpad" | "thermalpadcenteroffsetx" | "thermalpadcenteroffsety">

  sot23w: () => FootprinterParamsBuilder<"w" | "h" | "p" | "pl" | "pw">

  pushbutton: () => FootprinterParamsBuilder<"tllabel" | "trlabel" | "bllabel" | "brlabel">

  smdpushbutton: (num_pins?: number) => FootprinterParamsBuilder<"px" | "py" | "pw" | "ph">

  smdslideswitch: (num_pins?: number) => FootprinterParamsBuilder<"signalcols" | "missing" | "p" | "pw" | "pl" | "mounty" | "mpx" | "mpy" | "mpw" | "mpl" | "holex" | "holey" | "holed" | "noholes">

  fpc: (num_pins?: number) => FootprinterParamsBuilder<"p" | "pw" | "pl" | "staggered" | "reverse" | "py" | "toppl" | "bottompl" | "mpx" | "mpy" | "mounttop" | "mpw" | "mpl">

  stampboard: () => FootprinterParamsBuilder<"w" | "h" | "left" | "right" | "top" | "bottom" | "p" | "pw" | "pl" | "innerhole" | "innerholeedgedistance" | "silkscreenlabels" | "silkscreenlabelmargin">

  stampreceiver: () => FootprinterParamsBuilder<"w" | "h" | "left" | "right" | "top" | "bottom" | "p" | "pw" | "pl" | "innerhole" | "innerholeedgedistance">

  breakoutheaders: () => FootprinterParamsBuilder<"w" | "h" | "left" | "right" | "top" | "bottom" | "p" | "id" | "od">

  smtpad: () => FootprinterParamsBuilder<"circle" | "rect" | "square" | "pill" | "d" | "pd" | "diameter" | "r" | "pr" | "radius" | "w" | "pw" | "width" | "h" | "ph" | "height" | "s" | "size"> & {params: () => any; soup: () => AnySoupElement[]; circuitJson: () => AnyCircuitElement[]; }

  platedhole: () => FootprinterParamsBuilder<"d" | "hd" | "r" | "hr" | "pd" | "pr">

  smdpads: (num_pins?: number) => FootprinterParamsBuilder<"p" | "pw" | "ph" | "centerpadwidth">

  pad: () => FootprinterParamsBuilder<"w" | "h"> & {params: () => any; soup: () => AnySoupElement[]; circuitJson: () => AnyCircuitElement[]; }

  solderjumper: (num_pins?: number) => FootprinterParamsBuilder<"bridged" | "p" | "pw" | "ph">

  usbcmidmount: (num_pins?: number) => FootprinterParamsBuilder<"pinstart" | "split" | "reverse" | "noholes" | "rowy" | "ph" | "pw" | "powerpw" | "powerx" | "shellx" | "topy" | "bottomy" | "tophw" | "tophh" | "topring" | "bottomhw" | "bottomhh" | "bottomring" | "holex" | "holey" | "holed" | "bodybottom">

  params: () => any

  soup: () => AnySoupElement[]

  circuitJson: () => AnyCircuitElement[]

  json: () => AnyFootprinterDefinitionOutput[]

  getFootprintNames: () => string[]
