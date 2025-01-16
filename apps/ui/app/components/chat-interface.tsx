import { useState, useEffect, useRef } from "react"
import Markdown from 'react-markdown'
import { Mic, ChevronLeft, ChevronRight, RotateCcw, Eye, Code, Terminal, Send } from 'lucide-react'
import { Button } from "@/components/ui/button"
import Viewer from "./viewer"
import { MessageRole, MessageSchema, useChat } from "@/hooks/use-chat"
import { Avatar } from "./ui/avatar"
import { Taucad } from "./icons/taucad"
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
// import { dark } from 'react-syntax-highlighter/dist/esm/styles/prism/index.js'

function ChatMessage({ message }: { message: MessageSchema }) {
    return (
        <div className="flex flex-row items-start space-x-2">
            <Avatar className="w-8 h-8 bg-neutral-200 flex items-center justify-center" >{message.role === MessageRole.Assistant ? <Taucad /> : <img src="https://avatar.iran.liara.run/public/47" alt="User" />}</Avatar>
            <div className="m-1.5 text-sm prose">
                <Markdown
                    remarkPlugins={[remarkGfm]}
                    components={{
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
        <div className="flex h-[calc(100vh-48px)] bg-background">
            {/* Left Pane - Chat History */}
            <div className="w-full lg:w-[600px] border-r flex flex-col">
                <div className="flex-1 overflow-auto p-4 space-y-2 text-primary-foreground">
                    {messages.map((message, index) => (
                        <ChatMessage message={message} key={index} />
                    ))}
                    <div ref={chatEndReference} />
                </div>
                {/* Input Area */}
                <div className="p-4 border-t text-primary-foreground">
                    <div className="relative">
                        <textarea
                            className="bg-background w-full p-3 pr-12 rounded-lg border min-h-24"
                            rows={3}
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault(); // Prevents adding a new line
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
                        >
                            <Send className="w-4 h-4 rotate-45 -translate-x-0.5" />
                        </Button>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="absolute right-2 bottom-3"
                        >
                            <Mic className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Right Pane - Main Chat Area */}
            <div className="flex-1 flex-col hidden lg:flex">
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
            </div>
        </div>
    )
}

