type ComposeProperties = {
  readonly components: Array<React.JSXElementConstructor<React.PropsWithChildren>>;
  readonly children: React.ReactNode;
};

export function Compose(props: ComposeProperties): React.ReactNode {
  const { components = [], children } = props;

  // oxlint-disable-next-line unicorn/no-array-reduce -- we want to compose the components from right to left.
  return components.reduceRight((accumulator, Component) => {
    return <Component>{accumulator}</Component>;
  }, children);
}
