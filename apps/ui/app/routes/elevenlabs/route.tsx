import { useLoaderData } from 'react-router';

export function loader({ request }: Route.LoaderArgs) {
  return {
    test: 'Something',
  };
}

export default function SettingsPage(): React.JSX.Element {
  const loaderData = useLoaderData<typeof loader>();

  return <div className="mx-auto size-full max-w-4xl flex-1 max-md:px-2">{loaderData.test}</div>;
}
