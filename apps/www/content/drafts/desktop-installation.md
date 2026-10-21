# Install and update Tau Desktop

Draft for the qualified installer rollout. This document is excluded from deployment. Existing public downloads remain ZIP/tar archives until CI qualification, separate VM acceptance and explicit release promotion are complete. Before publishing this guide, replace the trusted public key, fingerprint and release identity placeholders below with independently verified values from the promoted release; do not substitute a key received only beside an unverified download.

## Choose the installation route

| Computer                           | Primary route                             | Update owner                                               |
| ---------------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| Apple silicon Mac                  | ARM64 DMG                                 | Tau downloads the existing ZIP update transport            |
| Intel Mac                          | x64 DMG                                   | Tau downloads the existing ZIP update transport            |
| Windows x64                        | Per-user EXE installer                    | Tau downloads the signed installer; you choose Restart now |
| Supported Debian/Ubuntu x64 system | Signed APT repository and `.deb` packages | APT and the administrator's unattended-upgrades policy     |
| Supported Linux x64 portable use   | AppImage in a writable local folder       | Tau verifies a signed descriptor; you choose Restart now   |

Use the architecture named on the download. These routes do not introduce Windows or Linux ARM builds. Retained ZIP/tar archives remain available for manual and managed installations. An archive installation does not silently become an installer installation.

## macOS

Open the DMG, drag Tau into Applications, eject the disk image, and launch Tau from Applications. Choose Apple silicon or Intel explicitly. The ZIP remains an alternative: extract it and move Tau into Applications before launching.

Existing Mac installations keep their current update flow. Updates download in the background; Restart now saves your work first. A downloaded Mac update can also install when you quit normally. Moving to a DMG does not move your projects or change your profile.

## Windows

Run the signed installer for your own account. Check the publisher shown by Windows against the identity on the promoted Tau download page. Do not run an installer whose signature, publisher or product identity differs from that release.

If you currently run Tau from a ZIP, save and quit that copy, install Tau, and launch the installed copy from its shortcut. This is a one-time manual migration. Keep your projects and existing profile; do not delete arbitrary extracted folders or project locations as part of migration. After checking that your projects reopen, you may remove the old application-only extraction yourself.

The installed app downloads updates automatically. Restart now saves work and asks you to resolve active machines before installation. Ordinary quit leaves the update for later. A failed download, signature check or installer launch leaves the current session available. Reopen the update control to retry. Staging has its own application identity, profile and `tau-staging` protocol; production uses `tau`.

## Linux with APT

A system administrator enrolls the signed Tau repository. The repository's selector package depends on the exact immutable runtime package, so install through APT after enrollment; do not install the selector `.deb` alone without access to its runtime dependency.

The reviewed `configure-linux-apt.sh` from the qualified release takes an armored **public** key and its independently verified complete fingerprint. Review the script before running it with administrator privileges. For production:

```sh
sudo ./configure-linux-apt.sh production --manual ./tau-apt-public.asc VERIFIED_PRIMARY_FINGERPRINT
sudo apt install tau
```

Replace the fingerprint placeholder with the published, independently verified value. Staging uses `staging` and package `tau-staging`.

Automatic installation is a separate administrator choice. Configure the distribution's normal unattended-upgrades service and daily APT timers first, then use the same enrollment command with `--automatic` instead of `--manual`. Enrollment adds only Tau's origin policy. It does not enable global reboots, replace unrelated repositories, bypass holds, or rewrite distribution-wide scheduling. Repository enrollment alone is not proof that automatic updates will run.

While APT installs a new runtime, an open Tau session continues using its original immutable files. Tau reports that a newer version is installed and offers a save-and-restart action through its stable launcher. It never replaces APT-owned files itself. Old runtime generations are retained; do not manually delete a generation used by an open process.

To stop Tau's unattended enrollment while retaining manual APT updates:

```sh
sudo ./configure-linux-apt.sh production --disable-automatic
```

To hold the selected version, use `sudo apt-mark hold tau`; undo with `sudo apt-mark unhold tau`. Use `tau-staging` for staging. To remove Tau's repository configuration without removing installed runtimes or projects:

```sh
sudo ./configure-linux-apt.sh production --remove-repository
```

These operations preserve unrelated system policy. An administrator's broader APT origin rules may still allow updates, so review those rules too. `TAU_DESKTOP_UPDATES=off` disables Tau-owned update traffic; it does not override APT policy or holds.

## Portable Linux AppImage

Use only a qualified image for a supported distribution. Verify the first download using the promoted release's authenticated manifest and trusted public key, then compare the image digest. A checksum downloaded from the same untrusted location is not publisher authentication.

The maintained verifier checks the Ed25519 signature over the exact base64-decoded descriptor bytes, the independently pinned public key, the requested tag and source commit, channel, version, x64 architecture, immutable artifact path, expiry, SHA-512 and size. It rejects expired first-download descriptors. Obtain the verifier source from your reviewed Tau checkout and run it before executing the image. From that checkout:

```sh
pnpm exec esbuild apps/desktop/scripts/verify-appimage-download.mts --bundle --platform=node --format=esm --outfile=out/verify-appimage-download.mjs
node out/verify-appimage-download.mjs \
  --public-key /absolute/path/tau-appimage-public.pem \
  --key-sha256 INDEPENDENTLY_VERIFIED_LOWERCASE_SHA256_OF_SPKI_DER \
  --descriptor /absolute/path/desktop-update-linux-appimage-x64.json \
  --file /absolute/path/Tau-linux-x64.AppImage \
  --tag 'desktop@RELEASE_VERSION' \
  --source-commit VERIFIED_40_CHARACTER_SOURCE_COMMIT
```

For a first download, obtain the renewed signed envelope at `https://downloads.tau.new/latest/desktop-update-linux-appimage-x64.json` (staging: `https://downloads.taucad.dev/latest/desktop-update-linux-appimage-x64.json`). Its authenticated tag and source must match the exact image you intend to install; the verifier rejects a different current release. Immutable original release descriptors expire after seven days and serve only the installed app’s historical baseline verification after that. Do not bypass expiry for a new download; obtain a fresh signed envelope for the same approved identity or choose the newly approved release. Replace every placeholder; use canonical absolute paths without symlinks. For staging, use the exact `desktop-staging@…` release tag. A successful exit prints the verified tag, source and immutable artifact path. Any failure means do not launch that download. Obtain the expected public-key fingerprint through an independently authenticated Tau channel; neither an adjacent unsigned key nor an adjacent checksum establishes trust. The fingerprint is SHA-256 of the Ed25519 public key's SPKI DER bytes, not of the PEM text. This command displays the supplied key's fingerprint for comparison with that independent value:

```sh
openssl pkey -pubin -in tau-appimage-public.pem -outform DER | openssl dgst -sha256
```

Keep the AppImage in a local writable directory, make it executable, and launch it with normal operating-system sandbox protections. Do not work around a sandbox denial with `--no-sandbox`; use the supported system installation route or resolve the distribution's documented policy.

Tau verifies future update descriptors with public keys embedded in the installed app. Updates are complete downloads. Restart now saves and quiesces the session before an atomic replacement; ordinary quit does not install. Read-only paths and unsupported filesystem configurations fail closed and require manual replacement.

Recovery retains a known-healthy image independently of an unacknowledged candidate. If replacement reports that the outer image changed but startup was not acknowledged, keep the running session open, save your work, and follow the explicit manual-restart guidance. Retaining recovery bytes does not authorize an automatic application downgrade or profile rollback. Preserve projects and profile data when reporting a failed update.

## Managed and archive installations

Windows ZIP and Linux tar users continue to download replacements manually until they choose the installer or AppImage route. Save and quit before replacing application files. Keep project files and profiles separate from that operation.

Managed installations can disable Tau-owned checks with `TAU_DESKTOP_UPDATES=off`, or use the administrator's approved HTTPS update mirror. Locked deployments without an approved mirror do not fall back to the public update service. APT installations remain under the administrator's package-management policy.
