import { ChatInterface } from '@/routes/builds_.$id/chat-interface';
import { ReplicadProvider, useReplicad } from '@/components/geometry/kernel/replicad/replicad-context';
import { mockModels } from '@/components/mock-code';
import { ComboBoxResponsive } from '@/components/ui/combobox-responsive';
import { LoaderFunctionArgs } from '@remix-run/node';
import { Link, UIMatch, useParams } from '@remix-run/react';
import { useEffect } from 'react';
import { useBuild } from '@/hooks/use-build';
import { useChat } from '@/contexts/use-chat';
import { MessageStatus } from '@/types/chat';

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
  if (!params.id) {
    throw new Response('Not Found', { status: 404 });
  }

  // Only try to get the model from mockModels on the server
  const model = mockModels.find((model) => model.id === params.id);

  // Return null if no model found - client will handle localStorage data
  return {
    model,
  };
};

const Chat = () => {
  const { id } = useParams();
  const { build, model, isLoading } = useBuild(id!);
  const { setCode } = useReplicad();
  const { sendMessage } = useChat();

  // Handle code setup
  useEffect(() => {
    if (model) {
      setCode(model.code);
    } else if (build) {
      const mainFile = build.assets.mechanical?.files[build.assets.mechanical?.main ?? ''];
      if (mainFile) {
        setCode(mainFile.content);
      } else {
        setCode(mockModels[0].code);
      }
    }
  }, [model, build, setCode]);

  // Handle initial pending message
  useEffect(() => {
    if (!build || isLoading) return;

    const lastMessage = build.messages.at(-1);
    if (!lastMessage) return;

    if (lastMessage.status === MessageStatus.Pending) {
      console.log('sending message');
      sendMessage({
        message: lastMessage,
        model: lastMessage.model,
      });
    }
  }, [build?.id]); // Only run when build ID changes

  return <ChatInterface />;
};

export default function ChatRoute() {
  return (
    <ReplicadProvider>
      <Chat />
    </ReplicadProvider>
  );
}
