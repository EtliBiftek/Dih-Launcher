# Build reliability

Dih Launcher CI uses a committed npm lockfile and `npm ci` for deterministic Windows builds. Runtime API checks are offline; Mojang/Fabric metadata checks run separately with retries so transient metadata outages are easy to diagnose.
