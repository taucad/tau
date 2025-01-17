import { useState, useEffect, useRef } from "react"
import Markdown from 'react-markdown'
import { Mic, ChevronLeft, ChevronRight, RotateCcw, Eye, Code, Terminal, ArrowRight } from 'lucide-react'
import { Button } from "@/components/ui/button"
import Viewer from "./viewer"
import { MessageRole, MessageSchema, useChat } from "@/hooks/use-chat"
import { Avatar } from "./ui/avatar"
import { Taucad } from "./icons/taucad"
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Textarea } from "@/components/ui/textarea"
// import { dark } from 'react-syntax-highlighter/dist/esm/styles/prism/index.js'

function ChatMessage({ message }: { message: MessageSchema }) {
    return (
        <div className="flex flex-row items-start space-x-2">
            <Avatar className="w-8 h-8 bg-neutral-200 flex items-center justify-center" >{message.role === MessageRole.Assistant ? <Taucad /> : <img src="https://avatar.iran.liara.run/public/47" alt="User" />}</Avatar>
            <div className="m-1.5 text-sm prose">
                <Markdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        a: (properties) => {
                            const { children, ...rest } = properties
                            return <a {...rest} target="_blank" rel="noopener noreferrer">{children}</a>
                        },
                        code: (properties) => {
                            const { children, className, node, ref, style, ...rest } = properties
                            const match = /language-(\w+)/.exec(className || '')
                            return match ? (
                                <div className="not-prose">
                                    <SyntaxHighlighter
                                        {...rest}
                                        ref={ref as React.Ref<SyntaxHighlighter>}
                                        style={style as {
                                            [key: string]: React.CSSProperties;
                                        }}
                                        PreTag="div"
                                        children={String(children).replace(/\n$/, '')}
                                        language={match[1]}
                                    />
                                </div>
                            ) : (
                                <code {...rest} className={className}>
                                    {children}
                                </code>
                            )
                        },
                    }}
                >
                    {message.content}
                </Markdown>
            </div>
        </div>
    )
}

export default function ChatInterface() {
    const [inputText, setInputText] = useState("")
    const { sendMessage, status, messages } = useChat();
    const chatEndReference = useRef<HTMLDivElement | null>(null);

    const onSubmit = async () => {
        setInputText('');
        await sendMessage({
            content: inputText,
            role: MessageRole.User,
        });
    }

    useEffect(() => {
        chatEndReference.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        <ResizablePanelGroup direction="horizontal" className="flex h-[calc(100vh-48px)] bg-background">
            {/* Left Pane - Chat History */}
            <ResizablePanel minSize={30} maxSize={50} defaultSize={40} className="flex flex-col">
                <ResizablePanelGroup direction="vertical">
                    <ResizablePanel defaultSize={85} style={{ overflowY: 'auto' }} className="flex-1 p-4 space-y-4 text-primary-foreground">
                        {messages.map((message, index) => (
                            <ChatMessage message={message} key={index} />
                        ))}
                        <div ref={chatEndReference} />
                    </ResizablePanel>
                    <ResizableHandle />
                    {/* Input Area */}
                    <ResizablePanel minSize={15} maxSize={50} defaultSize={15} className="p-4 text-primary-foreground">
                        <div className="relative h-full">
                            <Textarea
                                className="bg-background w-full p-3 pr-12 rounded-lg border h-full resize-none"
                                rows={3}
                                value={inputText}
                                onChange={(event) => setInputText(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' && !event.shiftKey) {
                                        event.preventDefault(); // Prevents adding a new line
                                        onSubmit();
                                    }
                                }}
                                placeholder="Type your message..."
                            />
                            <Button
                                size="icon"
                                variant="ghost"
                                className="absolute right-2 top-2"
                                onClick={() => {
                                    onSubmit();
                                }}
                                disabled={inputText.length === 0}
                            >
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="absolute right-2 bottom-3"
                            >
                                <Mic className="w-4 h-4" />
                            </Button>
                        </div>
                    </ResizablePanel>
                </ResizablePanelGroup>
            </ResizablePanel>
            <ResizableHandle className="hidden lg:flex" />

            {/* Right Pane - Main Chat Area */}
            <ResizablePanel defaultSize={60} className="flex-1 flex-col hidden lg:flex">
                {/* Header */}
                <div className="border-b p-3 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <ChevronLeft className="w-4 h-4" />
                        <ChevronRight className="w-4 h-4" />
                        <RotateCcw className="w-4 h-4" />
                    </div>
                    <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="sm">
                            <Eye className="w-4 h-4 mr-2" />
                            Preview
                        </Button>
                        <Button variant="ghost" size="sm">
                            <Code className="w-4 h-4 mr-2" />
                            Code
                        </Button>
                        <Button variant="ghost" size="sm">
                            <Terminal className="w-4 h-4 mr-2" />
                            Console
                        </Button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 p-4 overflow-auto">
                    <Viewer />
                </div>
            </ResizablePanel>
        </ResizablePanelGroup>
    )
}

