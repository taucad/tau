---
workbench-panes: minor
---

`FileBrowser` can choose a folder. With `shouldShowDirectoriesOnly`, it lists folders only, a folder row still opens the folder, and a first `Select <folder>` row chooses the folder shown, so a folder is picked by browsing to it as a file is. `rootLabel` names the root in the breadcrumbs and on that row (`Files` by default). A folder found by a search shows its parent folder beside its name, as a file does.

`createStaticDataSource` takes `{ shouldIncludeDirectories: true }` to let a search find folders by name as well as files.
