---
host: patch
---

Camera stills no longer hand the access code to ffmpeg: the loopback proxy answers the camera's Basic or MD5 Digest challenge itself (a refused login rejects `MACHINE_STILL_AUTH_REJECTED`), a capture retries a refused, reset or frameless attempt within its connect timeout, and `findFfmpeg` also looks in MacPorts and, on Windows, in WinGet, Chocolatey and Scoop.
