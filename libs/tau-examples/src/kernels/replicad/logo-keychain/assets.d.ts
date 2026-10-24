declare module '*.ttf?binary' {
  const font: Uint8Array<ArrayBuffer>;
  export default font;
}
