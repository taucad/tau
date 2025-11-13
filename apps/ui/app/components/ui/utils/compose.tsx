type ComposeProperties = {
  readonly components: Array<React.JSXElementConstructor<React.PropsWithChildren>>;
  readonly children: React.ReactNode;
};

export function Compose(props: ComposeProperties): React.ReactNode {
  const { components = [], children } = props;

  // eslint-disable-next-line unicorn/no-array-reduce -- we want to compose the components from right to left.
  return components.reduceRight((acc, Component) => {
    return <Component>{acc}</Component>;
  }, children);
}
