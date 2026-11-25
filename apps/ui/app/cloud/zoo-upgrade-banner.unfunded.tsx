/** Self-hosted Zoo uses the operator's provider configuration and has no Tau upgrade path. */
export function ZooUpgradeBanner(_props: {
  readonly message: string | undefined;
  readonly onRetry: () => void;
}): React.JSX.Element | undefined {
  return undefined;
}
