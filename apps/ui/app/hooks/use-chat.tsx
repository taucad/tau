import { useState } from "react";
import { useEventSource } from "./use-event-source";

export type ChatInterfaceProperties = {
    chatId: string
}

type MessageEventSchema = {
    timestamp: number
    content: string
    status: ChatEvent
}

export enum MessageRole {
    User = "user",
    Assistant = "assistant",
}

export type MessageSchema = {
    role: MessageRole
    content: string
}

export enum ChatEvent {
    OnChatModelStart = "on_chat_model_start",
    OnChatModelEnd = "on_chat_model_end",
    OnChatModelStream = "on_chat_model_stream",
}

export const useChat = () => {
    const [messages, setMessages] = useState<MessageSchema[]>([]);
    // const [currentMessage, setCurrentMessage] = useState<string>("");
    const [currentTool, setCurrentTool] = useState<string | undefined>();
    const [status, setStatus] = useState<ChatEvent | undefined>();

    const { stream } = useEventSource<MessageEventSchema, {messages: MessageSchema[]}>({
        url: 'http://localhost:4000/v1/chat',
        onStreamEvent: (event) => {
            setStatus(event.status);
            if (event.status === ChatEvent.OnChatModelStream) {
                // setCurrentMessage((prev) => prev + event.content);
                setMessages((previous) => {
                    const currentMessage = previous.at(-1);

                    if (!currentMessage) {
                        return previous;
                    }

                    return [...previous.slice(0, -1), {
                        role: currentMessage.role,
                        content: currentMessage.content + event.content,
                    }];
                });
            } else if (event.status === ChatEvent.OnChatModelStart) {
                console.log({event});
                setMessages((previous) => [...previous, {
                    role: MessageRole.Assistant,
                    content: '',
                }]);
            }
        },
    });

    const sendMessage = async (message: MessageSchema) => {
        setMessages((messages) => [...messages, message]);
        await stream({messages: [...messages, message]});
    }

    return {
        status,
        messages,
        // currentMessage,
        sendMessage,
    };
}
