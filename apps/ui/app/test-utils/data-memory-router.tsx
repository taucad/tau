import { createContext, useContext, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { createBrowserRouter, createMemoryRouter, RouterProvider } from 'react-router';

const TreeContext = createContext<ReactNode>(undefined);

/** The one route's element: the latest tree, so a test's `rerender` reaches it through React Router's memoised routes. */
const Tree = (): ReactNode => useContext(TreeContext);

/**
 * `MemoryRouter` as a data router: the app mounts its routes under one, and `useNavigation` throws outside it. The tree
 * renders as one splat route, so its own `<Routes>` still match the location below it.
 *
 * @param props - The initial history and the tree.
 * @param props.initialEntries - The history the router starts with.
 * @param props.children - The tree to render inside the router.
 * @returns The router.
 */
export function DataMemoryRouter({
  initialEntries,
  children,
}: {
  readonly initialEntries: string[];
  readonly children: ReactNode;
}): ReactElement {
  const [router] = useState(() => createMemoryRouter([{ path: '*', Component: Tree }], { initialEntries }));
  return (
    <TreeContext.Provider value={children}>
      <RouterProvider router={router} />
    </TreeContext.Provider>
  );
}

/**
 * A browser data router, as the app's: the address bar shows the router's location, which the route's canonical URL
 * correction checks before it writes (ProjectFocus I2). It starts at `initialEntry` in this document's history.
 *
 * @param props - The initial entry and the tree.
 * @param props.initialEntry - The URL the router starts at.
 * @param props.children - The tree to render inside the router.
 * @returns The router.
 */
export function DataBrowserRouter({
  initialEntry,
  children,
}: {
  readonly initialEntry: string;
  readonly children: ReactNode;
}): ReactElement {
  const [router] = useState(() => {
    globalThis.history.replaceState(null, '', initialEntry);
    return createBrowserRouter([{ path: '*', Component: Tree }]);
  });
  return (
    <TreeContext.Provider value={children}>
      <RouterProvider router={router} />
    </TreeContext.Provider>
  );
}
