import { TavilySearchResults } from "@langchain/community/dist/tools/tavily_search";
import { CompiledStateGraph, END, START, StateGraph } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { Injectable, Logger } from "@nestjs/common";
import { Observable } from "rxjs";
import { z } from "zod";

const CreateChatInputSchema = z.object({
    prompt: z.string(),
    messages: z.array(z.string()),
});

const CreateChatOutputSchema = z.object({
    timestamp: z.number(),
    content: z.string(),
});

enum ChatNode {
    Agent = "agent",
    Tools = "tools",
}

enum ChatEvent {
    OnChatModelStream = "on_chat_model_stream",
}

export type CreateChatInput = z.infer<typeof CreateChatInputSchema>;
export type CreateChatOutput = z.infer<typeof CreateChatOutputSchema>;

@Injectable()
export class CreateChatUsecase {
    private readonly graph: CompiledStateGraph<typeof MessagesAnnotation, typeof MessagesAnnotation.State>;
    constructor() {
        // Define the tools for the agent to use
        const tools = [new TavilySearchResults({ maxResults: 3 })];
        const toolNode = new ToolNode(tools);

        // Create a model and give it access to the tools
        const model = new ChatOpenAI({
            model: "gpt-4o-mini",
            temperature: 0,
        }).bindTools(tools);

        // Define the function that determines whether to continue or not
        function shouldContinue({ messages }: typeof MessagesAnnotation.State) {
            const lastMessage = messages.at(-1);

            // If the LLM makes a tool call, then we route to the "tools" node
            if (lastMessage.additional_kwargs.tool_calls) {
                return ChatNode.Tools;
            }
            // Otherwise, we stop (reply to the user) using the special "__end__" node
            return END;
        }

        // Define the function that calls the model
        async function callModel(state: typeof MessagesAnnotation.State) {
            const response = await model.invoke(state.messages);

            // We return a list, because this will get added to the existing list
            return { messages: [response] };
        }

        // Define a new graph
        const workflow = new StateGraph(MessagesAnnotation)
            .addNode(ChatNode.Agent, callModel)
            .addEdge(START, ChatNode.Agent)
            .addNode(ChatNode.Tools, toolNode)
            .addEdge(ChatNode.Tools, ChatNode.Agent)
            .addConditionalEdges(ChatNode.Agent, shouldContinue);

        // Finally, we compile it into a LangChain Runnable.
        const graph = workflow.compile();
        this.graph = graph as any;
     }

    async execute(input: CreateChatInput): Promise<Observable<{ data: { timestamp: number, content: string } }>> {
        const inputs = {
            messages: [...input.messages, new HumanMessage(input.prompt)],
        };

        const eventStream = this.graph.streamEvents(inputs, {
            streamMode: 'values',
            version: 'v2',
        });

        return new Observable(observer => {
            (async () => {
                for await (const event of eventStream) {
                    if (event.event === ChatEvent.OnChatModelStream) {
                        observer.next({ data: { timestamp: Date.now(), content: event.data.chunk.content } });
                    } else {
                        Logger.log(event.event);
                    }
                }
                observer.complete();
            })().catch(error => observer.error(error));
        });
    }
}
