import { useCookie } from '@/utils/cookies';
import { KeyCombination } from '@/utils/keys';
import { cn } from '@/utils/ui';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Eye, Code, Terminal } from 'lucide-react';
import { ChatConsole } from './chat-console';
import { ChatEditor } from './chat-editor';
import { ChatViewer } from './chat-viewer';

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
      className={cn('h-full w-full flex-1', chatTab === 'editor' && 'dark:bg-[rgb(30,_30,_30)]')}
      onValueChange={(value) => {
        // Permissible as Tabs doesn't preserve the type
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        setChatTab(value as ChatTabs);
      }}
    >
      <TabsList
        defaultValue="editor"
        className={cn(
          '[&>*]:data-[state=active]:bg-accent [&>*]:border-[1px] [&>*]:border-border [&>*]:hover:bg-accent/70 bg-transparent ml-2 mr-auto w-full flex justify-start my-1.5 gap-2 z-30 p-0',
          !isChatOpen && 'ml-13 md:ml-12',
          chatTab === 'preview' && 'absolute top-0 left-0 ',
        )}
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className={'gap-2 border-[1px] md:border-none size-8 md:h-8 md:w-auto px-1 md:px-3'}
          >
            <tab.icon className="size-4" />
            <span className="hidden md:block">{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="preview" className="h-full mt-0 flex flex-1 w-full">
        <ChatViewer />
      </TabsContent>
      {/* subtract 6rem for the chat history and chat input as they don't take the full height */}
      <TabsContent value="editor" className="h-[calc(100vh-6rem)] mt-0 flex flex-1 w-full">
        <ChatEditor />
      </TabsContent>
      <TabsContent value="console" className="h-[calc(100vh-6rem)] mt-0 flex flex-1 w-full">
        <ChatConsole data-view="tabs" className="pt-0" />
      </TabsContent>
    </Tabs>
  );
};
