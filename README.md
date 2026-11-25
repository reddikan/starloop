# STARLOOP

A one-button arcade game for Android, made for the Retroid Pocket 5. You fly a comet through glowing nebulae. Swing around stars on a light tether, fling yourself across space, and **close loops with your own trail**. Everything inside a loop is captured in a burst of light.

## How to play

- **Hold** to grab the nearest star and orbit it. The longer you orbit, the more speed you build.
- **Release** to fling off in a straight line. Stars gently bend your path as you pass them.
- **Cross your own trail** to close a loop. Crystals, void mites, stars and prism comets inside the loop are captured.
- Your **LIGHT** drains all the time. Captures refill it. When it runs out, the run is over.

### Scoring
- Catching more things in one loop raises the score for each thing. Loops of 3+, 5+, 8+ and 12+ get their own call-outs (NICE LOOP, STELLAR, SUPERNOVA, HYPERNOVA).
- Each scoring loop closed within 3.6 seconds of the last adds to your **chain multiplier** (up to x16).
- **Gold crystals** are worth extra. **Void mites** hunt you. Touching one costs light and breaks your chain, but looping one destroys it for a big bonus.
- Looping a **star** ignites it for bonus points.
- A **prism comet** crosses the screen now and then. Loop it to start a **PRISM STORM**: double points, light drains slower, crystals pour in and your trail turns rainbow.
- Each score threshold opens a new **sector** with a new nebula, a new star layout, more stars and more mites. There are 8 sectors, and then they repeat.

### Progression
- There are always 3 **missions**. When you finish one, a harder one replaces it.
- Every 3 missions you finish raises your **rank**. Higher ranks unlock trail colors: Aurora, Solar, Ion, Rose, Toxic and Prismatic.

## Controls

| Input | Action |
| --- | --- |
| A / L1 / R1 / L2 / R2 / touch | Hold to orbit, release to fling |
| Start (or the pause icon at bottom right) | Pause |
| B | From pause, quit to the title screen. From the title screen, exit the game. |
| D-pad left/right (title screen) | Change trail color |

## Install

Every push to `main` runs GitHub Actions, which builds a signed APK and posts it under **Releases**. Download the newest APK on the device and install it. Updates install over the top because every build is signed with the same key, `app/starloop.keystore`.

## Project

- `app/src/main/assets/www/`: the game. It has a canvas renderer with additive glow, particles and procedural nebulae. All audio is synthesized live with WebAudio.
- `app/src/main/java/.../MainActivity.java`: the fullscreen Android shell. It passes controller buttons to the game.
- To play in a desktop browser, open `index.html` and use Space to orbit and Esc to pause. Add `?demo=1` to the URL to watch the autopilot.

Fonts: Archivo Black and Anton (SIL Open Font License, included).
