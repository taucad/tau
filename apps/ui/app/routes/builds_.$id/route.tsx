import ChatInterface from '@/components/chat-interface';
import { ReplicadProvider } from '@/components/geometry/kernel/replicad/replicad-context';
import { useReplicadCode } from '@/components/geometry/kernel/replicad/use-replicad-code';
import { mockModels } from '@/components/mock-code';
import { ComboBoxResponsive } from '@/components/ui/combobox-responsive';
import { LoaderFunctionArgs } from '@remix-run/node';
import { Link, UIMatch, useLoaderData } from '@remix-run/react';
import { useEffect } from 'react';

export const handle = {
  breadcrumb: (match: UIMatch) => {
    const model = mockModels.find((model) => model.id === match.params.id);

    if (!model) {
      return 'Not Found';
    }

    return (
      <ComboBoxResponsive
        groupedItems={[
          {
            name: 'Builds',
            items: mockModels.map((model) => ({ label: model.name, id: model.id })),
          },
        ]}
        renderLabel={(item) => <Link to={`/builds/${item.id}`}>{item.label}</Link>}
        className="border-none w-auto p-2 h-auto"
        renderButtonContents={(item) => item.label}
        getValue={(item) => item.id}
        defaultValue={{ label: model.name, id: model.id }}
        searchPlaceHolder="Search builds..."
        labelAsChild
      />
    );
  },
};

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const model = mockModels.find((model) => model.id === params.id);

  if (!model) {
    throw new Response('Not Found', { status: 404 });
  }

  return {
    model,
  };
};

export const Chat = () => {
  const { model } = useLoaderData<typeof loader>();
  const { setCode } = useReplicadCode();

  useEffect(() => {
    setCode(model.code);
    console.log('setting code');
  }, [model.code]);

  return <ChatInterface />;
};

export default function ChatRoute() {
  return (
    <ReplicadProvider>
      <Chat />
    </ReplicadProvider>
  );
}
