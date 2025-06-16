import { Eye, Code, Terminal } from 'lucide-react';
import type { JSX } from 'react';
import { ChatConsole } from '~/routes/builds_.$id/chat-console.js';
import { ChatViewer } from '~/routes/builds_.$id/chat-viewer.js';
import { useCookie } from '~/hooks/use-cookie.js';
import type { KeyCombination } from '~/utils/keys.js';
import { cn } from '~/utils/ui.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs.js';
import { ChatEditorLayout } from '~/routes/builds_.$id/chat-editor-layout.js';

const chatTabCookieName = 'chat-tab';
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
    label: 'Code',
    keyCombination: openCodeKeyCombination,
  },
  {
    value: 'console',
    icon: Terminal,
    label: 'Console',
    keyCombination: openConsoleKeyCombination,
  },
] as const;

export function ChatViewTabs(): JSX.Element {
  const [chatTab, setChatTab] = useCookie<ChatTabs>(chatTabCookieName, 'preview');
  return (
    <Tabs
      defaultValue={chatTab}
      className={cn('size-full flex-1 gap-0')}
      onValueChange={(value) => {
        setChatTab(value as ChatTabs);
      }}
    >
      <div className={cn('absolute top-0 left-0 z-10 mt-2 ml-2')}>
        <TabsList defaultValue="editor" className="rounded-md border">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="px-1.5 md:px-2">
              <tab.icon />
              <span className="hidden md:block">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent withAnimation={false} value="preview" className="mt-0 flex size-full flex-1">
        <ChatViewer />
      </TabsContent>
      {/* subtract 6rem for the chat history and chat input as they don't take the full height */}
      <TabsContent withAnimation={false} value="editor" className="mt-0 flex h-[calc(100vh-6rem)] w-full flex-1">
        <ChatEditorLayout className="mt-[3rem] border-t" />
      </TabsContent>
      <TabsContent withAnimation={false} value="console" className="mt-0 flex h-[calc(100vh-6rem)] w-full flex-1">
        <ChatConsole data-view="tabs" className="mt-[3rem]" />
      </TabsContent>
    </Tabs>
  );
}
