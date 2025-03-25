import { useCookie } from '@/utils/cookies';
import { KeyCombination } from '@/utils/keys';
import { cn } from '@/utils/ui';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Eye, Code, Terminal } from 'lucide-react';
import { ChatConsole } from './chat-console';
import { ChatEditor } from './chat-editor';
import { ChatViewer } from './chat-viewer';
import { buttonVariants } from '@/components/ui/button';

const CHAT_TAB_COOKIE_NAME = 'tau-chat-tab';
type ChatTabs = (typeof tabs)[number]['value'];

const openPreviewKeyCombination = {
  key: 'p',
  ctrlKey: true,
  shiftKey: true,
  requireAllModifiers: true,
} satisfies KeyCombination;

const openCodeKeyCombination = {
  key: 'c',
  ctrlKey: true,
  shiftKey: true,
  requireAllModifiers: true,
} satisfies KeyCombination;

const openConsoleKeyCombination = {
  key: 't',
  ctrlKey: true,
  shiftKey: true,
  requireAllModifiers: true,
} satisfies KeyCombination;
const tabs = [
  {
    value: 'preview',
    icon: Eye,
    label: 'Preview',
    keyCombination: openPreviewKeyCombination,
  },
  {
    value: 'editor',
    icon: Code,
    label: 'Editor',
    keyCombination: openCodeKeyCombination,
  },
  {
    value: 'console',
    icon: Terminal,
    label: 'Console',
    keyCombination: openConsoleKeyCombination,
  },
] as const;

export const ChatViewTabs = ({ isChatOpen }: { isChatOpen: boolean }) => {
  const [chatTab, setChatTab] = useCookie<ChatTabs>(CHAT_TAB_COOKIE_NAME, 'preview');
  return (
    <Tabs
      defaultValue={chatTab}
      className={cn('h-full w-full flex-1 gap-0')}
      onValueChange={(value) => {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Tabs doesn't preserve the type
        setChatTab(value as ChatTabs);
      }}
    >
      <TabsList
        defaultValue="editor"
        className={cn(
          'z-10 my-1.5 ml-2 gap-2 bg-transparent p-0',
          'absolute top-0 left-0',
          !isChatOpen && 'ml-13 md:ml-12',
        )}
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className={buttonVariants({
              variant: 'outline',
              size: 'sm',
              className:
                'border-px w-8 gap-2.5 text-sm data-[state=active]:bg-accent data-[state=active]:shadow-xs md:w-auto',
            })}
          >
            <tab.icon className="size-4" />
            <span className="hidden md:block">{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="preview" className="mt-0 flex h-full w-full flex-1">
        <ChatViewer />
      </TabsContent>
      {/* subtract 6rem for the chat history and chat input as they don't take the full height */}
      <TabsContent value="editor" className="mt-0 flex h-[calc(100vh-6rem)] w-full flex-1">
        <ChatEditor className="mt-[3rem]" />
      </TabsContent>
      <TabsContent value="console" className="mt-0 flex h-[calc(100vh-6rem)] w-full flex-1">
        <ChatConsole data-view="tabs" className="mt-[3rem]" />
      </TabsContent>
    </Tabs>
  );
};
