/**
 * The app's binding of the project library service (`@taucad/files-ui/runtime/project-library`).
 *
 * The service and its commands live in files-ui; what only the app can supply is bound here: the object-store worker
 * (`new URL(…, import.meta.url)`), the runtime fault and worker-failure reporters, the build-skew write stop, the chat
 * file store, the legacy listing, the project templates and kernel lock files (`?raw`), the initial user message, Tau
 * Cloud's backup intent and the chat projection's catch-up. Each service reads its module when it is called, so a
 * suite that mocks one of those modules reaches the library through it.
 */
import { wrap } from 'comlink';
import type { Remote } from 'comlink';
import { ProjectLibrary as ProjectLibraryService } from '@taucad/files-ui/runtime/project-library';
import type {
  ProjectLibraryOptions as ProjectLibraryServiceOptions,
  ProjectLibraryServices,
} from '@taucad/files-ui/runtime/project-library';
import { createObjectStoreWorker } from '#hooks/object-store-worker.js';
import type { ObjectStoreWorker } from '#hooks/object-store.worker.js';
import { isBuildSuperseded, subscribeBuildSkew } from '#filesystem/build-skew.js';
import { createChatFileStore } from '#db/chat-file-storage.js';
import { clearLegacyProjectListing } from '@taucad/files-ui/lib/legacy-project-listing.lib';
import { reportAppRuntimeFault } from '#runtime/app-runtime-faults.js';
import { reportProjectLibraryWorkerFailed } from '#lib/file-service-reports.js';
import { createEntrylessProject, createInitialProject } from '#constants/project.constants.js';
import { getKernelDependencies, getKernelOption, getKernelProjectTemplate } from '#utils/kernel.utils.js';
import { buildUserMessage } from '#utils/chat.utils.js';
import { tauCloudIntent } from '#lib/tau-cloud-intent.js';
import { selectCaughtUp } from '#machines/chat-projection.logic.js';
import type { ChatProjection } from '#machines/chat-projection.logic.js';
import type { ProjectLibraryFacade } from '#runtime/file-manager-facade.js';

/** The app's services, bound to its modules. */
const projectLibraryServices: ProjectLibraryServices<
  Remote<ObjectStoreWorker>,
  ProjectLibraryFacade,
  ChatProjection
> = {
  startObjectStore() {
    const worker = createObjectStoreWorker();
    return { worker, wrappedWorker: wrap<ObjectStoreWorker>(worker) };
  },
  reportFault: (error) => {
    reportAppRuntimeFault(error);
  },
  reportWorkerFailed: (error) => {
    reportProjectLibraryWorkerFailed(error);
  },
  buildSkew: {
    isSuperseded: () => isBuildSuperseded(),
    subscribe: (listener) => subscribeBuildSkew(listener),
  },
  createChatStore: (options) => createChatFileStore(options),
  clearLegacyListing: () => {
    clearLegacyProjectListing();
  },
  projectTemplates: {
    createEntrylessProject: (projectName) => createEntrylessProject(projectName),
    createInitialProject: (options) => createInitialProject(options),
    getKernelOption: (kernel) => getKernelOption(kernel),
    getKernelDependencies: async (kernel) => getKernelDependencies(kernel),
    getKernelProjectTemplate: async (kernel) => getKernelProjectTemplate(kernel),
  },
  buildUserMessage: (input) => buildUserMessage(input),
  cloudIntent: {
    set: (projectId, intent) => {
      tauCloudIntent.set(projectId, intent);
    },
  },
  isCaughtUp: (projection) => selectCaughtUp(projection),
};

/** What the runtime builds the library with. @public */
export type ProjectLibraryOptions = Omit<
  ProjectLibraryServiceOptions<Remote<ObjectStoreWorker>, ProjectLibraryFacade, ChatProjection>,
  'services'
>;

/**
 * The project library over the app's object-store worker, root file facade and chat projections.
 *
 * @public
 */
export class ProjectLibrary extends ProjectLibraryService<
  Remote<ObjectStoreWorker>,
  ProjectLibraryFacade,
  ChatProjection
> {
  public constructor(options: ProjectLibraryOptions) {
    super({ ...options, services: projectLibraryServices });
  }
}
