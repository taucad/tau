# Compatibility

| Host                            | Supported | CI evidence                         |
| ------------------------------- | --------- | ----------------------------------- |
| Node @@CREATE_REPO_node-floor@@ | ✅        | `node (@@CREATE_REPO_node-floor@@)` |
| Latest Node                     | ✅        | `node (latest)`                     |
| Chromium                        | ✅        | `browser (chromium)`                |
| Firefox                         | ✅        | `browser (firefox)`                 |
| WebKit                          | ✅        | `browser (webkit)`                  |
| Linux x64                       | ✅        | `native (ubuntu-latest)`            |
| macOS arm64                     | ✅        | `native (macos-latest)`             |
| Windows x64                     | ✅        | `native (windows-latest)`           |

Remove rows that are not bound host legs. Never leave an unsupported check
mark or a check mark without an exact CI job.
