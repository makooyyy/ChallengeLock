# ChallengeLock Shop Companion — prototype 0.1.2

A desktop window with click-through outside its controls follows shop events from the game log (`gameplay_hud.gShopOpen`).
Displays the current challenge, next purchase and build list from the desktop app on `127.0.0.1:47821`.
Mark purchases and ability steps separately in the shop card. Undo reverses its last action. With no active challenge, build or ban, the panel stays hidden.
No memory access, gameplay commands, chat messages or external services are used by the mod.

## Build

Install Python dependency `vpk==1.4.0`, obtain Source2Viewer-CLI from the official
[ValveResourceFormat releases](https://github.com/ValveResourceFormat/ValveResourceFormat/releases), then run:

```text
py mod/build.py --game "C:/Program Files (x86)/Steam/steamapps/common/Deadlock" --vrf "path/to/Source2Viewer-CLI.exe"
```

The build extracts the installed game's current damage-impact layout and adds one script include.
It stops on unexpected layout structure, verifies compiled resources with Source2Viewer and writes
`mod/dist/ChallengeLock-Shop-Mod-0.1.2.zip`. No game files are changed by the builder.

## Install / remove

Close Deadlock. Import the ZIP as a local mod in Deadlock Mod Manager, or place the generated
`pak99_challengelock_dir.vpk` in the already enabled `game/citadel/addons` folder.
Use one installation method only. Restart the game and keep ChallengeLock running.
Remove/disable this mod and restart to revert. Do not replace another mod's VPK.

The only stock override is `panorama/layout/hud_damage_impact.vxml_c`; another mod overriding
that file needs a merged build. Rebuild after game updates. The desktop app must be running and reading console.log. Use borderless windowed mode.

## Sources and licenses

- `vendor/panorama.py`: MIT file from regulad/BiggerIdleMap, adapted there from
  Vergir/deadlock-hud-resize; original license notice preserved in the file.
- HTMLTitle transport technique documented by
  [Predi-i/Deadlock-UI-Mods](https://github.com/Predi-i/Deadlock-UI-Mods/blob/main/HTML_TRANSPORT_HANDOFF.md).
  ChallengeLock's transport and UI implementation are original.
- Game layout is extracted locally at build time and is not checked into this repository.
