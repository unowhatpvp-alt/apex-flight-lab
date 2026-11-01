# APEX / Flight Lab

An independent 3D jet-car stunt game for desktop and mobile browsers. Choose a vehicle and proving ground, drive, fire the jets, perform barrel rolls, and review your score and vehicle damage after each run.

[Play online](https://unowhatpvp-alt.github.io/apex-flight-lab/) · [中文说明](README.md)

Version **1.2.0**. Use the **EN / 中文** button in the upper-right corner to switch languages in the game.

## Driving controls

| Key | Action |
| --- | --- |
| W / ↑ | Accelerate |
| S / ↓ | Brake |
| A / D or ← / → | Steer left / right |
| Q / E | Roll left / right in the air, around the car's longitudinal axis |
| Space | Hold to fire underbody jets along the car's local upward axis |
| M | Toggle adhesion assistance for loops and inverted roads |
| C | Cycle chase, wide-chase and close-chase cameras |
| T | Return to the nearest safe road while preserving run time, damage and jet reserve |
| R | Start a fresh run |
| Esc / P | Pause or resume |

Mobile controls support simultaneous button presses. Landscape provides a wider view. For a first jump, build speed, fire the jets for 0.5–1 second, then tap Q / E to level the car with all four tyres facing the landing surface. Jet reserve refills after returning to the track.

You can continue driving and flying outside the course. There is no automatic 180-second timeout. **A successful finish requires physically crossing the finish gate**: passing beside it, flying above it or crossing in reverse does not complete the course. Keep exploring after missing the gate, or press T to return to a safe road section. Severe crashes or critical vehicle damage can still end a run in failure.

## Six proving grounds

| Course | Features |
| --- | --- |
| The Reveal — default | Floating road sections and two orange platforms measuring 22 / 24 metres; approaching starts a countdown, then removes both their visible geometry and collision surfaces |
| Desert Proving Ground | Wide straights, rolling roads and an introductory jump |
| Skyline Loop | A complete spatial loop and broken bridge |
| Inverted Highway | Elevated inverted driving, bridge undersides and rolling roads |
| Lunar Expedition | Gameplay-tuned low gravity and extended flights |
| Zero Limit | Consecutive gaps, a large loop and inverted-road combinations |

Loops and inverted bridges use spatial separation to avoid overlapping road decks. Courses include checkpoints, progress tracking, a route minimap and countdown warnings for disappearing platforms.

## Four test vehicles

| Vehicle | Character |
| --- | --- |
| APEX ROADSTER | Responsive handling and aerial stunts |
| VOLT GT | Heavier body, stable cruising and balanced handling |
| TERRA RALLY | Softer suspension and more forgiving landing damage |
| SILVER PROTOTYPE | Low body, high grip and high-speed performance |

The vehicles have distinct body styles, mass, acceleration, top speed, steering response, grip, suspension and damage tuning. These are fictional test-fleet settings, not specifications of real production cars.

Steering includes wheel angle, chassis yaw, speed-sensitive steering range and tyre slip. Flight uses full 3D orientation, with thrust following the car's attitude. White underbody condensation jets and lateral attitude jets provide visible control feedback. Body, suspension, battery and thruster damage are tracked separately and reflected in deformation and smoke.

Run results show score, grade, time, roll count, airtime, top speed and a damage report. Personal bests, language and graphics preferences are stored in the current browser. No account or backend is required.

## Graphics and Blender asset

The game uses **Three.js / WebGL 2 / PBR materials** with browser GPU acceleration. Auto, Low, Balanced, High and Ultra settings are available. Higher settings add detail, shadows, ambient occlusion and soft bloom; Ultra uses 4096-pixel shadow maps. **Camera motion blur is optional and off by default**. When enabled, its strength responds to camera movement and vehicle speed.

Vehicles and courses use procedurally generated real-time meshes. Car-paint reflections use an original HDR studio environment genuinely baked offline with **Blender 5.2.2 Cycles, an RTX 5080, OptiX and 96 samples**. The studio contains large white softboxes, neutral dark surfaces, subtle cyan lighting and floor bounce.

- Web asset: `assets/studio-env.js`, 256 × 128, scene-linear RGBA half-float, approximately 350 KB, retaining HDR radiance above 1.
- The local delivery also includes `../blender-source/apex-studio-environment.blend` and `../studio-environment-preview.png`. They are outside the website root and are not deployed to GitHub Pages.
- Blender performs the offline asset bake. The browser game uses real-time rasterization; it does not run Cycles or path tracing.

Production changes were confined to this project. System settings, driver settings and Valorant files were not modified. Blender ran with `--background --factory-startup`, selected the GPU within that process and did not save user preferences. Players do not need Blender installed.

## Run locally

All runtime resources are hosted with the project. No external fonts, CDN or dependency installation is required. Start a static server from this directory with Python 3:

```sh
python -m http.server 8744 --bind 127.0.0.1
```

Open [the local game](http://127.0.0.1:8744/). The project uses ES modules, so access it through HTTP rather than opening `index.html` directly.

## Validation

Physics and camera checks require Node.js:

```sh
node physics.test.mjs
node camera.test.mjs
```

Physics checks cover all 24 vehicle/course combinations, roll direction, local thrust, ramp pitch, speed-sensitive steering, tyre slip, hull contacts, bridge undersides, broken-road end faces, inverted adhesion, guardrails, disappearing-platform collision removal, free exploration, state-preserving recovery, physical finish-gate crossing and 30 / 120 FPS consistency. Camera checks cover heading, an independent roll reference, obstacle avoidance and a complete spatial loop.

Browser viewport checks include the **390 × 844 English portrait menu** and landscape layouts. The Start button is reachable within that portrait viewport. These are browser viewport and interaction checks, not tests of multitouch, thermal behaviour or GPU performance on a physical phone.

## GitHub Pages

Publish the repository root from the `main` branch. All resource paths are relative, and `.nojekyll` disables Jekyll. The existing URL remains [APEX Flight Lab](https://unowhatpvp-alt.github.io/apex-flight-lab/).

## Simulation scope and licensing

This independent arcade driving game is not affiliated with Tesla or SpaceX. It uses fixed 120 Hz integration, custom road contact, hull collision, tyre-grip and flight models. It is not an engineering-grade multibody, individual-wheel suspension, tyre-thermal or soft-body crash simulator. Adhesion assistance, automatic gas refilling, reduced gravity and damage values are gameplay mechanics.

The source code, procedural meshes and studio asset were created for this project. No separate overall open-source license has been assigned to the repository. Bundled **Three.js 0.170.0** is distributed under the MIT license; see [vendor/THREE-LICENSE.txt](vendor/THREE-LICENSE.txt).
