# Project Specification: High-Performance Falling Sand Engine

## 1. Core Identity & Tech Stack
**Project:** Modular Cellular Automata (Falling Sand) Engine
**Platform:** Web (HTML5 Canvas API, Vanilla JS or TypeScript)
**Performance Target:** 60fps @ 100k+ particles.
**Visual Style:** Modern Glassmorphism.

## 2. Technical Constraints (Strict)
* **No Heavy Objects:** Do not store objects in grid cells. Use 1D `TypedArrays` (Uint8Array for IDs, Uint32Array for rendering).
* **Indexing:** Access grid via `index = y * width + x`.
* **Rendering:** Use `ctx.putImageData` with a `Uint32Array` buffer for pixel manipulation. Do not use `ctx.fillRect`.
* **Extensibility:** Interactions must be defined in a Data Configuration object, not hardcoded `if/else` chains in the main loop.

## 3. Architecture Blueprint

### 3.1 Data Structure
* `grid`: 1D Array storing Element IDs.
* `meta`: 1D Array storing state data (heat, velocity, life).
* `chunkState`: A system to track "Active" vs "Sleeping" 32x32 chunks to optimize the update loop.

### 3.2 The Element Definition System
Create a configuration constant (e.g., `ELEMENT_DATA`) where every material is defined by properties:
* `id`: Integer
* `color`: Hex/Array
* `density`: Float (determines sinking/floating)
* `behavior`: Enum (SOLID, POWDER, LIQUID, GAS)
* `reactivity`: Object defining flammability, corrosion resistance, etc.



### 3.3 The Update Loop (Physics)
Implement a unified `update()` function that iterates through the grid (bottom-up for falling elements, top-down for rising).
1.  **Check State:** Is the pixel active?
2.  **Check Neighbors:** Look at relevant neighbors based on `behavior` type.
3.  **Resolve Movement:** Swap pixels based on density checks.
4.  **Resolve Reaction:** Check `reactivity` against neighbors (e.g., Fire checks neighbors for `flammable: true`).

## 4. UI/UX Design System (Glassmorphism)
**General Aesthetic:** Translucent, frosted glass, rounded corners.
**Layout:**
* **Canvas:** Fullscreen (100vw/100vh).
* **Toolbar (Left):** Floating pill-shape. Tools: Brush, Eraser, Fill, Picker, Clear.
* **Elements (Right):** Floating pill-shape. Scrollable list of materials.

**Interaction:**
* **Hover:** Reveal sliders for Brush Size/Eraser Size.
* **Icons:** FontAwesome.



## 5. Development Roadmap (Chain-of-Thought)

**Phase 1: The Grid & Render Loop**
* Setup HTML5 Canvas.
* Initialize 1D TypedArrays.
* Implement `render()` using ImageData.
* Implement basic mouse painting (Brush).

**Phase 2: Basic Physics (Gravity)**
* Implement the `update()` loop.
* Add `SAND` (Powder physics: Down -> Down-Left/Down-Right).
* Add `WALL` (Solid physics: No movement).

**Phase 3: Fluids & Density**
* Add `WATER` (Liquid physics: Down -> Side).
* Implement density checks (Sand sinks in Water).

**Phase 4: Thermodynamics & Reactivity**
* Refactor to use the `ELEMENT_DATA` config.
* Implement `FIRE` (Gas physics, Life counter).
* Implement flammability checks.

**Phase 5: Optimization**
* Implement "Dirty Rectangles" / Chunk-based activity.
* Only update chunks that contain moving particles.