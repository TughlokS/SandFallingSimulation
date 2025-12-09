# UI/UX Master Specification: High-Fidelity Glassmorphism Interface

## 1. Design Philosophy & Aesthetic
**Style:** Modern Glassmorphism (Frosted Glass).
**Core Principles:** Minimalism, Translucency, Soft Shadows, Floating Geometry.
**Iconography:** FontAwesome 6 (Free Solid).
**Typography:** System Sans-Serif (Inter, Roboto, or San Francisco). Clean, white text.

### 1.1 The "Glass" CSS Recipe
The AI must strictly adhere to these visual parameters to avoid a "muddy" look:
* **Surface:** `background: rgba(255, 255, 255, 0.05);` (Very subtle)
* **Blur:** `backdrop-filter: blur(12px);` (Heavy frost effect)
* **Border:** `border: 1px solid rgba(255, 255, 255, 0.15);` (To define edges)
* **Shadow:** `box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);` (Deep depth)
* **Rounding:** `border-radius: 20px;` (Pill/Soft shape)
* **Text Color:** `#FFFFFF` (White) with slight text-shadow for contrast.

---

## 2. Layout Architecture
The app consists of three Z-Index layers:
1.  **Layer 0 (Background):** A dark, subtle gradient (e.g., Deep Slate to Black) to make the glass effect pop.
2.  **Layer 1 (Canvas):** The `HTMLCanvasElement` covering 100% Width and 100% Height (`fixed`, `top: 0`, `left: 0`).
3.  **Layer 2 (UI overlay):** Floating containers interacting via `pointer-events`.

---

## 3. Component A: The Left Toolbar (Tools)
**Position:** Fixed, Vertically Centered (`top: 50%`, `transform: translateY(-50%)`), Left: 20px.
**Shape:** Vertical Pill (Width ~60px, Height: Auto).
**Behavior:** Flex column, gap 16px, padding 16px.

### 3.1 Tool Definitions & States

**1. Brush Tool**
* **Icon:** `fa-paint-brush`
* **Active State:** Icon glows/highlights.
* **Hover Interaction:** Reveals a **Vertical Slider Popup** just to the right of the icon.
    * *Slider Logic:* Adjusts `brushSize` (integer 1-50).
* **Cursor Logic:**
    * **Hide** default system cursor.
    * **Render** a custom "Brush Reticle" (white wireframe circle) on the canvas that matches the exact pixel diameter of `brushSize`.

**2. Eraser Tool**
* **Icon:** `fa-eraser`
* **Hover Interaction:** Reveals **Vertical Slider Popup** (same component as Brush).
    * *Slider Logic:* Adjusts `eraserSize`.
* **Cursor Logic:** Same "Reticle" behavior as Brush, but perhaps a different color (e.g., Red outline).

**3. Fill Tool**
* **Icon:** `fa-fill-drip`
* **Cursor Logic:** CSS `cursor: url('path/to/bucket-icon.png'), auto;` OR a custom DOM element following the mouse. No reticle.

**4. Element Picker**
* **Icon:** `fa-eye-dropper`
* **Cursor Logic:** CSS `cursor: url('path/to/dropper-icon.png'), auto;`.

**5. Grid / Zoom Toggle**
* **Icon:** `fa-border-all`
* **Click Action:** Toggles visibility of the pixel grid overlay.
* **Hover Interaction:** Reveals **Vertical Slider Popup**.
    * *Slider Logic:* Adjusts `cellSize` (Zoom Level).
    * *Behavior:* As `cellSize` increases, the simulation grid appears to zoom in (fewer total cells fit on screen). As it decreases, the grid zooms out (more cells).

**6. Clear Canvas**
* **Icon:** `fa-trash`
* **Action:** Resets grid to 0. Add a subtle "shake" animation on click for feedback.

---

## 4. Component B: The Right Element Bar (Materials)
**Position:** Fixed, Vertically Centered, Right: 20px.
**Shape:** Mirror of the Left Toolbar (Same width, rounded corners, glass style).
**Layout:**
* **Header:** Small label or icon indicating "Elements".
* **Scroll Area:** If elements exceed height, use a hidden scrollbar (`scrollbar-width: none`) but allow scrolling.
* **Items:** Circular color swatches representing the element (Sand=Yellow, Water=Blue).
* **Tooltip:** Hovering a swatch shows the Element Name (e.g., "Gunpowder") in a small glass tooltip.

---

## 5. Component C: The Sliders (Micro-Interaction)
To maintain the "Minimal" aesthetic, sliders are **not** visible by default.
* **Trigger:** They fade in (`opacity: 0` -> `1`) when hovering the parent tool icon.
* **Position:** Absolute, slightly offset to the right of the tool icon.
* **Style:**
    * Track: Thin white semi-transparent line.
    * Thumb: Solid white circle, no border.
    * Background: A small, dark glass container behind the slider to ensure visibility.

---

## 6. Global Cursor Management
The application must intercept mouse movement on the canvas.
* `pointer-events`: Ensure the UI elements have `pointer-events: auto` but the empty space around them allows clicks to pass through to the canvas if necessary (though usually, UI blocks painting under it).
* **Dynamic Cursor Implementation:** Use a `div` with `position: fixed; pointer-events: none;` that follows `clientX/Y` for the Brush Reticle to ensure 60fps smoothness without canvas clearing artifacts.