/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */,
/* 1 */
/***/ ((module) => {

module.exports = require("@nestjs/common");

/***/ }),
/* 2 */
/***/ ((module) => {

module.exports = require("@nestjs/core");

/***/ }),
/* 3 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const chat_module_1 = __webpack_require__(6);
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [chat_module_1.ChatModule, config_1.ConfigModule.forRoot()],
        controllers: [],
        providers: [],
    })
], AppModule);


/***/ }),
/* 4 */
/***/ ((module) => {

module.exports = require("tslib");

/***/ }),
/* 5 */
/***/ ((module) => {

module.exports = require("@nestjs/config");

/***/ }),
/* 6 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChatModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const chat_controller_1 = __webpack_require__(7);
let ChatModule = class ChatModule {
};
exports.ChatModule = ChatModule;
exports.ChatModule = ChatModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [],
        controllers: [chat_controller_1.ChatController],
        providers: [],
    })
], ChatModule);


/***/ }),
/* 7 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChatController = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const rxjs_1 = __webpack_require__(8);
const searxng_search_1 = __webpack_require__(9);
const openai_1 = __webpack_require__(10);
const prebuilt_1 = __webpack_require__(11);
const langgraph_1 = __webpack_require__(12);
var ChatNode;
(function (ChatNode) {
    ChatNode[ChatNode["Start"] = langgraph_1.START] = "Start";
    ChatNode[ChatNode["End"] = langgraph_1.END] = "End";
    ChatNode["Agent"] = "agent";
    ChatNode["Tools"] = "tools";
})(ChatNode || (ChatNode = {}));
var ChatEvent;
(function (ChatEvent) {
    ChatEvent["OnChatModelStart"] = "on_chat_model_start";
    ChatEvent["OnChatModelEnd"] = "on_chat_model_end";
    ChatEvent["OnChatModelStream"] = "on_chat_model_stream";
})(ChatEvent || (ChatEvent = {}));
const STREAMED_EVENTS = [ChatEvent.OnChatModelStream, ChatEvent.OnChatModelEnd, ChatEvent.OnChatModelStart];
let ChatController = class ChatController {
    async getData(body) {
        console.log(body);
        // Define the tools for the agent to use
        const tools = [
            // new TavilySearchResults({ maxResults: 3 }),
            new searxng_search_1.SearxngSearch({
                params: {
                    format: "json", // Do not change this, format other than "json" is will throw error
                    engines: "google",
                },
                apiBase: "http://localhost:42114",
                // Custom Headers to support rapidAPI authentication Or any instance that requires custom headers
                headers: {},
            }),
        ];
        const toolNode = new prebuilt_1.ToolNode(tools);
        // Create a model and give it access to the tools
        // const model = new ChatOllama({
        //   model: "llama3.2:latest",
        //   temperature: 0,
        // }).bindTools(tools);
        // const model = new ChatOllama({
        //   model: "llama3.2:latest",
        //   temperature: 0,
        // }).bindTools(tools,{tools});
        const model = new openai_1.ChatOpenAI({
            model: "gpt-4o-mini",
            temperature: 0,
        }).bindTools(tools);
        // Define the function that determines whether to continue or not
        function shouldContinue({ messages }) {
            const lastMessage = messages.at(-1);
            // If the LLM makes a tool call, then we route to the ChatNode.Tools node
            if (lastMessage.additional_kwargs.tool_calls) {
                return ChatNode.Tools;
            }
            // Otherwise, we stop (reply to the user) using the special "__end__" node
            return ChatNode.End;
        }
        // Define the function that calls the model
        async function callModel(state) {
            const response = await model.invoke(state.messages);
            // We return a list, because this will get added to the existing list
            return { messages: [response] };
        }
        // Define a new graph
        const workflow = new langgraph_1.StateGraph(langgraph_1.MessagesAnnotation)
            .addNode(ChatNode.Agent, callModel)
            .addEdge(ChatNode.Start, ChatNode.Agent)
            .addNode(ChatNode.Tools, toolNode)
            .addEdge(ChatNode.Tools, ChatNode.Agent)
            .addConditionalEdges(ChatNode.Agent, shouldContinue);
        // Finally, we compile it into a LangChain Runnable.
        const graph = workflow.compile();
        const inputs = {
            messages: body.messages,
        };
        const eventStream = graph.streamEvents(inputs, {
            streamMode: 'values',
            version: 'v2',
        });
        return new rxjs_1.Observable(observer => {
            (async () => {
                for await (const event of eventStream) {
                    switch (event.event) {
                        case ChatEvent.OnChatModelStream: {
                            observer.next({ data: { status: event.event, timestamp: Date.now(), content: event.data.chunk.content } });
                            break;
                        }
                        case ChatEvent.OnChatModelStart: {
                            common_1.Logger.log("Starting chat model");
                            common_1.Logger.log(event);
                            observer.next({ data: { status: event.event, timestamp: Date.now() } });
                            break;
                        }
                        case ChatEvent.OnChatModelEnd: {
                            observer.next({ data: { status: event.event, timestamp: Date.now() } });
                            break;
                        }
                        default: {
                            common_1.Logger.log(event.event);
                        }
                    }
                }
                observer.complete();
            })().catch(error => observer.error(error));
        });
    }
};
exports.ChatController = ChatController;
tslib_1.__decorate([
    (0, common_1.Post)(),
    (0, common_1.Sse)('sse'),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", typeof (_a = typeof Promise !== "undefined" && Promise) === "function" ? _a : Object)
], ChatController.prototype, "getData", null);
exports.ChatController = ChatController = tslib_1.__decorate([
    (0, common_1.Controller)('chat')
], ChatController);


/***/ }),
/* 8 */
/***/ ((module) => {

module.exports = require("rxjs");

/***/ }),
/* 9 */
/***/ ((module) => {

module.exports = require("@langchain/community/tools/searxng_search");

/***/ }),
/* 10 */
/***/ ((module) => {

module.exports = require("@langchain/openai");

/***/ }),
/* 11 */
/***/ ((module) => {

module.exports = require("@langchain/langgraph/prebuilt");

/***/ }),
/* 12 */
/***/ ((module) => {

module.exports = require("@langchain/langgraph");

/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
var exports = __webpack_exports__;

/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
const common_1 = __webpack_require__(1);
const core_1 = __webpack_require__(2);
const app_module_1 = __webpack_require__(3);
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const globalPrefix = 'v1';
    app.setGlobalPrefix(globalPrefix);
    app.enableCors();
    console.log(process.env);
    const port = process.env.PORT || 3000;
    await app.listen(port);
    common_1.Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`);
}
// eslint-disable-next-line unicorn/prefer-top-level-await
bootstrap();

})();

/******/ })()
;