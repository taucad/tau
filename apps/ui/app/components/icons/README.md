# SVG Icons

SVG sprites are used to improve the user experience by packing all SVGs into a single statically
served file, reducing total bundle size and improving caching performance.

See:

- https://www.npmjs.com/package/vite-svg-sprite-wrapper
- https://benadam.me/thoughts/react-svg-sprites/

## Usage

`<SvgIcon>` is a component that renders the icon using
the SVG sprite, all svg props are passed through to the `<svg>` element.

For example, to render the `kcl` icon, use:

```tsx
<SvgIcon id="kcl" />
```

## Raw Icons

The `raw` directory contains the raw SVG icons. Simply add the SVG files to this directory and
they will be automatically picked up by the SVG sprite generator, with the filename being the icon
name used with `<SvgIcon id={iconName} />`. 

## Generated Icons

The `generated` directory contains the generated SVG icons using SVG sprites.
DO NOT EDIT THESE FILES DIRECTLY.

These files should be checked into source control.

## Notes

- The size of the `sprite.svg` file should be checked periodically to ensure it is not too large,
  ideally below 125kb. If it becomes larger than this, we should split the icons into multiple
  sprites.
