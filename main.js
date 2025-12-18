/**
 * ============================================================================
 * FALLING SAND SIMULATION ENGINE
 * ============================================================================
 * 
 * Physics implementation based on cellular automata with density-based interactions.
 * 
 * CODE STRUCTURE:
 * ---------------
 * 1. CONSTANTS & CONFIGURATION
 *    - Element types, states, properties
 *    - Lifetime configurations
 *    - Element mappings
 * 
 * 2. GAME CLASS
 *    A. INITIALIZATION
 *       - Constructor, LUT setup, array initialization
 *    
 *    B. CORE SIMULATION LOOP
 *       - Update loop, animation frame
 *    
 *    C. PHYSICS SYSTEMS (grouped by particle type)
 *       - Solid Physics + Helpers
 *       - Liquid Physics + Helpers
 *       - Gas Physics + Helpers
 *       - Fire Physics + Helpers
 *    
 *    D. RENDERING SYSTEM
 *       - Particle rendering, color calculation
 *       - Grid overlay rendering
 *    
 *    E. INTERACTION SYSTEM
 *       - Tools (brush, eraser, fill)
 *       - Mouse events, drawing
 *    
 *    F. PLAYBACK SYSTEM
 *       - Pause/play, frame stepping
 *       - History management
 *    
 *    G. UI MANAGEMENT
 *       - UI setup, event handlers
 *       - Cursor, status pill, size preview
 *    
 *    H. UTILITY FUNCTIONS
 *       - Particle manipulation (swap, move, setType)
 *       - Helper functions (getIdx, fastRand)
 * 
 * KEY PHYSICS CONCEPTS:
 * ---------------------
 * - Density-based interactions: Heavier particles sink through lighter ones
 * - Diagonal slip: Creates V-shaped sinking effect in liquids
 * - Hydrostatic displacement: Water pushed horizontally at bottom level
 * - Splash displacement: Water pushed sideways at current level (prevents elevator effect)
 * - Pseudo-pressure: Horizontal gap search simulates fluid pressure
 * 
 * @author Sand Simulation Team
 * @version 2.0 - Refactored for readability
 */

// ============================================================================
// ELEMENT DEFINITIONS & CONSTANTS
// ============================================================================

// State Enums
const STATE = {
    AIR: 0,
    SOLID: 1,
    LIQUID: 2,
    GAS: 3,
    FIRE: 4,
    STATIC: 5
};

// Element Type IDs
const TYPE = {
    EMPTY: 0,
    SAND: 1,
    WATER: 2,
    STONE: 3,
    FIRE: 4,
    WOOD: 5,
    SMOKE: 6,
    STEAM: 7,
    ACID: 8,
    OIL: 9,
    WOOD_OILED: 10,
    LAVA: 11,
    ASH: 12,
    NANOBOT: 13,
    GRAVEL: 14
};

// Element Configuration
const ELEMENTS = {
    [TYPE.EMPTY]: { name: 'Empty', color: [7, 7, 8], density: 0, state: STATE.AIR },
    [TYPE.SAND]: { name: 'Sand', color: [235, 200, 117], density: 10, state: STATE.SOLID },
    [TYPE.WATER]: { name: 'Water', color: [79, 164, 184], density: 5, state: STATE.LIQUID },
    [TYPE.STONE]: { name: 'Stone', color: [82, 79, 69], density: 100, state: STATE.STATIC },
    [TYPE.FIRE]: { name: 'Fire', color: [255, 69, 0], density: -1, state: STATE.FIRE },
    [TYPE.WOOD]: { name: 'Wood', color: [139, 90, 43], density: 100, state: STATE.STATIC },
    [TYPE.SMOKE]: { name: 'Smoke', color: [136, 136, 136], density: -2, state: STATE.GAS },
    [TYPE.STEAM]: { name: 'Steam', color: [230, 230, 250], density: -1, state: STATE.GAS },
    [TYPE.ACID]: { name: 'Acid', color: [50, 205, 50], density: 6, state: STATE.LIQUID },
    [TYPE.OIL]: { name: 'Oil', color: [51, 51, 51], density: 2, state: STATE.LIQUID },
    [TYPE.WOOD_OILED]: { name: 'Oiled Wood', color: [74, 59, 42], density: 100, state: STATE.STATIC },
    [TYPE.LAVA]: { name: 'Lava', color: [255, 100, 0], density: 50, state: STATE.LIQUID },
    [TYPE.ASH]: { name: 'Ash', color: [160, 160, 160], density: 3, state: STATE.SOLID },
    [TYPE.NANOBOT]: { name: 'Nano Bot', color: [255, 50, 110], density: 15, state: STATE.LIQUID },
    [TYPE.GRAVEL]: { name: 'Gravel', color: [95, 92, 82], density: 12, state: STATE.SOLID }
};

// Element name to type mapping
const ELEMENT_MAP = {
    'sand': TYPE.SAND,
    'water': TYPE.WATER,
    'stone': TYPE.STONE,
    'fire': TYPE.FIRE,
    'wood': TYPE.WOOD,
    'smoke': TYPE.SMOKE,
    'steam': TYPE.STEAM,
    'acid': TYPE.ACID,
    'oil': TYPE.OIL,
    'wood-oiled': TYPE.WOOD_OILED,
    'lava': TYPE.LAVA,
    'ash': TYPE.ASH,
    'nanobot': TYPE.NANOBOT,
    'gravel': TYPE.GRAVEL
};

// Initial lifetime configuration for particles
const INITIAL_LIFETIME = {
    [TYPE.FIRE]: () => 80 + Math.random() * 40,  // 80-120 frames
    [TYPE.SMOKE]: () => 80 + Math.random() * 40, // 80-120 frames
    [TYPE.STEAM]: () => 100,                      // 100 frames
    [TYPE.OIL]: () => 0,                           // 0 = not burning, >0 = burning timer
    [TYPE.WOOD_OILED]: () => 0,                    // 0 = not burning, >0 = burning timer
    [TYPE.LAVA]: () => 1200 + Math.random() * 600, // 1200-1800 frames (20-30 seconds)
    [TYPE.NANOBOT]: () => 90                       // 90 frames lifespan (1.5 seconds)
};


// ============================================================================
// MAIN GAME CLASS
// ============================================================================

class Game {
    constructor() {
        // Canvas Setup
        this.canvas = document.getElementById('sim-canvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false, willReadFrequently: true });
        
        // Grid Overlay Canvas
        this.gridCanvas = document.getElementById('grid-canvas');
        this.gridCtx = this.gridCanvas.getContext('2d', { alpha: true });
        
        // Canvas dimensions
        this.width = 0;
        this.height = 0;
        this.simScale = 4; // Pixel size for crisp rendering
        this.gridWidth = 0;
        this.gridHeight = 0;
        this.cellCount = 0;
        
        // Simulation arrays (TypedArrays for performance)
        this.cells = null;          // Uint8Array - element types
        this.variations = null;     // Uint8Array - color variations
        this.life = null;           // Uint16Array - lifetime counters
        this.moved = null;          // Uint8Array - movement flags
        
        // Rendering
        this.imgData = null;
        this.data = null;           // Uint32Array view of image data
        
        // Look-Up Tables for fast access
        this.LUT_DENSITY = new Int8Array(256);
        this.LUT_STATE = new Uint8Array(256);
        this.LUT_COLOR_R = new Uint8Array(256);
        this.LUT_COLOR_G = new Uint8Array(256);
        this.LUT_COLOR_B = new Uint8Array(256);
        this.LUT_GLOW = new Uint8Array(256);
        
        // Random number generator state
        this.rngState = 123456789;
        
        // Optimization: track active region
        this.minActiveY = 0;
        
        // UI State
        this.activeTool = 'brush';
        this.activeElement = 'sand';
        this.brushSize = 5;
        this.eraserSize = 10;
        this.gridSize = 4;
        this.showGrid = false;
        
        // Mouse state
        this.isMouseDown = false;
        this.mouseX = 0;
        this.mouseY = 0;
        this.lastDrawX = null;
        this.lastDrawY = null;
        this.isDragging = false; // Track if currently in a drag operation (for undo)
        
        // Continuous draw delay (prevents single click from drawing multiple times)
        this.mouseDownTime = 0;
        this.continuousDrawEnabled = false;
        this.continuousDrawDelay = 100; // milliseconds to hold before enabling continuous draw
        
        // Drag detection for immediate continuous draw
        this.mouseDownX = 0;
        this.mouseDownY = 0;
        this.dragThreshold = 3; // pixels to move before enabling continuous draw
        
        // Shift-click line drawing state
        this.lastClickX = null;
        this.lastClickY = null;
        this.lastClickSize = null;
        this.lastClickTool = null;
        
        // Shift-drag axis constraint state
        this.shiftDragActive = false;
        this.shiftDragAxis = null; // 'x' or 'y'
        this.shiftDragStartX = null;
        this.shiftDragStartY = null;
        
        // UI Elements
        this.cursorEl = document.getElementById('custom-cursor');
        
        // Animation
        this.lastTime = 0;
        this.frameCount = 0;
        
        // Playback controls
        this.isPaused = false;
        this.frameHistory = []; // Store up to 200 previous frames
        this.maxHistoryFrames = 200;
        this.currentHistoryIndex = -1; // -1 means live mode
        
        // Action history for undo/redo (separate from frame history)
        this.actionHistory = []; // Store up to 500 user actions
        this.maxActionHistory = 500;
        this.currentActionIndex = -1; // Current position in action history
        this.isRestoringAction = false; // Flag to prevent recording during undo/redo
        this.createdParticles = new Set(); // Track particle IDs created in current action
        this.nextParticleId = 1; // Counter for unique particle IDs
        
        this.init();
    }

    
    // ========================================================================
    // INITIALIZATION
    // ========================================================================
    
    init() {
        this.initLUTs();
        this.resize();
        this.setupUI();
        this.setupMouseEvents();
        
        // Event Listeners
        window.addEventListener('resize', () => this.resize());
        
        // Undo/Redo keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            // Ctrl+Z for undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            }
            // Ctrl+Y or Ctrl+Shift+Z for redo
            else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                this.redo();
            }
        });
        
        // Start Loop
        requestAnimationFrame((ts) => this.animate(ts));
        
        console.log("Sand Engine Initialized");
        console.log(`Grid: ${this.gridWidth}x${this.gridHeight} (Scale: ${this.simScale}px)`);
    }
    
    
    initLUTs() {
        // Populate Look-Up Tables for fast element property access
        Object.keys(ELEMENTS).forEach(key => {
            const id = parseInt(key);
            const el = ELEMENTS[id];
            this.LUT_DENSITY[id] = el.density;
            this.LUT_STATE[id] = el.state;
            this.LUT_COLOR_R[id] = el.color[0];
            this.LUT_COLOR_G[id] = el.color[1];
            this.LUT_COLOR_B[id] = el.color[2];
            // Mark glowing elements
            this.LUT_GLOW[id] = (id === TYPE.FIRE || id === TYPE.ACID || id === TYPE.NANOBOT) ? 1 : 0;
        });
    }
    
    
    initArrays() {
        // Initialize simulation arrays
        this.cellCount = this.gridWidth * this.gridHeight;
        
        this.cells = new Uint8Array(this.cellCount);
        this.life = new Int16Array(this.cellCount);
        this.variations = new Float32Array(this.cellCount);
        this.moved = new Uint8Array(this.cellCount);
        this.particleId = new Uint32Array(this.cellCount); // Unique ID for each particle (for undo tracking)
        
        // Initialize color variations
        for (let i = 0; i < this.cellCount; i++) {
            this.variations[i] = Math.random() * 20;
        }
        
        // Create image data for rendering
        this.imgData = this.ctx.createImageData(this.gridWidth, this.gridHeight);
        this.data = new Uint32Array(this.imgData.data.buffer);
        
        this.minActiveY = this.gridHeight - 1;
    }

    
    // ========================================================================
    // UI SETUP
    // ========================================================================
    
    setupUI() {
        // --- Tool Selection ---
        document.querySelectorAll('.tool-wrapper').forEach(wrapper => {
            const tool = wrapper.dataset.tool;
            
            // Special handling for trash tool - use mousedown/mouseup for hold mechanism
            if (tool === 'trash') {
                wrapper.addEventListener('mousedown', (e) => {
                    // Prevent triggering if clicking the slider itself
                    if (e.target.tagName === 'INPUT') return;
                    
                    // Start the same hold mechanism as D key
                    if (!this.clearHoldStart) {
                        this.clearHoldStart = Date.now();
                        const trashIcon = wrapper.querySelector('.tool-icon');
                        
                        // Start smooth progress animation with requestAnimationFrame (reuse same logic as D key)
                        const animateProgress = () => {
                            const holdTime = Date.now() - this.clearHoldStart;
                            const progress = Math.min(holdTime / 500, 1); // 0 to 1 over 0.5 seconds
                            
                            // Update visual progress
                            trashIcon.style.setProperty('--clear-progress', progress);
                            trashIcon.classList.add('clearing');
                            
                            // Clear canvas after 0.5 seconds
                            if (progress >= 1) {
                                this.clearCanvas();
                                this.resetClearProgress();
                            } else {
                                // Continue animation
                                this.clearHoldAnimationId = requestAnimationFrame(animateProgress);
                            }
                        };
                        
                        this.clearHoldAnimationId = requestAnimationFrame(animateProgress);
                    }
                });
                
                // Handle mouseup/mouseleave to cancel if released early
                const cancelClearHold = () => {
                    if (this.clearHoldStart) {
                        this.resetClearProgress();
                    }
                };
                
                wrapper.addEventListener('mouseup', cancelClearHold);
                wrapper.addEventListener('mouseleave', cancelClearHold);
                
                return; // Skip the regular click handler for trash
            }
            
            // Regular click handler for other tools
            wrapper.addEventListener('click', (e) => {
                // Prevent triggering if clicking the slider itself
                if (e.target.tagName === 'INPUT') return;

                if (tool === 'grid') {
                    this.toggleGrid();
                    return;
                }

                this.setActiveTool(tool);
                
                // Update UI Visuals
                document.querySelectorAll('.tool-icon').forEach(el => el.classList.remove('active'));
                wrapper.querySelector('.tool-icon').classList.add('active');
            });
        });

        // --- Element Selection ---
        document.querySelectorAll('.element-item').forEach(el => {
            el.addEventListener('click', () => {
                this.activeElement = el.dataset.elem;
                document.querySelectorAll('.element-item').forEach(item => item.classList.remove('active'));
                el.classList.add('active');
            });
        });
        
        // --- Element Categories ---
        this.elementCategories = {
            'powder': ['sand', 'ash', 'gravel'],
            'liquid': ['water', 'acid', 'oil', 'lava'],
            'gas': ['smoke', 'steam'],
            'static': ['stone', 'wood', 'wood-oiled'],
            'special': ['fire', 'nanobot']
        };
        
        // Element metadata for popup
        this.elementData = {
            'sand': { color: '#f6d7b0', label: 'Sand', category: 'powder' },
            'water': { color: '#4fa4b8', label: 'Water', category: 'liquid' },
            'stone': { color: '#524f45', label: 'Stone', category: 'static' },
            'wood': { color: '#8b5a2b', label: 'Wood', category: 'static' },
            'fire': { color: '#ff4500', label: 'Fire', category: 'special', glow: true },
            'smoke': { color: '#888888', label: 'Smoke', category: 'gas' },
            'steam': { color: '#e6e6fa', label: 'Steam', category: 'gas' },
            'acid': { color: '#32cd32', label: 'Acid', category: 'liquid' },
            'oil': { color: '#333333', label: 'Oil', category: 'liquid' },
            'wood-oiled': { color: '#4a3b2a', label: 'Oiled Wood', category: 'static' },
            'lava': { color: '#ff6400', label: 'Lava', category: 'liquid' },
            'ash': { color: '#a0a0a0', label: 'Ash', category: 'powder' },
            'nanobot': { color: '#ff326e', label: 'Nano Bot', category: 'special', glow: true },
            'gravel': { color: '#5f5c52', label: 'Gravel', category: 'powder' }
        };
        
        // --- Mouse Wheel Element Selection ---
        // Get ordered list of element names
        this.elementOrder = Array.from(document.querySelectorAll('.element-item')).map(el => el.dataset.elem);
        
        window.addEventListener('wheel', (e) => {
            // Only handle if not over UI panels (allow normal scrolling in element picker)
            const overElementPicker = e.target.closest('#elements-right');
            if (overElementPicker) return; // Let normal scroll work in element picker
            
            e.preventDefault();
            
            // Check if Ctrl is held - adjust brush/eraser size instead of element selection
            if (e.ctrlKey || e.metaKey) {
                // Only adjust size for brush or eraser tools
                if (this.activeTool === 'brush' || this.activeTool === 'eraser') {
                    const scrollDirection = e.deltaY < 0 ? 1 : -1;
                    this.adjustSize(scrollDirection);
                }
                return;
            }
            
            // Get current element index
            const currentIndex = this.elementOrder.indexOf(this.activeElement);
            if (currentIndex === -1) return;
            
            // Calculate new index based on scroll direction
            let newIndex;
            if (e.deltaY < 0) {
                // Scroll up: previous element
                newIndex = currentIndex - 1;
                if (newIndex < 0) newIndex = this.elementOrder.length - 1; // Wrap to end
            } else {
                // Scroll down: next element
                newIndex = currentIndex + 1;
                if (newIndex >= this.elementOrder.length) newIndex = 0; // Wrap to start
            }
            
            // Update active element
            const newElement = this.elementOrder[newIndex];
            this.activeElement = newElement;
            
            // Update UI
            document.querySelectorAll('.element-item').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.elem === newElement) {
                    item.classList.add('active');
                    
                    // Smart scroll: ensure element is visible
                    const container = document.querySelector('.elements-scroll');
                    const itemRect = item.getBoundingClientRect();
                    const containerRect = container.getBoundingClientRect();
                    
                    // Check if item is above visible area
                    if (itemRect.top < containerRect.top) {
                        // Scroll up to show item at top
                        item.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                    // Check if item is below visible area
                    else if (itemRect.bottom > containerRect.bottom) {
                        // Scroll down to show item at bottom
                        item.scrollIntoView({ behavior: 'smooth', block: 'end' });
                    }
                }
            });
        }, { passive: false });
        
        // --- Element Expander Popup ---
        const expanderBtn = document.getElementById('element-expander');
        const popup = document.getElementById('element-popup');
        const popupClose = document.getElementById('popup-close');
        const elementGrid = document.getElementById('element-grid');
        const tabBtns = document.querySelectorAll('.tab-btn');
        
        let currentCategory = 'all';
        
        // Populate element grid
        const populateGrid = (category) => {
            elementGrid.innerHTML = '';
            
            let elementsToShow = [];
            if (category === 'all') {
                elementsToShow = Object.keys(this.elementData);
            } else {
                elementsToShow = this.elementCategories[category] || [];
            }
            
            elementsToShow.forEach(elemName => {
                const data = this.elementData[elemName];
                const item = document.createElement('div');
                item.className = 'grid-element-item';
                if (this.activeElement === elemName) {
                    item.classList.add('active');
                }
                item.dataset.elem = elemName;
                
                const dot = document.createElement('div');
                dot.className = 'grid-elem-dot';
                dot.style.setProperty('--elem-color', data.color);
                if (data.glow) {
                    dot.style.boxShadow = `0 0 12px ${data.color}`;
                }
                
                const label = document.createElement('div');
                label.className = 'grid-elem-label';
                label.textContent = data.label;
                
                item.appendChild(dot);
                item.appendChild(label);
                
                // Click handler
                item.addEventListener('click', () => {
                    this.activeElement = elemName;
                    
                    // Update sidebar
                    document.querySelectorAll('.element-item').forEach(el => {
                        el.classList.remove('active');
                        if (el.dataset.elem === elemName) {
                            el.classList.add('active');
                        }
                    });
                    
                    // Update grid
                    document.querySelectorAll('.grid-element-item').forEach(el => {
                        el.classList.remove('active');
                    });
                    item.classList.add('active');
                    
                    // Close popup
                    popup.classList.add('hidden');
                });
                
                elementGrid.appendChild(item);
            });
        };
        
        // Open popup
        expanderBtn.addEventListener('click', () => {
            popup.classList.remove('hidden');
            populateGrid(currentCategory);
        });
        
        // Close popup
        popupClose.addEventListener('click', () => {
            popup.classList.add('hidden');
        });
        
        // Close on escape key
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !popup.classList.contains('hidden')) {
                popup.classList.add('hidden');
            }
        });
        
        // Close on outside click
        window.addEventListener('click', (e) => {
            // Check if popup is open and click is outside popup content
            if (!popup.classList.contains('hidden')) {
                const popupContent = popup.querySelector('.popup-header')?.parentElement;
                const clickedExpander = e.target.closest('#element-expander');
                
                // Don't close if clicking the expander button or inside popup
                if (!clickedExpander && !e.target.closest('#element-popup')) {
                    popup.classList.add('hidden');
                }
            }
        });
        
        // Tab switching
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const category = btn.dataset.category;
                currentCategory = category;
                
                // Update active tab
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Repopulate grid
                populateGrid(category);
            });
        });

        // --- Sliders ---
        const brushSizeSlider = document.getElementById('brush-size');
        const eraserSizeSlider = document.getElementById('eraser-size');
        const brushPreview = document.getElementById('brush-size-preview');
        const eraserPreview = document.getElementById('eraser-size-preview');
        
        let brushPreviewActive = false;
        
        brushSizeSlider.addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
            
            // Show preview immediately on first input if not already visible
            if (!brushPreviewActive) {
                brushPreview.classList.add('visible');
                brushPreviewActive = true;
            }
            
            // Update size instantly with no delay - brushSize is diameter in cells
            const diameter = this.brushSize * this.simScale;
            const sizeText = this.brushSize + 'px';
            brushPreview.style.width = diameter + 'px';
            brushPreview.style.height = diameter + 'px';
            brushPreview.textContent = sizeText;
            brushPreview.setAttribute('data-size', sizeText);
            
            // Position text outside for small sizes, inside for larger sizes
            if (this.brushSize < 10) {
                brushPreview.classList.add('text-outside');
            } else {
                brushPreview.classList.remove('text-outside');
            }
            
            // Auto-select brush tool when adjusting size
            if (this.activeTool !== 'brush') {
                this.setActiveTool('brush');
                this.updateToolUI('brush');
            }
            this.updateCursorVisuals();
        });
        
        brushSizeSlider.addEventListener('mousedown', () => {
            brushPreviewActive = true;
            this.showSizePreview(brushPreview, this.brushSize);
        });
        
        brushSizeSlider.addEventListener('mouseup', () => {
            brushPreviewActive = false;
            this.hideSizePreview(brushPreview);
        });
        
        brushSizeSlider.addEventListener('mouseleave', () => {
            brushPreviewActive = false;
            this.hideSizePreview(brushPreview);
        });
        
        // Touch support for brush
        brushSizeSlider.addEventListener('touchstart', () => {
            brushPreviewActive = true;
            this.showSizePreview(brushPreview, this.brushSize);
        });
        
        brushSizeSlider.addEventListener('touchend', () => {
            brushPreviewActive = false;
            this.hideSizePreview(brushPreview);
        });

        let eraserPreviewActive = false;
        
        eraserSizeSlider.addEventListener('input', (e) => {
            this.eraserSize = parseInt(e.target.value);
            
            // Show preview immediately on first input if not already visible
            if (!eraserPreviewActive) {
                eraserPreview.classList.add('visible');
                eraserPreviewActive = true;
            }
            
            // Update size instantly with no delay - eraserSize is diameter in cells
            const diameter = this.eraserSize * this.simScale;
            const sizeText = this.eraserSize + 'px';
            eraserPreview.style.width = diameter + 'px';
            eraserPreview.style.height = diameter + 'px';
            eraserPreview.textContent = sizeText;
            eraserPreview.setAttribute('data-size', sizeText);
            
            // Position text outside for small sizes, inside for larger sizes
            if (this.eraserSize < 10) {
                eraserPreview.classList.add('text-outside');
            } else {
                eraserPreview.classList.remove('text-outside');
            }
            
            // Auto-select eraser tool when adjusting size
            if (this.activeTool !== 'eraser') {
                this.setActiveTool('eraser');
                this.updateToolUI('eraser');
            }
            this.updateCursorVisuals();
        });
        
        eraserSizeSlider.addEventListener('mousedown', () => {
            eraserPreviewActive = true;
            this.showSizePreview(eraserPreview, this.eraserSize);
        });
        
        eraserSizeSlider.addEventListener('mouseup', () => {
            eraserPreviewActive = false;
            this.hideSizePreview(eraserPreview);
        });
        
        eraserSizeSlider.addEventListener('mouseleave', () => {
            eraserPreviewActive = false;
            this.hideSizePreview(eraserPreview);
        });
        
        // Touch support for eraser
        eraserSizeSlider.addEventListener('touchstart', () => {
            eraserPreviewActive = true;
            this.showSizePreview(eraserPreview, this.eraserSize);
        });
        
        eraserSizeSlider.addEventListener('touchend', () => {
            eraserPreviewActive = false;
            this.hideSizePreview(eraserPreview);
        });

        const gridSizeSlider = document.getElementById('grid-size');
        const gridPreview = document.getElementById('grid-size-preview');
        let gridPreviewActive = false;
        
        gridSizeSlider.addEventListener('input', (e) => {
            const newSimScale = parseInt(e.target.value);
            
            // Show preview immediately on first input if not already visible
            if (!gridPreviewActive) {
                gridPreview.classList.add('visible');
                gridPreviewActive = true;
            }
            
            // Update preview instantly - square size matches actual cell size
            gridPreview.style.width = newSimScale + 'px';
            gridPreview.style.height = newSimScale + 'px';
            
            // Calculate scale multiplier (simScale / 4, where 4 is the base)
            const scaleMultiplier = (newSimScale / 4).toFixed(1);
            gridPreview.setAttribute('data-scale', scaleMultiplier);
            
            // Update simScale if changed
            if (newSimScale !== this.simScale) {
                this.simScale = newSimScale;
                this.updateSimScale();
            }
        });
        
        gridSizeSlider.addEventListener('mousedown', () => {
            gridPreviewActive = true;
            const currentScale = parseInt(gridSizeSlider.value);
            gridPreview.style.width = currentScale + 'px';
            gridPreview.style.height = currentScale + 'px';
            const scaleMultiplier = (currentScale / 4).toFixed(1);
            gridPreview.setAttribute('data-scale', scaleMultiplier);
            gridPreview.classList.add('visible');
        });
        
        gridSizeSlider.addEventListener('mouseup', () => {
            gridPreviewActive = false;
            gridPreview.classList.remove('visible');
        });
        
        gridSizeSlider.addEventListener('mouseleave', () => {
            gridPreviewActive = false;
            gridPreview.classList.remove('visible');
        });
        
        gridSizeSlider.addEventListener('touchstart', () => {
            gridPreviewActive = true;
            const currentScale = parseInt(gridSizeSlider.value);
            gridPreview.style.width = currentScale + 'px';
            gridPreview.style.height = currentScale + 'px';
            const scaleMultiplier = (currentScale / 4).toFixed(1);
            gridPreview.setAttribute('data-scale', scaleMultiplier);
            gridPreview.classList.add('visible');
        });
        
        gridSizeSlider.addEventListener('touchend', () => {
            gridPreviewActive = false;
            gridPreview.classList.remove('visible');
        });

        // --- Control Bar ---
        const playPauseBtn = document.getElementById('play-pause');
        const stepBackwardBtn = document.getElementById('step-backward');
        const stepForwardBtn = document.getElementById('step-forward');
        
        playPauseBtn.addEventListener('click', () => {
            this.togglePause();
        });
        
        stepBackwardBtn.addEventListener('click', () => {
            this.stepBackward();
        });
        
        stepForwardBtn.addEventListener('click', () => {
            this.stepForward();
        });
        
        // --- Keyboard Shortcuts ---
        // Track key hold time for variable speed size adjustment
        this.keyHoldStart = {};
        this.keyHoldInterval = {};
        
        // Track D key hold for clear canvas
        this.clearHoldStart = null;
        this.clearHoldAnimationId = null;
        
        window.addEventListener('keydown', (e) => {
            // Spacebar: Pause/Play
            if (e.code === 'Space') {
                e.preventDefault();
                this.togglePause();
            }
            // Left Arrow: Step Backward
            else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                this.stepBackward();
            }
            // Right Arrow: Step Forward
            else if (e.code === 'ArrowRight') {
                e.preventDefault();
                this.stepForward();
            }
            // B: Brush Tool
            else if (e.key === 'b' || e.key === 'B') {
                this.activeTool = 'brush';
                this.updateToolUI('brush');
                this.updateCursorVisuals();
                if (this.lastMouseEvent) {
                    this.updateStatusPill(this.lastMouseEvent);
                }
            }
            // E: Eraser Tool
            else if (e.key === 'e' || e.key === 'E') {
                this.activeTool = 'eraser';
                this.updateToolUI('eraser');
                this.updateCursorVisuals();
                if (this.lastMouseEvent) {
                    this.updateStatusPill(this.lastMouseEvent);
                }
            }
            // F: Fill Tool
            else if (e.key === 'f' || e.key === 'F') {
                this.activeTool = 'fill';
                this.updateToolUI('fill');
                this.updateCursorVisuals();
                if (this.lastMouseEvent) {
                    this.updateStatusPill(this.lastMouseEvent);
                }
            }
            // I: Picker Tool
            else if (e.key === 'i' || e.key === 'I') {
                this.activeTool = 'picker';
                this.updateToolUI('picker');
                this.updateCursorVisuals();
                if (this.lastMouseEvent) {
                    this.updateStatusPill(this.lastMouseEvent);
                }
            }
            // D: Clear Canvas (Hold for 0.5 seconds)
            else if ((e.key === 'd' || e.key === 'D') && !e.repeat) {
                if (!this.clearHoldStart) {
                    this.clearHoldStart = Date.now();
                    const trashIcon = document.querySelector('.tool-wrapper[data-tool="trash"] .tool-icon');
                    
                    // Start smooth progress animation with requestAnimationFrame
                    const animateProgress = () => {
                        const holdTime = Date.now() - this.clearHoldStart;
                        const progress = Math.min(holdTime / 500, 1); // 0 to 1 over 0.5 seconds
                        
                        // Update visual progress
                        trashIcon.style.setProperty('--clear-progress', progress);
                        trashIcon.classList.add('clearing');
                        
                        // Clear canvas after 0.5 seconds
                        if (progress >= 1) {
                            this.clearCanvas();
                            this.resetClearProgress();
                        } else {
                            // Continue animation
                            this.clearHoldAnimationId = requestAnimationFrame(animateProgress);
                        }
                    };
                    
                    this.clearHoldAnimationId = requestAnimationFrame(animateProgress);
                }
            }
            // Ctrl+G: Toggle Grid
            else if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
                e.preventDefault();
                this.toggleGrid();
            }
            // [: Decrease Size (Variable Speed)
            else if (e.key === '[') {
                e.preventDefault();
                
                // Only start if not already holding
                if (!this.keyHoldStart['[']) {
                    this.keyHoldStart['['] = Date.now();
                    
                    // Initial decrease
                    this.adjustSize(-1);
                    
                    // Set up interval for continuous adjustment
                    this.keyHoldInterval['['] = setInterval(() => {
                        const holdTime = Date.now() - this.keyHoldStart['['];
                        // Speed increases with hold time: 1x → 2x → 3x → 5x
                        // 0-500ms: 1x, 500-1000ms: 2x, 1000-1500ms: 3x, 1500ms+: 5x
                        let speed = 1;
                        if (holdTime > 1500) speed = 5;
                        else if (holdTime > 1000) speed = 3;
                        else if (holdTime > 500) speed = 2;
                        
                        this.adjustSize(-speed);
                    }, 50); // Check every 50ms
                }
            }
            // ]: Increase Size (Variable Speed)
            else if (e.key === ']') {
                e.preventDefault();
                
                // Only start if not already holding
                if (!this.keyHoldStart[']']) {
                    this.keyHoldStart[']'] = Date.now();
                    
                    // Initial increase
                    this.adjustSize(1);
                    
                    // Set up interval for continuous adjustment
                    this.keyHoldInterval[']'] = setInterval(() => {
                        const holdTime = Date.now() - this.keyHoldStart[']'];
                        // Speed increases with hold time: 1x → 2x → 3x → 5x
                        // 0-500ms: 1x, 500-1000ms: 2x, 1000-1500ms: 3x, 1500ms+: 5x
                        let speed = 1;
                        if (holdTime > 1500) speed = 5;
                        else if (holdTime > 1000) speed = 3;
                        else if (holdTime > 500) speed = 2;
                        
                        this.adjustSize(speed);
                    }, 50); // Check every 50ms
                }
            }
        });
        
        // Stop size adjustment when key is released
        window.addEventListener('keyup', (e) => {
            if (e.key === '[' || e.key === ']') {
                // Clear interval
                if (this.keyHoldInterval[e.key]) {
                    clearInterval(this.keyHoldInterval[e.key]);
                    delete this.keyHoldInterval[e.key];
                }
                // Clear hold start time
                if (this.keyHoldStart[e.key]) {
                    delete this.keyHoldStart[e.key];
                }
            }
            
            // Cancel clear canvas if D is released early
            if (e.key === 'd' || e.key === 'D') {
                this.resetClearProgress();
            }
            
            // Hide shortcut hints when Ctrl is released
            if (e.key === 'Control' || e.key === 'Meta') {
                document.body.classList.remove('show-shortcuts');
            }
        });
        
        // Show shortcut hints when Ctrl is held (without triggering shortcuts)
        window.addEventListener('keydown', (e) => {
            if ((e.key === 'Control' || e.key === 'Meta') && !e.repeat) {
                document.body.classList.add('show-shortcuts');
            }
        }, true); // Use capture phase to catch before other handlers

        // Initial Cursor Setup
        this.updateCursorVisuals();
    }
    
    
    setupMouseEvents() {
        // Canvas mouse events
        this.canvas.addEventListener('mousedown', (e) => {
            this.isMouseDown = true;
            this.mouseDownTime = performance.now();
            this.continuousDrawEnabled = false; // Start disabled
            this.mouseDownX = e.clientX;
            this.mouseDownY = e.clientY;
            this.updateMousePosition(e);
            
            // Save action state for undo/redo (for brush/eraser)
            if (!this.isRestoringAction && (this.activeTool === 'brush' || this.activeTool === 'eraser')) {
                this.saveActionState();
                this.isDragging = true;
            }
            
            // Don't draw on initial click - wait for mouseup or delay
            // Only handle fill/picker tools immediately
            if (this.activeTool === 'fill' || this.activeTool === 'picker') {
                this.handleToolAction(e);
            }
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            this.updateMousePosition(e);
            
            // Check if user started dragging - enable continuous draw immediately
            if (this.isMouseDown && !this.continuousDrawEnabled && 
                (this.activeTool === 'brush' || this.activeTool === 'eraser')) {
                const dx = e.clientX - this.mouseDownX;
                const dy = e.clientY - this.mouseDownY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance >= this.dragThreshold) {
                    this.continuousDrawEnabled = true;
                }
            }
            
            // Activate shift-drag if shift is pressed and mouse has moved beyond dragThreshold
            if (e.shiftKey && this.isMouseDown && !this.shiftDragActive && 
                (this.activeTool === 'brush' || this.activeTool === 'eraser')) {
                const dx = e.clientX - this.mouseDownX;
                const dy = e.clientY - this.mouseDownY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance >= this.dragThreshold) {
                    this.shiftDragActive = true;
                    this.shiftDragAxis = null; // Will be determined on next move
                    this.shiftDragStartX = this.lastDrawX !== null ? this.lastDrawX : this.mouseX;
                    this.shiftDragStartY = this.lastDrawY !== null ? this.lastDrawY : this.mouseY;
                }
            }
            
            // Handle shift-drag axis constraint
            if (this.shiftDragActive && this.isMouseDown && e.shiftKey) {
                this.applyAxisConstraint();
            } else if (this.shiftDragActive && (!this.isMouseDown || !e.shiftKey)) {
                // Reset if shift released or mouse up
                this.shiftDragActive = false;
                this.shiftDragAxis = null;
            }
            
            this.updateCursorPosition(e);
        });
        
        window.addEventListener('mouseup', (e) => {
            // If mouse was released before continuous draw enabled, draw once
            // OR if shift is held (for shift-click line drawing)
            if (this.isMouseDown && !this.continuousDrawEnabled && 
                (this.activeTool === 'brush' || this.activeTool === 'eraser')) {
                // This was a quick click - draw once at release
                this.handleToolAction(e);
            } else if (this.isMouseDown && e.shiftKey && 
                !this.shiftDragActive &&
                (this.activeTool === 'brush' || this.activeTool === 'eraser')) {
                // Shift-click line drawing - handle only if shift-drag was not active
                this.handleToolAction(e);
            }
            
            this.isMouseDown = false;
            this.continuousDrawEnabled = false;
            this.lastDrawX = null;
            this.lastDrawY = null;
            
            // Finalize action for undo (save delta to history)
            if (this.isDragging) {
                this.finalizeAction();
            }
            this.isDragging = false; // Reset drag flag for next action
            
            // Reset shift-drag state
            this.shiftDragActive = false;
            this.shiftDragAxis = null;
            this.shiftDragStartX = null;
            this.shiftDragStartY = null;
            
            // Store last click position and size for shift-click line drawing
            if (this.activeTool === 'brush' || this.activeTool === 'eraser') {
                this.lastClickX = this.mouseX;
                this.lastClickY = this.mouseY;
                this.lastClickSize = this.activeTool === 'brush' ? this.brushSize : this.eraserSize;
                this.lastClickTool = this.activeTool;
            }
        });
        
        // Global mouse move to track cursor visibility
        window.addEventListener('mousemove', (e) => {
            this.updateCursorPosition(e);
            this.updateCursorVisibility(e);
        });
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.isMouseDown = true;
            this.mouseDownTime = performance.now();
            this.continuousDrawEnabled = false; // Start disabled
            const touch = e.touches[0];
            this.mouseDownX = touch.clientX;
            this.mouseDownY = touch.clientY;
            this.updateMousePosition(touch);
            
            // Save action state for undo/redo (for brush/eraser)
            if (!this.isRestoringAction && (this.activeTool === 'brush' || this.activeTool === 'eraser')) {
                this.saveActionState();
                this.isDragging = true;
            }
            
            // Don't draw on initial touch - wait for touchend or delay
            // Only handle fill/picker tools immediately
            if (this.activeTool === 'fill' || this.activeTool === 'picker') {
                this.handleToolAction(e);
            }
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.updateMousePosition(touch);
            
            // Check if user started dragging - enable continuous draw immediately
            if (this.isMouseDown && !this.continuousDrawEnabled && 
                (this.activeTool === 'brush' || this.activeTool === 'eraser')) {
                const dx = touch.clientX - this.mouseDownX;
                const dy = touch.clientY - this.mouseDownY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance >= this.dragThreshold) {
                    this.continuousDrawEnabled = true;
                }
            }
            
            // Activate shift-drag if shift is pressed and touch has moved beyond dragThreshold
            if (e.shiftKey && this.isMouseDown && !this.shiftDragActive && 
                (this.activeTool === 'brush' || this.activeTool === 'eraser')) {
                const dx = touch.clientX - this.mouseDownX;
                const dy = touch.clientY - this.mouseDownY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance >= this.dragThreshold) {
                    this.shiftDragActive = true;
                    this.shiftDragAxis = null;
                    this.shiftDragStartX = this.lastDrawX !== null ? this.lastDrawX : this.mouseX;
                    this.shiftDragStartY = this.lastDrawY !== null ? this.lastDrawY : this.mouseY;
                }
            }
            
            // Handle shift-drag axis constraint for touch
            if (this.shiftDragActive && this.isMouseDown && e.shiftKey) {
                this.applyAxisConstraint();
            } else if (this.shiftDragActive && (!this.isMouseDown || !e.shiftKey)) {
                this.shiftDragActive = false;
                this.shiftDragAxis = null;
            }
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            // If touch was released before continuous draw enabled, draw once
            if (this.isMouseDown && !this.continuousDrawEnabled && 
                (this.activeTool === 'brush' || this.activeTool === 'eraser')) {
                // This was a quick tap - draw once at release
                // Touch events don't have shiftKey, so we check keyboard state
                this.handleToolAction({ clientX: this.mouseX, clientY: this.mouseY, shiftKey: e.shiftKey || false });
            }
            
            this.isMouseDown = false;
            this.continuousDrawEnabled = false;
            this.lastDrawX = null;
            this.lastDrawY = null;
            
            // Finalize action for undo (save delta to history)
            if (this.isDragging) {
                this.finalizeAction();
            }
            this.isDragging = false; // Reset drag flag for next action
            
            // Reset shift-drag state
            this.shiftDragActive = false;
            this.shiftDragAxis = null;
            this.shiftDragStartX = null;
            this.shiftDragStartY = null;
            
            // Store last click position and size for shift-click line drawing
            if (this.activeTool === 'brush' || this.activeTool === 'eraser') {
                this.lastClickX = this.mouseX;
                this.lastClickY = this.mouseY;
                this.lastClickSize = this.activeTool === 'brush' ? this.brushSize : this.eraserSize;
                this.lastClickTool = this.activeTool;
            }
        });
    }
    
    
    updateMousePosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.gridWidth / rect.width;
        const scaleY = this.gridHeight / rect.height;
        
        this.mouseX = Math.floor((e.clientX - rect.left) * scaleX);
        this.mouseY = Math.floor((e.clientY - rect.top) * scaleY);
    }
    
    
    applyAxisConstraint() {
        // Constrain mouse position to horizontal or vertical axis during shift-drag
        if (this.shiftDragStartX === null || this.shiftDragStartY === null) return;
        
        // Determine axis on first significant movement
        if (this.shiftDragAxis === null) {
            const dx = Math.abs(this.mouseX - this.shiftDragStartX);
            const dy = Math.abs(this.mouseY - this.shiftDragStartY);
            
            // Need at least 3 pixels of movement to determine axis
            if (dx > 2 || dy > 2) {
                // Lock to the axis with more movement
                this.shiftDragAxis = dx > dy ? 'x' : 'y';
            }
        }
        
        // Apply constraint based on locked axis
        if (this.shiftDragAxis === 'x') {
            // Lock to horizontal line
            this.mouseY = this.shiftDragStartY;
        } else if (this.shiftDragAxis === 'y') {
            // Lock to vertical line
            this.mouseX = this.shiftDragStartX;
        }
    }

    updateToolUI(toolName) {
        document.querySelectorAll('.tool-icon').forEach(el => el.classList.remove('active'));
        const wrapper = document.querySelector(`.tool-wrapper[data-tool="${toolName}"]`);
        if (wrapper) {
            wrapper.querySelector('.tool-icon').classList.add('active');
        }
    }

    setActiveTool(tool) {
        this.activeTool = tool;
        this.updateCursorVisuals();
    }

    toggleGrid() {
        this.showGrid = !this.showGrid;
        const gridIcon = document.querySelector('.tool-wrapper[data-tool="grid"] .tool-icon');
        gridIcon.classList.toggle('active', this.showGrid);
        
        // Clear grid canvas when toggled off
        if (!this.showGrid) {
            const canvasWidth = this.gridWidth * this.simScale;
            const canvasHeight = this.gridHeight * this.simScale;
            this.gridCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        }
    }
    
    togglePause() {
        this.isPaused = !this.isPaused;
        const playPauseBtn = document.getElementById('play-pause');
        const icon = playPauseBtn.querySelector('i');
        
        if (this.isPaused) {
            icon.className = 'fas fa-play';
        } else {
            icon.className = 'fas fa-pause';
            // When resuming, return to live mode
            this.currentHistoryIndex = -1;
        }
        
        this.updateStepButtonStates();
    }
    
    stepBackward() {
        if (this.frameHistory.length === 0) return;
        
        // If in live mode, start from the most recent frame
        if (this.currentHistoryIndex === -1) {
            this.currentHistoryIndex = this.frameHistory.length - 1;
        } else if (this.currentHistoryIndex > 0) {
            this.currentHistoryIndex--;
        }
        
        // Restore the frame
        this.restoreFrame(this.currentHistoryIndex);
        this.updateStepButtonStates();
    }
    
    stepForward() {
        // If in live mode (paused), run one simulation step
        if (this.currentHistoryIndex === -1) {
            if (!this.isPaused) return; // Can't step forward if playing
            
            // Run a single update
            this.update(16); // ~60fps frame time
            this.saveFrame();
            this.frameCount++;
        } else {
            // Viewing history - move forward
            this.currentHistoryIndex++;
            
            // If we've reached the end, return to live mode
            if (this.currentHistoryIndex >= this.frameHistory.length) {
                this.currentHistoryIndex = -1;
            } else {
                // Restore the frame
                this.restoreFrame(this.currentHistoryIndex);
            }
        }
        
        this.updateStepButtonStates();
    }
    
    updateStepButtonStates() {
        const stepBackwardBtn = document.getElementById('step-backward');
        const stepForwardBtn = document.getElementById('step-forward');
        
        // Backward is disabled if no history or at the oldest frame
        if (this.frameHistory.length === 0 || 
            (this.currentHistoryIndex !== -1 && this.currentHistoryIndex === 0)) {
            stepBackwardBtn.classList.add('disabled');
        } else {
            stepBackwardBtn.classList.remove('disabled');
        }
        
        // Forward is disabled only if playing in live mode
        // Enabled when: paused in live mode OR viewing history (not at end)
        if (this.currentHistoryIndex === -1) {
            // In live mode - enable only if paused
            if (this.isPaused) {
                stepForwardBtn.classList.remove('disabled');
            } else {
                stepForwardBtn.classList.add('disabled');
            }
        } else {
            // Viewing history - always enabled
            stepForwardBtn.classList.remove('disabled');
        }
    }
    
    saveFrame() {
        // Only save frames when in live mode
        if (this.currentHistoryIndex !== -1) return;
        
        // Create a snapshot of the current state
        const frame = {
            cells: new Uint8Array(this.cells),
            variations: new Uint8Array(this.variations),
            life: new Uint16Array(this.life),
            moved: new Uint8Array(this.moved)
        };
        
        this.frameHistory.push(frame);
        
        // Remove oldest frames if we exceed the limit
        if (this.frameHistory.length > this.maxHistoryFrames) {
            this.frameHistory.shift();
        }
        
        this.updateStepButtonStates();
    }
    
    restoreFrame(index) {
        if (index < 0 || index >= this.frameHistory.length) return;
        
        const frame = this.frameHistory[index];
        this.cells.set(frame.cells);
        this.variations.set(frame.variations);
        this.life.set(frame.life);
        this.moved.set(frame.moved);
    }
    
    
    updateSimScale() {
        // Recalculate grid dimensions based on new simScale
        this.gridWidth = Math.floor(this.width / this.simScale);
        this.gridHeight = Math.floor(this.height / this.simScale);
        
        if (this.gridWidth < 1) this.gridWidth = 1;
        if (this.gridHeight < 1) this.gridHeight = 1;
        
        // Update canvas size to match new grid dimensions
        this.canvas.width = this.gridWidth;
        this.canvas.height = this.gridHeight;
        
        // Scale canvas display to fill screen
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';
        
        // Disable image smoothing for crisp pixels
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.msImageSmoothingEnabled = false;
        this.ctx.webkitImageSmoothingEnabled = false;
        
        // Update grid canvas to match the exact scaled canvas dimensions
        this.gridCanvas.width = this.gridWidth * this.simScale;
        this.gridCanvas.height = this.gridHeight * this.simScale;
        this.gridCanvas.style.width = this.width + 'px';
        this.gridCanvas.style.height = this.height + 'px';
        this.gridCtx.imageSmoothingEnabled = false;
        
        // Reinitialize simulation arrays with new dimensions
        this.initArrays();
        
        // Update ImageData for new grid size
        this.imgData = this.ctx.createImageData(this.gridWidth, this.gridHeight);
        this.data = new Uint32Array(this.imgData.data.buffer);
        
        // Update cursor visuals to match new scale
        this.updateCursorVisuals();
        
        console.log(`Grid updated: ${this.gridWidth}x${this.gridHeight} (Scale: ${this.simScale}px)`);
    }

    clearCanvas() {
        // Save state before clearing (for undo)
        if (!this.isRestoringAction) {
            this.saveActionState();
            
            // Record all non-empty particles for removal
            for (let i = 0; i < this.cellCount; i++) {
                if (this.cells[i] !== TYPE.EMPTY && this.particleId[i] > 0) {
                    // Add existing particle IDs to the action
                    this.createdParticles.add(this.particleId[i]);
                }
            }
        }
        
        // Clear all simulation data
        this.cells.fill(TYPE.EMPTY);
        this.life.fill(0);
        this.particleId.fill(0);
        this.minActiveY = this.gridHeight - 1;
        
        // Shake Animation
        const canvas = this.canvas;
        canvas.classList.add('shake-anim');
        setTimeout(() => {
            canvas.classList.remove('shake-anim');
        }, 400);
        
        // Finalize action for undo (save delta to history)
        if (!this.isRestoringAction) {
            this.finalizeAction();
        }
    }

    
    // ========================================================================
    // CURSOR & STATUS PILL
    // ========================================================================
    
    // ========================================================================
    // UNDO/REDO SYSTEM
    // ========================================================================
    
    saveActionState() {
        // Clear the created particles set for the new action
        this.createdParticles.clear();
    }
    
    
    recordParticleCreation(idx, type) {
        // Assign a unique ID to this particle and track it
        if (!this.isRestoringAction && type !== TYPE.EMPTY) {
            const particleId = this.nextParticleId++;
            this.particleId[idx] = particleId;
            this.createdParticles.add(particleId);
        } else if (type === TYPE.EMPTY) {
            // Clearing a cell
            this.particleId[idx] = 0;
        }
    }
    
    
    finalizeAction() {
        // Called when action is complete (mouseup, after fill, after clear)
        // Only save if particles were actually created/removed
        if (this.createdParticles.size === 0) return;
        
        // If we're in the middle of history (after undo), discard redo states
        if (this.currentActionIndex < this.actionHistory.length - 1) {
            this.actionHistory = this.actionHistory.slice(0, this.currentActionIndex + 1);
        }
        
        // Store full particle data for redo support
        const particleData = new Map();
        for (let i = 0; i < this.cellCount; i++) {
            const id = this.particleId[i];
            if (this.createdParticles.has(id)) {
                particleData.set(id, {
                    type: this.cells[i],
                    life: this.life[i],
                    variation: this.variations[i],
                    position: i
                });
            }
        }
        
        // Create action record with particle IDs and data
        const action = {
            particleIds: new Set(this.createdParticles), // Copy the set
            particleData: particleData, // Store particle data for redo
            timestamp: Date.now()
        };
        
        this.actionHistory.push(action);
        this.currentActionIndex++;
        
        // Limit history size
        if (this.actionHistory.length > this.maxActionHistory) {
            this.actionHistory.shift();
            this.currentActionIndex--;
        }
        
        // Clear for next action
        this.createdParticles.clear();
        
        console.log(`Action saved: ${action.particleIds.size} particles created`);
    }
    
    
    undo() {
        // Can't undo if at the beginning or no history
        if (this.currentActionIndex < 0 || this.actionHistory.length === 0) {
            console.log('Nothing to undo');
            return;
        }
        
        this.isRestoringAction = true;
        
        // Get the action to undo
        const action = this.actionHistory[this.currentActionIndex];
        
        // Find and remove all particles with these IDs, wherever they are now
        let removedCount = 0;
        for (let i = 0; i < this.cellCount; i++) {
            if (action.particleIds.has(this.particleId[i])) {
                this.cells[i] = TYPE.EMPTY;
                this.life[i] = 0;
                this.variations[i] = 0;
                this.particleId[i] = 0;
                removedCount++;
            }
        }
        
        this.currentActionIndex--;
        
        // Wake up affected regions
        this.minActiveY = 0;
        
        this.isRestoringAction = false;
        
        console.log(`Undo: ${this.currentActionIndex + 1}/${this.actionHistory.length} (${removedCount} particles removed)`);
    }
    
    
    redo() {
        // Can't redo if at the end
        if (this.currentActionIndex >= this.actionHistory.length - 1) {
            console.log('Nothing to redo');
            return;
        }
        
        this.isRestoringAction = true;
        
        this.currentActionIndex++;
        
        // Get the action to redo
        const action = this.actionHistory[this.currentActionIndex];
        
        // Recreate particles at their current positions (where they were when action was saved)
        let recreatedCount = 0;
        for (const [particleId, data] of action.particleData) {
            const idx = data.position;
            
            // Only recreate if position is currently empty or we can overwrite
            if (idx >= 0 && idx < this.cellCount) {
                this.cells[idx] = data.type;
                this.life[idx] = data.life;
                this.variations[idx] = data.variation;
                this.particleId[idx] = particleId;
                recreatedCount++;
            }
        }
        
        // Wake up affected regions
        this.minActiveY = 0;
        
        this.isRestoringAction = false;
        
        console.log(`Redo: ${this.currentActionIndex + 1}/${this.actionHistory.length} (${recreatedCount} particles recreated)`);
    }
    
    
    updateCursorPosition(e) {
        const customCursor = document.getElementById('custom-cursor');
        const statusPill = document.getElementById('status-pill');
        
        customCursor.style.left = `${e.clientX}px`;
        customCursor.style.top = `${e.clientY}px`;
        
        // Store last mouse event for keyboard shortcut updates
        this.lastMouseEvent = e;
        
        // Update status pill position and content
        this.updateStatusPill(e);
    }
    
    
    updateCursorVisibility(e) {
        const customCursor = document.getElementById('custom-cursor');
        
        // Check if mouse is over any glass panel (UI element)
        const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
        const isOverUI = elementAtPoint && (
            elementAtPoint.closest('.glass-panel') !== null ||
            elementAtPoint.classList.contains('glass-panel')
        );
        
        if (isOverUI) {
            customCursor.style.display = 'none';
        } else {
            customCursor.style.display = 'block';
        }
    }
    
    
    showSizePreview(previewElement, size) {
        if (!previewElement) return;
        
        // size is diameter in cells, scale to screen pixels
        const diameter = size * this.simScale;
        const sizeText = size + 'px';
        
        previewElement.style.width = diameter + 'px';
        previewElement.style.height = diameter + 'px';
        previewElement.textContent = sizeText;
        previewElement.setAttribute('data-size', sizeText);
        
        // Position text outside for small sizes
        if (size < 10) {
            previewElement.classList.add('text-outside');
        } else {
            previewElement.classList.remove('text-outside');
        }
        
        previewElement.classList.add('visible');
    }
    
    
    updateSizePreview(previewElement, size) {
        if (!previewElement) return;
        
        // size is diameter in cells, scale to screen pixels
        const diameter = size * this.simScale;
        const sizeText = size + 'px';
        
        previewElement.style.width = diameter + 'px';
        previewElement.style.height = diameter + 'px';
        previewElement.textContent = sizeText;
        previewElement.setAttribute('data-size', sizeText);
        
        // Position text outside for small sizes
        if (size < 10) {
            previewElement.classList.add('text-outside');
        } else {
            previewElement.classList.remove('text-outside');
        }
    }
    
    
    hideSizePreview(previewElement) {
        if (!previewElement) return;
        previewElement.classList.remove('visible');
    }
    
    adjustSize(amount) {
        // Adjust size based on active tool
        if (this.activeTool === 'brush') {
            this.brushSize = Math.max(1, Math.min(50, this.brushSize + amount));
            document.getElementById('brush-size').value = this.brushSize;
        } else if (this.activeTool === 'eraser') {
            this.eraserSize = Math.max(1, Math.min(50, this.eraserSize + amount));
            document.getElementById('eraser-size').value = this.eraserSize;
        }
        
        // Update all UI elements
        this.updateCursorVisuals();
        if (this.lastMouseEvent) {
            this.updateStatusPill(this.lastMouseEvent);
        }
    }
    
    resetClearProgress() {
        // Stop clear animation
        if (this.clearHoldAnimationId) {
            cancelAnimationFrame(this.clearHoldAnimationId);
            this.clearHoldAnimationId = null;
        }
        
        // Reset hold start time
        this.clearHoldStart = null;
        
        // Reset visual state
        const trashIcon = document.querySelector('.tool-wrapper[data-tool="trash"] .tool-icon');
        if (trashIcon) {
            trashIcon.style.setProperty('--clear-progress', 0);
            trashIcon.classList.remove('clearing');
        }
    }

    updateCursorVisuals() {
        this.cursorEl.className = ''; // Reset classes
        this.cursorEl.innerHTML = ''; // Clear icons

        if (this.activeTool === 'brush') {
            // brushSize is now diameter in cells, scale to screen pixels
            const diameter = this.brushSize * this.simScale;
            this.cursorEl.style.width = `${diameter}px`;
            this.cursorEl.style.height = `${diameter}px`;
            this.cursorEl.style.borderRadius = '50%';
            
            // Add crosshair for larger brushes
            if (this.brushSize > 10) {
                this.cursorEl.classList.add('with-crosshair');
            }
        } else if (this.activeTool === 'eraser') {
            // eraserSize is now diameter in cells, scale to screen pixels
            const diameter = this.eraserSize * this.simScale;
            this.cursorEl.style.width = `${diameter}px`;
            this.cursorEl.style.height = `${diameter}px`;
            this.cursorEl.style.borderRadius = '50%';
            
            // Add crosshair for larger erasers
            if (this.eraserSize > 10) {
                this.cursorEl.classList.add('with-crosshair');
            }
        } else if (this.activeTool === 'fill') {
            this.setCursorIcon('fa-fill-drip');
        } else if (this.activeTool === 'picker') {
            this.setCursorIcon('fa-eye-dropper');
        }
    }

    setCursorIcon(iconClass) {
        this.cursorEl.classList.add('icon-mode');
        this.cursorEl.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
        this.cursorEl.style.width = 'auto';
        this.cursorEl.style.height = 'auto';
    }

    updateStatusPill(e) {
        const statusPill = document.getElementById('status-pill');
        const statusToolIcon = document.getElementById('status-tool-icon');
        const statusElementDot = document.getElementById('status-element-dot');
        const statusSize = document.getElementById('status-size');
        
        // Calculate cursor size for offset adjustment
        // brushSize/eraserSize is now diameter in cells, convert to screen pixels
        let cursorDiameter = 0;
        if (this.activeTool === 'brush') {
            cursorDiameter = this.brushSize * this.simScale;
        } else if (this.activeTool === 'eraser') {
            cursorDiameter = this.eraserSize * this.simScale;
        }
        
        // Position pill to avoid overlapping with cursor
        // Offset = half the cursor diameter + padding
        const baseOffset = 20;
        const dynamicOffset = (cursorDiameter / 2) + 15; // Half diameter + padding
        const finalOffset = Math.max(baseOffset, dynamicOffset);
        
        statusPill.style.left = `${e.clientX + finalOffset}px`;
        statusPill.style.top = `${e.clientY - 15}px`;
        
        // Update content based on active tool
        statusToolIcon.innerHTML = '';
        statusElementDot.style.backgroundColor = '';
        statusSize.textContent = '';
        
        if (this.activeTool === 'brush') {
            statusToolIcon.innerHTML = '<i class="fa-solid fa-paintbrush"></i>';
            statusElementDot.style.backgroundColor = this.getElementColor(this.activeElement);
            statusSize.textContent = `${this.brushSize}px`;
            statusElementDot.style.display = 'block';
        } else if (this.activeTool === 'eraser') {
            statusToolIcon.innerHTML = '<i class="fa-solid fa-eraser"></i>';
            statusSize.textContent = `${this.eraserSize}px`;
            statusElementDot.style.display = 'none';
        } else if (this.activeTool === 'fill') {
            statusToolIcon.innerHTML = '<i class="fa-solid fa-fill-drip"></i>';
            statusElementDot.style.backgroundColor = this.getElementColor(this.activeElement);
            statusElementDot.style.display = 'block';
        } else if (this.activeTool === 'picker') {
            statusToolIcon.innerHTML = '<i class="fa-solid fa-eye-dropper"></i>';
            statusElementDot.style.backgroundColor = this.getElementColor(this.activeElement);
            statusElementDot.style.display = 'block';
        }
        
        // Show pill only when cursor is over canvas AND not over UI elements
        const canvasRect = this.canvas.getBoundingClientRect();
        const isOverCanvas = e.clientX >= canvasRect.left && e.clientX <= canvasRect.right &&
                            e.clientY >= canvasRect.top && e.clientY <= canvasRect.bottom;
        
        // Check if mouse is over any glass panel (UI element)
        const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
        const isOverUI = elementAtPoint && (
            elementAtPoint.closest('.glass-panel') !== null ||
            elementAtPoint.classList.contains('glass-panel')
        );
        
        statusPill.classList.toggle('visible', isOverCanvas && !isOverUI);
    }

    getElementColor(elementName) {
        const typeId = ELEMENT_MAP[elementName] || TYPE.EMPTY;
        const el = ELEMENTS[typeId];
        if (!el) return '#ffffff';
        return `rgb(${el.color[0]}, ${el.color[1]}, ${el.color[2]})`;
    }

    
    // ========================================================================
    // CANVAS & RENDERING
    // ========================================================================
    
    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        
        // Calculate grid dimensions based on scale
        this.gridWidth = Math.floor(this.width / this.simScale);
        this.gridHeight = Math.floor(this.height / this.simScale);
        
        if (this.gridWidth < 1) this.gridWidth = 1;
        if (this.gridHeight < 1) this.gridHeight = 1;
        
        // Set canvas to grid size for crisp pixels
        this.canvas.width = this.gridWidth;
        this.canvas.height = this.gridHeight;
        
        // Scale canvas display to fill screen
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';
        
        // Disable image smoothing for crisp pixels
        this.ctx.imageSmoothingEnabled = false;
        
        // Set grid canvas to match the exact scaled canvas dimensions
        // This ensures perfect alignment with the simulation cells
        this.gridCanvas.width = this.gridWidth * this.simScale;
        this.gridCanvas.height = this.gridHeight * this.simScale;
        this.gridCanvas.style.width = this.width + 'px';
        this.gridCanvas.style.height = this.height + 'px';
        this.gridCtx.imageSmoothingEnabled = false;
        
        this.initArrays();
    }

    
    // ========================================================================
    // PHYSICS SIMULATION
    // ========================================================================
    
    update(dt) {
        this.moved.fill(0);
        let newMinActiveY = this.gridHeight - 1;
        
        // Clamp active region
        if (this.minActiveY < 0) this.minActiveY = 0;
        if (this.minActiveY >= this.gridHeight) this.minActiveY = this.gridHeight - 1;
        
        const scanStart = Math.max(0, this.minActiveY - 20);
        
        // Process from bottom to top for falling elements
        for (let y = this.gridHeight - 1; y >= scanStart; y--) {
            // Randomize horizontal scan direction for natural dispersion
            const coinFlip = this.fastRand() < 0.5;
            const startX = coinFlip ? 0 : this.gridWidth - 1;
            const endX = coinFlip ? this.gridWidth : -1;
            const stepX = coinFlip ? 1 : -1;
            
            let rowHasParticles = false;
            
            for (let x = startX; x !== endX; x += stepX) {
                const i = this.getIdx(x, y);
                
                if (this.moved[i]) {
                    rowHasParticles = true;
                    continue;
                }
                
                const type = this.cells[i];
                if (type === TYPE.EMPTY) continue;
                
                rowHasParticles = true;
                const state = this.LUT_STATE[type];
                const density = this.LUT_DENSITY[type];
                
                // Get neighbor indices
                const below = y + 1 < this.gridHeight ? this.getIdx(x, y + 1) : -1;
                const dir = this.fastRand() < 0.5 ? 1 : -1;
                const leftIdx = x - 1 >= 0 ? this.getIdx(x - 1, y) : -1;
                const rightIdx = x + 1 < this.gridWidth ? this.getIdx(x + 1, y) : -1;
                const downLeft = (y + 1 < this.gridHeight && x - 1 >= 0) ? this.getIdx(x - 1, y + 1) : -1;
                const downRight = (y + 1 < this.gridHeight && x + 1 < this.gridWidth) ? this.getIdx(x + 1, y + 1) : -1;
                const up = y - 1 >= 0 ? this.getIdx(x, y - 1) : -1;
                
                // OPTIMIZATION: Handle STATIC first with lazy neighbor calculation
                if (state === STATE.STATIC) {
                    if (type === TYPE.STONE) {
                        // AGGRESSIVE SLEEP: If stone is cold, skip 98% of updates
                        // This fixes the lag when you have massive piles of stone
                        if (this.life[i] === 0 && this.fastRand() > 0.02) continue;
                        
                        // Calculate only necessary neighbors for stone (lazy calculation)
                        const stoneUp = y > 0 ? this.getIdx(x, y - 1) : -1;
                        const stoneBelow = y < this.gridHeight - 1 ? this.getIdx(x, y + 1) : -1;
                        const stoneLeft = x > 0 ? this.getIdx(x - 1, y) : -1;
                        const stoneRight = x < this.gridWidth - 1 ? this.getIdx(x + 1, y) : -1;
                        
                        this.updateStone(i, x, y, stoneUp, stoneBelow, stoneLeft, stoneRight);
                    }
                    else if (type === TYPE.WOOD_OILED && this.life[i] > 0) {
                        // Calculate neighbors only if burning
                        const oilUp = y > 0 ? this.getIdx(x, y - 1) : -1;
                        const oilBelow = y < this.gridHeight - 1 ? this.getIdx(x, y + 1) : -1;
                        const oilLeft = x > 0 ? this.getIdx(x - 1, y) : -1;
                        const oilRight = x < this.gridWidth - 1 ? this.getIdx(x + 1, y) : -1;
                        this.updateBurningOiledWood(i, x, y, oilUp, oilBelow, oilLeft, oilRight);
                    }
                    continue;
                }
                else if (state === STATE.SOLID) {
                    // Gravel can be heated/melted like stone, but falls like sand
                    if (type === TYPE.GRAVEL) {
                        // OPTIMIZATION: Skip heating checks 95% of the time when gravel is cold
                        // This prevents lag with massive piles of gravel
                        const shouldCheckHeating = this.life[i] > 0 || this.fastRand() < 0.05;
                        
                        if (shouldCheckHeating) {
                            // Check for heating from neighbors (same as stone)
                            const gravelUp = y > 0 ? this.getIdx(x, y - 1) : -1;
                            const gravelBelow = y < this.gridHeight - 1 ? this.getIdx(x, y + 1) : -1;
                            const gravelLeft = x > 0 ? this.getIdx(x - 1, y) : -1;
                            const gravelRight = x < this.gridWidth - 1 ? this.getIdx(x + 1, y) : -1;
                            
                            // Apply stone heating logic to gravel
                            this.updateStone(i, x, y, gravelUp, gravelBelow, gravelLeft, gravelRight);
                            
                            // If gravel melted into lava, skip falling physics
                            if (this.cells[i] !== TYPE.GRAVEL) continue;
                        }
                    }
                    
                    // Apply falling physics to all solids (sand, ash, gravel)
                    this.updateSolid(i, x, y, type, below, downLeft, downRight, dir);
                }
                else if (state === STATE.LIQUID) {
                    if (type === TYPE.NANOBOT) {
                        this.updateNanobot(i, x, y);
                    } else if (type === TYPE.LAVA) {
                        this.updateLava(i, x, y, density, below, downLeft, downRight, leftIdx, rightIdx, up, dir);
                    } else {
                        this.updateLiquid(i, x, y, type, density, below, downLeft, downRight, leftIdx, rightIdx, up, dir);
                    }
                }
                else if (state === STATE.GAS) {
                    this.updateGas(i, x, y, type, density, up, leftIdx, rightIdx, dir);
                }
                else if (state === STATE.FIRE) {
                    this.updateFire(i, x, y, up, below, leftIdx, rightIdx, dir);
                }
            }
            
            if (rowHasParticles && y < newMinActiveY) {
                newMinActiveY = y;
            }
        }
        
        this.minActiveY = newMinActiveY;
    }
    
    
    // ========================================================================
    // STONE THERMODYNAMICS
    // ========================================================================
    
    updateStone(i, x, y, up, below, left, right) {
        // Note: Aggressive sleep (98% skip for cold stone) is now handled in main update loop
        // Note: This function handles both STONE and GRAVEL
        // Gravel heats 50% faster than stone
        
        const currentType = this.cells[i];
        const isGravel = currentType === TYPE.GRAVEL;
        const heatMultiplier = isGravel ? 1.5 : 1.0; // Gravel heats 50% faster
        
        let maxNeighborHeat = 0;
        let isTouchingCoolant = false;
        let hasDirectHeatSource = false;
        let heatSourceDistance = -1;
        
        // 1. CHECK 4 NEIGHBORS (Direct check only, no BFS)
        const neighbors = [up, below, left, right];
        
        for (let n of neighbors) {
            if (n !== -1) {
                const type = this.cells[n];
                
                // A. Direct Heat Sources
                if (type === TYPE.FIRE || 
                    (type === TYPE.OIL && this.life[n] > 0) || 
                    (type === TYPE.WOOD_OILED && this.life[n] > 0)) {
                    maxNeighborHeat = 1000; // Infinite heat
                    hasDirectHeatSource = true;
                    heatSourceDistance = 0; // Direct contact
                } 
                // B. Lava Heat (only if hot enough)
                else if (type === TYPE.LAVA && this.life[n] >= 450) {
                    // Map Lava life (0-1500) to stone heat units (0-1000)
                    // Stone melts at 400. Hot lava (1500) = 1000 heat, cold lava (0) = 0 heat
                    const lavaHeat = (this.life[n] / 1500) * 1000;
                    if (lavaHeat > maxNeighborHeat) {
                        maxNeighborHeat = lavaHeat;
                        hasDirectHeatSource = true;
                        heatSourceDistance = 0; // Direct contact
                    }
                } 
                // B. Conductive Heat (Hot Stone/Gravel) - only if we don't have direct heat
                else if ((type === TYPE.STONE || type === TYPE.GRAVEL) && !hasDirectHeatSource) {
                    if (this.life[n] > maxNeighborHeat) {
                        maxNeighborHeat = this.life[n];
                    }
                }
                // C. Coolants (Air/Water)
                else if (type === TYPE.WATER || type === TYPE.EMPTY) {
                    isTouchingCoolant = true;
                }
            }
        }

        // 2. VERIFY HEAT SOURCE CONNECTION (if heating from stone conduction)
        // OPTIMIZATION: Only run expensive BFS 5% of the time to save CPU
        if (!hasDirectHeatSource && maxNeighborHeat > this.life[i] + 5) {
            // Only run BFS search 5% of the time to save CPU
            if (this.fastRand() < 0.05) {
                heatSourceDistance = this.findHeatSourceDistance(i, x, y);
                
                // If no heat source found within 20 layers, don't heat
                if (heatSourceDistance === -1 || heatSourceDistance > 20) {
                    maxNeighborHeat = 0; // Block heating
                }
            }
        }

        // 3. THERMODYNAMICS LOGIC
        // Multi-layer heating: up to 20 layers, 10% reduction per layer
        // Heat propagates through stone conduction over time
        if (maxNeighborHeat > this.life[i] + 5) {
            // Calculate heating rate based on heat source type and distance
            let heatingRate;
            
            if (hasDirectHeatSource) {
                // Direct fire/lava contact: Layer 1 = 100% (4 heat/frame for stone, 6 for gravel)
                heatingRate = 4 * heatMultiplier;
            } else {
                // Conductive heating from hot stone/gravel
                // If we didn't run BFS this frame, assume previous heat state sustains
                // or default to a mid-range layer (5) for performance
                const layer = heatSourceDistance !== -1 ? heatSourceDistance + 1 : 5;
                
                // Layer 1=100%, Layer 2=90%, Layer 3=80%...Layer 20=10%
                const layerMultiplier = Math.max(0.1, 1.0 - (layer - 1) * 0.1);
                
                // Base conduction rate * layer multiplier * heat multiplier (gravel = 1.5x)
                heatingRate = 1 * layerMultiplier * heatMultiplier;
            }
            
            // Apply heating with probabilistic fractional rates
            if (heatingRate >= 1 || this.fastRand() < heatingRate) {
                const heatToAdd = Math.max(1, Math.floor(heatingRate));
                if (this.life[i] < 65000) {
                    this.life[i] += heatToAdd;
                }
            }

            // Chance to spawn smoke when hot
            if (this.life[i] > 100 && up !== -1 && this.cells[up] === TYPE.EMPTY && this.fastRand() < 0.005) {
                this.setType(up, TYPE.SMOKE);
            }
        } 
        // 3. COOLING
        // Cool down if: touching coolant, hotter than neighbors, or no significant heat source
        else if (this.life[i] > 0) {
            // Distance-based cooling: stones further from heat source cool faster
            // Layer 1 (direct contact): -1/frame
            // Layer 2: -1.1/frame (10% faster)
            // Layer 3: -1.2/frame (20% faster)
            // etc.
            
            let coolingRate = 1.0;
            
            // Estimate distance from heat source based on current heat and max neighbor heat
            if (maxNeighborHeat > 0) {
                // If we have warm neighbors, estimate our layer distance
                const heatRatio = this.life[i] / Math.max(1, maxNeighborHeat);
                const estimatedLayer = Math.min(20, Math.ceil((1 - heatRatio) * 10));
                
                // Each layer cools 10% faster: Layer 1=1.0x, Layer 2=1.1x, Layer 3=1.2x...
                coolingRate = 1.0 + (estimatedLayer - 1) * 0.1;
            } else {
                // No heat source nearby - cool at maximum rate (far from source)
                coolingRate = 2.0; // Assume layer 10+
            }
            
            // Apply cooling with probabilistic fractional rates
            if (coolingRate >= 1 || this.fastRand() < coolingRate) {
                const coolAmount = Math.max(1, Math.floor(coolingRate));
                this.life[i] = Math.max(0, this.life[i] - coolAmount);
            }
        }

        // 4. MELTING POINT
        // 400 frames is roughly 6.6 seconds at 60fps
        if (this.life[i] > 400) {
            this.setType(i, TYPE.LAVA);
            // CRITICAL FIX: Energy conservation
            // Set melted stone to low heat (500) instead of volcanic heat (1500)
            // This prevents perpetual melting cycles and ensures energy dissipates
            this.life[i] = 500;
        }
    }
    
    // Helper: Water actively cools hot stone (BFS with hard safety limits)
    // Can traverse through both stone and lava to reach and cool hot stone
    coolStoneFromWater(waterIdx, waterX, waterY) {
        const maxDistance = 15; // Reduced from 20 for performance
        const maxNodes = 60;    // CRITICAL: Hard limit prevents infinite loops
        const visited = new Set();
        const queue = [{idx: waterIdx, x: waterX, y: waterY, dist: 0}];
        visited.add(waterIdx);
        
        let nodesChecked = 0;
        
        while (queue.length > 0 && nodesChecked < maxNodes) {
            const {idx, x, y, dist} = queue.shift();
            nodesChecked++;
            
            if (dist > maxDistance) continue;
            
            // Check 4 neighbors
            const neighbors = [
                {idx: idx - this.width, x: x, y: y - 1},      // up
                {idx: idx + this.width, x: x, y: y + 1},      // down
                {idx: idx - 1, x: x - 1, y: y},               // left
                {idx: idx + 1, x: x + 1, y: y}                // right
            ];
            
            for (let n of neighbors) {
                // Bounds check
                if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height || visited.has(n.idx)) {
                    continue;
                }
                
                visited.add(n.idx);
                const type = this.cells[n.idx];
                
                // Found hot stone/gravel - cool it!
                if ((type === TYPE.STONE || type === TYPE.GRAVEL) && this.life[n.idx] > 0) {
                    const layer = dist + 1;
                    // Layer-based cooling: 10% reduction per layer
                    const layerMultiplier = Math.max(0.1, 1.0 - (layer - 1) * 0.1);
                    // Increased rate (20) since we run less often (5% of frames)
                    const coolingRate = 20 * layerMultiplier;
                    
                    // Apply cooling
                    this.life[n.idx] = Math.max(0, this.life[n.idx] - Math.floor(coolingRate));
                    
                    // Continue searching through stone/gravel
                    queue.push({idx: n.idx, x: n.x, y: n.y, dist: dist + 1});
                }
                // Continue through cold stone/gravel (to reach hot stone/gravel beyond)
                else if (type === TYPE.STONE || type === TYPE.GRAVEL) {
                    queue.push({idx: n.idx, x: n.x, y: n.y, dist: dist + 1});
                }
                // Continue through lava (to reach hot stone beyond)
                else if (type === TYPE.LAVA) {
                    queue.push({idx: n.idx, x: n.x, y: n.y, dist: dist + 1});
                }
            }
        }
    }
    
    // Helper: Water actively cools lava (BFS with hard safety limits)
    // Can traverse through both stone and lava to reach and cool lava
    coolLavaFromWater(waterIdx, waterX, waterY) {
        const maxDistance = 15; // Reduced from 20 for performance
        const maxNodes = 60;    // CRITICAL: Hard limit prevents infinite loops
        const visited = new Set();
        const queue = [{idx: waterIdx, x: waterX, y: waterY, dist: 0}];
        visited.add(waterIdx);
        
        let nodesChecked = 0;
        
        while (queue.length > 0 && nodesChecked < maxNodes) {
            const {idx, x, y, dist} = queue.shift();
            nodesChecked++;
            
            if (dist > maxDistance) continue;
            
            // Check 4 neighbors
            const neighbors = [
                {idx: idx - this.width, x: x, y: y - 1},      // up
                {idx: idx + this.width, x: x, y: y + 1},      // down
                {idx: idx - 1, x: x - 1, y: y},               // left
                {idx: idx + 1, x: x + 1, y: y}                // right
            ];
            
            for (let n of neighbors) {
                // Bounds check
                if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height || visited.has(n.idx)) {
                    continue;
                }
                
                visited.add(n.idx);
                const type = this.cells[n.idx];
                
                // Found lava - cool it!
                if (type === TYPE.LAVA && this.life[n.idx] > 0) {
                    // Cooling power decreases with distance
                    // Close: 100 cooling, Far: 5 cooling
                    const coolingPower = Math.max(5, 100 - (dist * 5));
                    
                    // 20% chance to apply cooling (simulates evaporation/resistance)
                    if (this.fastRand() < 0.2) {
                        this.life[n.idx] = Math.max(0, this.life[n.idx] - coolingPower);
                    }
                    
                    // Continue searching through lava
                    queue.push({idx: n.idx, x: n.x, y: n.y, dist: dist + 1});
                }
                // Continue through stone/gravel to reach lava beyond
                else if (type === TYPE.STONE || type === TYPE.GRAVEL) {
                    queue.push({idx: n.idx, x: n.x, y: n.y, dist: dist + 1});
                }
            }
        }
    }
    
    // Helper: BFS to find distance to nearest heat source (within 20 layers)
    // OPTIMIZED: Limited search size and queue size
    findHeatSourceDistance(startIdx, startX, startY) {
        const maxDistance = 20;
        const visited = new Set();
        const queue = [{idx: startIdx, x: startX, y: startY, dist: 0}];
        visited.add(startIdx);
        
        let nodesChecked = 0;
        const maxNodesToCheck = 100; // OPTIMIZATION: Limit search size
        
        while (queue.length > 0 && nodesChecked < maxNodesToCheck) {
            const {idx, x, y, dist} = queue.shift();
            nodesChecked++;
            
            // Stop if we've gone too far
            if (dist > maxDistance) {
                break;
            }
            
            // Check 4 neighbors
            const neighbors = [
                {idx: idx - this.width, x: x, y: y - 1},      // up
                {idx: idx + this.width, x: x, y: y + 1},      // down
                {idx: idx - 1, x: x - 1, y: y},               // left
                {idx: idx + 1, x: x + 1, y: y}                // right
            ];
            
            for (let n of neighbors) {
                // Bounds check
                if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height) {
                    continue;
                }
                
                if (visited.has(n.idx)) {
                    continue;
                }
                
                visited.add(n.idx);
                const type = this.cells[n.idx];
                
                // Found a heat source!
                if (type === TYPE.FIRE || 
                    type === TYPE.LAVA ||
                    (type === TYPE.OIL && this.life[n.idx] > 0) ||
                    (type === TYPE.WOOD_OILED && this.life[n.idx] > 0)) {
                    return dist + 1; // Distance from start to this heat source
                }
                
                // Continue through stone/gravel (20 layers total)
                if (type === TYPE.STONE || type === TYPE.GRAVEL) {
                    if (queue.length < 50) { // OPTIMIZATION: Limit queue size
                        queue.push({idx: n.idx, x: n.x, y: n.y, dist: dist + 1});
                    }
                }
            }
        }
        
        // No heat source found within range
        return -1;
    }
    
    
    
    
    
    // ========================================================================
    // SOLID PHYSICS
    // ========================================================================
    
    updateSolid(i, x, y, type, below, downLeft, downRight, dir) {
        // Sand-Water chemical interaction (hardening)
        if (type === TYPE.SAND) {
            if (this.trySandHardening(i, x, y, below, downLeft, downRight)) {
                return; // Sand turned to stone
            }
        }
        
        // Try standard gravity first (fall through air/gas/fire)
        if (this.tryFallThroughEmpty(i, below)) {
            return;
        }

        const myDensity = this.LUT_DENSITY[type];

        // Try diagonal slip through lighter liquids (creates V-shape sinking)
        if (this.tryDiagonalSlip(i, myDensity, downLeft, downRight, dir)) {
            return;
        }

        // Try displacing liquid below (hydrostatic + splash displacement)
        if (this.tryDisplaceLiquidBelow(i, x, y, below, myDensity, dir)) {
            return;
        }
    }





    // ========================================================================
    // SOLID PHYSICS HELPERS
    // ========================================================================

    trySandHardening(sandIndex, x, y, below, downLeft, downRight) {
        // Optimization: Only check 4 direct neighbors instead of 8
        // This is sufficient for the effect and reduces lookups by 50%
        let waterCount = 0;
        let waterNeighbor = -1;
        
        const up = y - 1 >= 0 ? this.getIdx(x, y - 1) : -1;
        const left = x - 1 >= 0 ? this.getIdx(x - 1, y) : -1;
        const right = x + 1 < this.gridWidth ? this.getIdx(x + 1, y) : -1;
        
        // Check Up
        if (up !== -1 && this.cells[up] === TYPE.WATER) { 
            waterCount++; waterNeighbor = up; 
        }
        // Check Below
        if (below !== -1 && this.cells[below] === TYPE.WATER) { 
            waterCount++; waterNeighbor = below; 
        }
        // Check Left
        if (left !== -1 && this.cells[left] === TYPE.WATER) { 
            waterCount++; waterNeighbor = left; 
        }
        // Check Right
        if (right !== -1 && this.cells[right] === TYPE.WATER) { 
            waterCount++; waterNeighbor = right; 
        }
        
        if (waterCount > 0) {
            // 0.1% chance * water neighbors
            if (this.fastRand() < (0.001 * waterCount)) {
                this.setType(sandIndex, TYPE.STONE);
                if (waterNeighbor !== -1) {
                    this.setType(waterNeighbor, TYPE.EMPTY);
                }
                return true;
            }
        }
        
        return false;
    }
    
    
    tryFallThroughEmpty(particleIndex, belowIndex) {
        if (belowIndex === -1) return false;
        
        const targetState = this.LUT_STATE[this.cells[belowIndex]];
        const canFallThrough = targetState === STATE.AIR || 
                              targetState === STATE.GAS || 
                              targetState === STATE.FIRE;
        
        if (canFallThrough) {
            this.swap(particleIndex, belowIndex);
            return true;
        }
        
        return false;
    }


    tryDiagonalSlip(particleIndex, myDensity, downLeft, downRight, direction) {
        const diagonals = direction === 1 
            ? [downRight, downLeft] 
            : [downLeft, downRight];

        for (const diagonalIndex of diagonals) {
            if (diagonalIndex === -1) continue;
            
            const targetType = this.cells[diagonalIndex];
            const targetState = this.LUT_STATE[targetType];
            
            // Can slip through empty space, fire, or lighter liquids
            const canSlip = targetState === STATE.AIR || 
                           targetState === STATE.FIRE ||
                           (targetState === STATE.LIQUID && this.LUT_DENSITY[targetType] < myDensity);
            
            if (canSlip) {
                this.swap(particleIndex, diagonalIndex);
                return true;
            }
        }
        
        return false;
    }


    tryDisplaceLiquidBelow(particleIndex, x, y, belowIndex, myDensity, direction) {
        if (belowIndex === -1) return false;
        if (this.LUT_STATE[this.cells[belowIndex]] !== STATE.LIQUID) return false;
        
        const liquidDensity = this.LUT_DENSITY[this.cells[belowIndex]];
        
        // Can only displace lighter liquids
        if (myDensity <= liquidDensity) return false;

        // Try hydrostatic displacement (push water horizontally at bottom level)
        if (this.tryHydrostaticDisplacement(particleIndex, x, y, belowIndex, direction)) {
            return true;
        }

        // Try splash displacement (push water sideways at current level)
        if (this.trySplashDisplacement(particleIndex, x, belowIndex, direction)) {
            return true;
        }

        // Last resort: vertical swap
        this.swap(particleIndex, belowIndex);
        return true;
    }


    tryHydrostaticDisplacement(particleIndex, x, y, belowIndex, direction) {
        const searchRange = 8;
        const firstDirection = direction;
        const secondDirection = -direction;

        // Search for empty space horizontally at the water's level
        let emptySpotIndex = this.scanHorizontal(belowIndex, x, y + 1, firstDirection, searchRange);
        
        if (emptySpotIndex === -1) {
            emptySpotIndex = this.scanHorizontal(belowIndex, x, y + 1, secondDirection, searchRange);
        }

        if (emptySpotIndex !== -1) {
            // Move water to empty spot, move solid down
            this.moveParticle(belowIndex, emptySpotIndex);
            this.moveParticle(particleIndex, belowIndex);
            return true;
        }
        
        return false;
    }


    trySplashDisplacement(particleIndex, x, belowIndex, direction) {
        const leftNeighbor = particleIndex - 1;
        const rightNeighbor = particleIndex + 1;
        
        const sideOptions = direction === 1 
            ? [rightNeighbor, leftNeighbor] 
            : [leftNeighbor, rightNeighbor];

        for (const sideIndex of sideOptions) {
            if (sideIndex === -1) continue;
            
            const sideX = (sideIndex === leftNeighbor) ? x - 1 : x + 1;
            
            // Check bounds and if side is empty
            if (sideX < 0 || sideX >= this.gridWidth) continue;
            if (this.cells[sideIndex] !== TYPE.EMPTY) continue;
            
            // Push water to the side, move solid down
            this.moveParticle(belowIndex, sideIndex);
            this.moveParticle(particleIndex, belowIndex);
            return true;
        }
        
        return false;
    }

    scanHorizontal(waterIndex, waterX, waterY, direction, searchRange) {
        for (let distance = 1; distance <= searchRange; distance++) {
            const targetX = waterX + (distance * direction);
            
            // Stop if out of bounds
            if (targetX < 0 || targetX >= this.gridWidth) {
                return -1;
            }
            
            const targetIndex = this.getIdx(targetX, waterY);
            const targetState = this.LUT_STATE[this.cells[targetIndex]];
            
            // Found empty space - water can flow here
            const isEmpty = targetState === STATE.AIR || 
                           targetState === STATE.GAS || 
                           targetState === STATE.FIRE;
            
            if (isEmpty) {
                return targetIndex;
            }
            
            // Hit a barrier - stop searching this direction
            const isBlocked = targetState === STATE.SOLID || 
                             targetState === STATE.STATIC;
            
            if (isBlocked) {
                return -1;
            }
        }
        
        return -1;
    }
    
    
    
    
    
    // ========================================================================
    // OILED WOOD PHYSICS
    // ========================================================================
    
    updateBurningOiledWood(i, x, y, up, below, leftIdx, rightIdx) {
        // Decrease burn timer
        this.life[i]--;
        
        // Emit fire upwards or to sides more frequently (30% chance)
        if (this.fastRand() < 0.3) {
            const emitTarget = this.fastRand() < 0.7 ? up : (this.fastRand() < 0.5 ? leftIdx : rightIdx);
            if (emitTarget !== -1 && this.cells[emitTarget] === TYPE.EMPTY) {
                this.setType(emitTarget, TYPE.FIRE);
            }
        }
        
        // Spread fire to neighboring wood/oiled wood BEFORE burning out
        this.spreadBurningOiledWood(i, x, y);
        
        // When burn timer is low, GUARANTEE ignition of all direct neighbors
        if (this.life[i] <= 30) {
            this.guaranteeIgniteNeighbors(i, up, below, leftIdx, rightIdx);
        }
        
        // When burn timer expires, 50% chance to turn into ash, 50% empty
        if (this.life[i] <= 0) {
            this.setType(i, this.fastRand() < 0.5 ? TYPE.ASH : TYPE.EMPTY);
        }
    }
    
    
    spreadBurningOiledWood(burningIndex, x, y) {
        const spreadRange = 1; // Only check direct neighbors (was 2)
        
        // Check nearby cells for unlit oiled wood
        for (let dy = -spreadRange; dy <= spreadRange; dy++) {
            for (let dx = -spreadRange; dx <= spreadRange; dx++) {
                if (dx === 0 && dy === 0) continue;
                
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx < 0 || nx >= this.gridWidth || ny < 0 || ny >= this.gridHeight) continue;
                
                const neighborIndex = this.getIdx(nx, ny);
                
                // Only ignite oiled wood that's not already burning
                if (this.cells[neighborIndex] === TYPE.WOOD_OILED && this.life[neighborIndex] === 0) {
                    // Check if this oiled wood is exposed to air/fire (surface)
                    const isExposed = this.isOiledWoodExposed(neighborIndex, nx, ny);
                    
                    if (isExposed) {
                        // Only direct neighbors (4 directions) ignite easily
                        // Diagonal neighbors have lower chance
                        const isDirect = (Math.abs(dx) + Math.abs(dy)) === 1;
                        const igniteChance = isDirect ? 0.8 : 0.3;
                        
                        if (this.fastRand() < igniteChance) {
                            // Set burn timer: 180-300 frames (3-5 seconds at 60fps)
                            this.life[neighborIndex] = 180 + Math.floor(this.fastRand() * 120);
                            this.moved[neighborIndex] = 1;
                        }
                    } else if (Math.abs(dx) + Math.abs(dy) === 1) {
                        // Very small chance to ignite buried DIRECT neighbors only (1%)
                        // No diagonal buried ignition
                        if (this.fastRand() < 0.01) {
                            this.life[neighborIndex] = 180 + Math.floor(this.fastRand() * 120);
                            this.moved[neighborIndex] = 1;
                        }
                    }
                }
            }
        }
    }
    
    
    guaranteeIgniteNeighbors(burningIndex, up, below, left, right) {
        // When wood is about to burn out, GUARANTEE all neighbors are ignited
        // This prevents fire from dying without spreading to all connected wood
        const neighbors = [
            {idx: up, dir: 'up'},
            {idx: below, dir: 'down'},
            {idx: left, dir: 'left'},
            {idx: right, dir: 'right'}
        ].filter(n => n.idx !== -1);
        
        for (let neighbor of neighbors) {
            const neighborIndex = neighbor.idx;
            const neighborType = this.cells[neighborIndex];
            
            // Ignite regular wood with 3-layer tolerance (100% guaranteed)
            if (neighborType === TYPE.WOOD) {
                this.igniteWoodWithTolerance(neighborIndex, 3);
            }
            // Ignite unlit oiled wood ONLY if exposed (has air/fire/smoke adjacent)
            else if (neighborType === TYPE.WOOD_OILED && this.life[neighborIndex] === 0) {
                const nx = neighborIndex % this.gridWidth;
                const ny = Math.floor(neighborIndex / this.gridWidth);
                
                if (this.isOiledWoodExposed(neighborIndex, nx, ny)) {
                    this.life[neighborIndex] = 180 + Math.floor(this.fastRand() * 120);
                    this.moved[neighborIndex] = 1;
                }
            }
            // Ignite unlit oil (100% guaranteed)
            else if (neighborType === TYPE.OIL && this.life[neighborIndex] === 0) {
                this.life[neighborIndex] = 60 + Math.floor(this.fastRand() * 30);
                this.moved[neighborIndex] = 1;
            }
        }
    }
    
    
    igniteWoodWithTolerance(startWoodIdx, maxLayers) {
        // BFS to spread through up to maxLayers of regular wood
        // Ignites all wood found within tolerance
        const visited = new Set();
        const queue = [{idx: startWoodIdx, dist: 0}];
        visited.add(startWoodIdx);
        
        while (queue.length > 0) {
            const {idx, dist} = queue.shift();
            
            // Stop if we've reached max depth
            if (dist >= maxLayers) continue;
            
            const type = this.cells[idx];
            
            // Ignite regular wood
            if (type === TYPE.WOOD) {
                this.setType(idx, TYPE.WOOD_OILED);
                this.life[idx] = 180 + Math.floor(this.fastRand() * 120);
                this.moved[idx] = 1;
                
                // Continue searching through wood
                const x = idx % this.gridWidth;
                const y = Math.floor(idx / this.gridWidth);
                
                const neighbors = [
                    y > 0 ? idx - this.gridWidth : -1,                    // up
                    y < this.gridHeight - 1 ? idx + this.gridWidth : -1, // down
                    x > 0 ? idx - 1 : -1,                                 // left
                    x < this.gridWidth - 1 ? idx + 1 : -1                 // right
                ];
                
                for (let n of neighbors) {
                    if (n === -1 || visited.has(n)) continue;
                    
                    const nType = this.cells[n];
                    if (nType === TYPE.WOOD) {
                        visited.add(n);
                        queue.push({idx: n, dist: dist + 1});
                    }
                }
            }
        }
    }
    
    
    isOiledWoodExposed(oiledWoodIndex, x, y) {
        // Check if oiled wood has air, fire, or smoke adjacent (making it surface/exposed)
        // Does NOT count burning oiled wood or ash as exposure - only true empty space
        const checkOffsets = [
            -1,                    // left
            1,                     // right
            -this.gridWidth,       // up
            this.gridWidth         // down
        ];
        
        for (let offset of checkOffsets) {
            const neighborIndex = oiledWoodIndex + offset;
            
            if (neighborIndex < 0 || neighborIndex >= this.cellCount) continue;
            
            const neighborType = this.cells[neighborIndex];
            const neighborState = this.LUT_STATE[neighborType];
            
            // Only count as exposed if adjacent to:
            // - Empty air
            // - Fire particles (not burning wood)
            // - Smoke/steam (gases)
            if (neighborType === TYPE.EMPTY || 
                neighborType === TYPE.FIRE || 
                neighborState === STATE.GAS) {
                return true;
            }
        }
        
        return false;
    }
    
    
    
    
    
    // ========================================================================
    // LAVA PHYSICS
    // ========================================================================
    
    updateLava(i, x, y, density, below, downLeft, downRight, leftIdx, rightIdx, up, dir) {
        // 0. CALCULATE HEAT PERCENTAGE
        // Life ~1500 is max heat. 30% threshold is ~450 life.
        const maxLife = 1500;
        const heatPct = Math.min(1.0, this.life[i] / maxLife);
        const isHighHeat = heatPct > 0.3;

        // 1. HEAT & IGNITION - Check neighbors
        const neighbors = [up, below, leftIdx, rightIdx, downLeft, downRight];
        let heatingStone = false; // Track if we're actively heating stone
        
        for (let n of neighbors) {
            if (n !== -1) {
                const t = this.cells[n];
                
                // Check if we're heating stone (energy transfer)
                if (t === TYPE.STONE && this.life[n] < 200) {
                    heatingStone = true;
                }
                
                // A. Burn Flammable Things (Wood, Oiled Wood, Oil)
                if (t === TYPE.WOOD || t === TYPE.WOOD_OILED || (t === TYPE.OIL && this.life[n] === 0)) {
                    
                    let ignitionChance = 0;

                    // Determine base chance
                    if (t === TYPE.WOOD || t === TYPE.WOOD_OILED) ignitionChance = 0.05;
                    else if (t === TYPE.OIL) ignitionChance = 0.08;

                    // Apply Heat Scaling
                    if (!isHighHeat) {
                        // Below 30%, chance scales with heat
                        // e.g. at 15% heat, chance is 15% of base
                        ignitionChance *= heatPct; 
                    }
                    // Else: above 30%, use full base chance (100% effectiveness)

                    if (this.fastRand() < ignitionChance) {
                        if (t === TYPE.OIL) {
                            // Ignite Oil
                            this.life[n] = 60 + Math.floor(this.fastRand() * 30);
                            this.moved[n] = 1;
                        } else {
                            // Ignite Wood
                            this.setType(n, TYPE.FIRE);
                        }
                    }
                }
                
                // B. Evaporate Water
                else if (t === TYPE.WATER) {
                    // Water evaporation also slows down as lava cools
                    // Base chance 10%
                    let steamChance = 0.1 * heatPct; 
                    
                    if (this.fastRand() < steamChance) {
                        this.setType(n, TYPE.STEAM);
                        // Note: Actual cooling happens in water's update via direct neighbor contact
                    }
                }
            }
        }
        
        // 2. EMISSION (Fire only - emission rate scales with heat)
        // Hot lava emits more, cold lava emits less
        if (heatPct > 0.2) {
            if (up !== -1 && this.cells[up] === TYPE.EMPTY && this.fastRand() < (0.005 * heatPct)) {
                this.setType(up, TYPE.FIRE);
            }
        }
        
        // 3. COOLING & HARDENING
        if (this.life[i] > 0) {
            this.life[i]--;
            
            // Extra cooling when actively heating stone (energy transfer)
            // Lava loses heat faster when transferring energy to cold stone
            if (heatingStone) {
                this.life[i] = Math.max(0, this.life[i] - 2);
            }
        }
        
        // If dead, turn to Stone
        if (this.life[i] <= 0) {
            this.setType(i, TYPE.STONE);
            return;
        }
        
        // 4. MOVEMENT (Viscosity increases as it cools)
        // Hot lava (1.0) moves 80% of the time (0.2 stop chance)
        // Cold lava (0.1) moves 10% of the time (0.9 stop chance)
        
        const viscosityThreshold = 0.9 - (0.7 * heatPct); 
        // @ 100% heat -> 0.2 threshold (moves 80%)
        // @ 0% heat   -> 0.9 threshold (moves 10%)

        // Gravity (Always falls if possible)
        if (below !== -1) {
            const target = this.cells[below];
            const tState = this.LUT_STATE[target];
            // Lava can pass through air, fire, and less dense liquids
            if (tState === STATE.AIR || tState === STATE.FIRE || 
                (tState === STATE.LIQUID && this.LUT_DENSITY[target] < density)) {
                this.swap(i, below);
                return;
            }
        }
        
        // Horizontal Viscosity Check
        if (this.fastRand() < viscosityThreshold) {
            return;
        }
        
        // Flow Logic (Diagonal & Horizontal)
        const r1 = dir === 1 ? downRight : downLeft;
        const r2 = dir === 1 ? downLeft : downRight;
        
        if (r1 !== -1) {
            const t1 = this.cells[r1];
            const t1State = this.LUT_STATE[t1];
            if (t1State === STATE.AIR || t1State === STATE.FIRE || 
                (t1State === STATE.LIQUID && this.LUT_DENSITY[t1] < density)) {
                this.swap(i, r1);
                return;
            }
        }
        if (r2 !== -1) {
            const t2 = this.cells[r2];
            const t2State = this.LUT_STATE[t2];
            if (t2State === STATE.AIR || t2State === STATE.FIRE || 
                (t2State === STATE.LIQUID && this.LUT_DENSITY[t2] < density)) {
                this.swap(i, r2);
                return;
            }
        }
        
        const h1 = dir === 1 ? rightIdx : leftIdx;
        const h2 = dir === 1 ? leftIdx : rightIdx;
        
        if (h1 !== -1) {
            const h1Type = this.cells[h1];
            if (h1Type === TYPE.EMPTY || h1Type === TYPE.FIRE) {
                this.swap(i, h1);
                return;
            }
        }
        if (h2 !== -1) {
            const h2Type = this.cells[h2];
            if (h2Type === TYPE.EMPTY || h2Type === TYPE.FIRE) {
                this.swap(i, h2);
                return;
            }
        }
    }
    
    
    
    
    
    // ========================================================================
    // LIQUID PHYSICS
    // ========================================================================
    
    updateLiquid(i, x, y, type, density, below, downLeft, downRight, leftIdx, rightIdx, up, dir) {
        // Handle burning oil (life > 0 means it's on fire)
        // Burning oil emits fire and spreads, but STILL FLOWS like liquid
        if (type === TYPE.OIL && this.life[i] > 0) {
            // Decrease burn timer
            this.life[i]--;
            
            // Emit fire upwards occasionally
            if (this.fastRand() < 0.15) {
                const emitTarget = this.fastRand() < 0.7 ? up : (this.fastRand() < 0.5 ? leftIdx : rightIdx);
                if (emitTarget !== -1 && this.cells[emitTarget] === TYPE.EMPTY) {
                    this.setType(emitTarget, TYPE.FIRE);
                }
            }
            
            // Spread fire to neighboring surface oil
            this.spreadBurningOil(i, x, y, leftIdx, rightIdx, up, below);
            
            // When burn timer expires, turn into fire or smoke
            if (this.life[i] <= 0) {
                this.setType(i, this.fastRand() < 0.7 ? TYPE.FIRE : TYPE.SMOKE);
                return;
            }
            // Continue to movement logic below (burning oil still flows!)
        }
        
        // Special interactions
        if (type === TYPE.WATER) {
            // Water + Fire = Steam (instant check)
            const neighbors = [up, below, leftIdx, rightIdx];
            for (let n of neighbors) {
                if (n !== -1 && this.cells[n] === TYPE.FIRE) {
                    this.setType(i, TYPE.EMPTY);
                    this.setType(n, TYPE.STEAM);
                    return;
                }
            }
            
            // LAYERED COOLING (STOCHASTIC THROTTLING)
            // Only run heavy BFS on 5% of water particles per frame
            // Water moves and mixes, so this still covers the whole volume rapidly
            // but prevents lag spikes (95% CPU reduction)
            if (this.fastRand() < 0.05) {
                this.coolStoneFromWater(i, x, y);
                this.coolLavaFromWater(i, x, y);
            }
            
            // Water can harden sand within stone layers below
            if (below !== -1 && (this.cells[below] === TYPE.STONE || this.cells[below] === TYPE.SAND)) {
                const scanDepth = 5 + Math.floor(this.fastRand() * 3); // 5-7 layers
                let hitSand = false;
                let sandIdx = -1;
                
                // Scan down through stone/sand layers
                for (let d = 1; d <= scanDepth; d++) {
                    const ny = y + d;
                    if (ny >= this.gridHeight) break;
                    
                    const nIdx = this.getIdx(x, ny);
                    const nType = this.cells[nIdx];
                    
                    if (nType === TYPE.SAND) {
                        hitSand = true;
                        sandIdx = nIdx;
                        break;
                    } else if (nType === TYPE.STONE) {
                        continue; // Keep scanning through stone
                    } else {
                        break; // Hit something else, stop scanning
                    }
                }
                
                // If we found sand within the stone layers, harden it
                if (hitSand && sandIdx !== -1) {
                    if (this.fastRand() < 0.009) { // 0.9% chance (slower)
                        this.setType(sandIdx, TYPE.STONE);
                        this.setType(i, TYPE.EMPTY); // Consume water
                        this.moved[sandIdx] = 1;
                        return;
                    }
                }
            }
        }
        
        if (type === TYPE.OIL && this.life[i] === 0) {
            // Oil absorption: Oil soaks into wood, converting it to oiled wood
            // Check if touching wood or oiled wood
            const neighbors = [up, below, leftIdx, rightIdx];
            for (let n of neighbors) {
                if (n !== -1) {
                    const nType = this.cells[n];
                    if (nType === TYPE.WOOD || nType === TYPE.WOOD_OILED) {
                        // 5% chance per frame to start absorption (prevents instant consumption)
                        if (this.fastRand() < 0.05) {
                            // Absorb oil into connected wood (up to 20 layers)
                            const absorbed = this.absorbOilIntoWood(n, x, y);
                            if (absorbed) {
                                // Consume this oil particle
                                this.setType(i, TYPE.EMPTY);
                                return;
                            }
                        }
                    }
                }
            }
        }
        
        if (type === TYPE.ACID) {
            // Acid dissolves most materials (including stone)
            const targets = [below, leftIdx, rightIdx].filter(n => n !== -1);
            for (let t of targets) {
                const tType = this.cells[t];
                // Acid dissolves everything except itself, empty space, smoke, and fire
                if (tType !== TYPE.EMPTY && tType !== TYPE.ACID && 
                    tType !== TYPE.SMOKE && tType !== TYPE.FIRE) {
                    if (this.fastRand() < 0.05) {
                        this.setType(t, this.fastRand() < 0.5 ? TYPE.SMOKE : TYPE.EMPTY);
                        this.setType(i, this.fastRand() < 0.5 ? TYPE.SMOKE : TYPE.EMPTY);
                        return;
                    }
                }
            }
        }
        
        // Fall down (liquids fall faster with extra step)
        if (below !== -1) {
            const target = this.cells[below];
            const tState = this.LUT_STATE[target];
            
            if (tState === STATE.AIR || tState === STATE.FIRE) {
                this.swap(i, below);
                
                // Extra fall step for liquids to make them faster than solids
                const newBelow = y + 2 < this.gridHeight ? this.getIdx(x, y + 2) : -1;
                if (newBelow !== -1 && !this.moved[newBelow]) {
                    const newTarget = this.cells[newBelow];
                    const newTState = this.LUT_STATE[newTarget];
                    
                    if (newTState === STATE.AIR || newTState === STATE.FIRE) {
                        this.swap(below, newBelow);
                    } else if (newTState !== STATE.SOLID && newTState !== STATE.STATIC) {
                        if (this.LUT_DENSITY[newTarget] < density) {
                            this.swap(below, newBelow);
                        }
                    }
                }
                return;
            } else if (tState !== STATE.SOLID && tState !== STATE.STATIC) {
                if (this.LUT_DENSITY[target] < density) {
                    this.swap(i, below);
                    return;
                }
            }
        }
        
        // Try diagonal flow first (helps liquids trickle down naturally)
        if (downLeft !== -1) {
            const dlType = this.cells[downLeft];
            if (dlType === TYPE.EMPTY || dlType === TYPE.FIRE) {
                this.swap(i, downLeft);
                return;
            }
        }
        
        if (downRight !== -1) {
            const drType = this.cells[downRight];
            if (drType === TYPE.EMPTY || drType === TYPE.FIRE) {
                this.swap(i, downRight);
                return;
            }
        }
        
        // Spread horizontally (faster flow with multiple attempts)
        const r1 = dir === 1 ? rightIdx : leftIdx;
        const r2 = dir === 1 ? leftIdx : rightIdx;
        
        if (r1 !== -1) {
            const r1Type = this.cells[r1];
            if (r1Type === TYPE.EMPTY || r1Type === TYPE.FIRE) {
                this.swap(i, r1);
                
                // Extra horizontal spread for faster flow
                const r1Next = dir === 1 ? 
                    (x + 2 < this.gridWidth ? this.getIdx(x + 2, y) : -1) :
                    (x - 2 >= 0 ? this.getIdx(x - 2, y) : -1);
                
                if (r1Next !== -1 && !this.moved[r1Next]) {
                    const r1NextType = this.cells[r1Next];
                    if (r1NextType === TYPE.EMPTY || r1NextType === TYPE.FIRE) {
                        this.swap(r1, r1Next);
                    }
                }
                return;
            }
        }
        
        if (r2 !== -1) {
            const r2Type = this.cells[r2];
            if (r2Type === TYPE.EMPTY || r2Type === TYPE.FIRE) {
                this.swap(i, r2);
                
                // Extra horizontal spread for faster flow
                const r2Next = dir === 1 ? 
                    (x - 2 >= 0 ? this.getIdx(x - 2, y) : -1) :
                    (x + 2 < this.gridWidth ? this.getIdx(x + 2, y) : -1);
                
                if (r2Next !== -1 && !this.moved[r2Next]) {
                    const r2NextType = this.cells[r2Next];
                    if (r2NextType === TYPE.EMPTY || r2NextType === TYPE.FIRE) {
                        this.swap(r2, r2Next);
                    }
                }
                return;
            }
        }
    }
    
    
    updateBurningOil(i, x, y, up, below, leftIdx, rightIdx) {
        // Decrease burn timer
        this.life[i]--;
        
        // Emit fire upwards occasionally
        if (this.fastRand() < 0.15) {
            const emitTarget = this.fastRand() < 0.7 ? up : (this.fastRand() < 0.5 ? leftIdx : rightIdx);
            if (emitTarget !== -1 && this.cells[emitTarget] === TYPE.EMPTY) {
                this.setType(emitTarget, TYPE.FIRE);
            }
        }
        
        // Spread fire to neighboring surface oil
        this.spreadBurningOil(i, x, y, leftIdx, rightIdx, up, below);
        
        // When burn timer expires, turn into fire or smoke
        if (this.life[i] <= 0) {
            this.setType(i, this.fastRand() < 0.7 ? TYPE.FIRE : TYPE.SMOKE);
        }
    }
    
    
    spreadBurningOil(burningIndex, x, y, left, right, up, below) {
        const spreadRange = 2;
        
        // Check nearby cells for unlit surface oil
        for (let dy = -spreadRange; dy <= spreadRange; dy++) {
            for (let dx = -spreadRange; dx <= spreadRange; dx++) {
                if (dx === 0 && dy === 0) continue;
                
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx < 0 || nx >= this.gridWidth || ny < 0 || ny >= this.gridHeight) continue;
                
                const neighborIndex = this.getIdx(nx, ny);
                
                // Only ignite oil that's not already burning
                if (this.cells[neighborIndex] === TYPE.OIL && this.life[neighborIndex] === 0) {
                    // Check if this oil is exposed to air/fire (surface oil)
                    if (this.isOilExposedToSurface(neighborIndex, nx, ny)) {
                        // Ignite with high probability for adjacent cells, lower for distant
                        const distance = Math.abs(dx) + Math.abs(dy);
                        const igniteChance = distance === 1 ? 0.3 : 0.05;
                        
                        if (this.fastRand() < igniteChance) {
                            // Set burn timer: 60-90 frames (1-1.5 seconds at 60fps)
                            this.life[neighborIndex] = 60 + Math.floor(this.fastRand() * 30);
                            this.moved[neighborIndex] = 1;
                        }
                    }
                }
            }
        }
    }
    
    
    isOilExposedToSurface(oilIndex, x, y) {
        // Check if oil has air, fire, or smoke adjacent (making it surface oil)
        const neighbors = [
            y > 0 ? this.getIdx(x, y - 1) : -1,                    // up
            x > 0 ? this.getIdx(x - 1, y) : -1,                    // left
            x < this.gridWidth - 1 ? this.getIdx(x + 1, y) : -1,  // right
        ];
        
        for (let neighborIndex of neighbors) {
            if (neighborIndex === -1) continue;
            
            const neighborType = this.cells[neighborIndex];
            if (neighborType === TYPE.EMPTY || 
                neighborType === TYPE.FIRE || 
                neighborType === TYPE.SMOKE ||
                neighborType === TYPE.STEAM) {
                return true;
            }
        }
        
        return false;
    }
    
    
    absorbOilIntoWood(startWoodIdx, oilX, oilY) {
        // BFS to find ONE unconverted wood within 20 layers through connected wood/oiled-wood
        // Converts only 1 wood to oiled wood per oil particle (1:1 ratio)
        // Returns true if exactly one wood was converted (oil should be consumed)
        
        const maxLayers = 20;
        const visited = new Set();
        const queue = [{idx: startWoodIdx, dist: 0}];
        visited.add(startWoodIdx);
        
        while (queue.length > 0) {
            const {idx, dist} = queue.shift();
            
            // Stop if we've reached max depth
            if (dist >= maxLayers) continue;
            
            const type = this.cells[idx];
            
            // Found unconverted wood - convert it and stop
            if (type === TYPE.WOOD) {
                this.setType(idx, TYPE.WOOD_OILED);
                this.life[idx] = 0; // Not burning yet
                this.moved[idx] = 1;
                return true; // Converted 1 wood, consume the oil
            }
            
            // Continue searching through oiled wood to find regular wood
            if (type === TYPE.WOOD_OILED) {
                // Check 4 neighbors
                const x = idx % this.gridWidth;
                const y = Math.floor(idx / this.gridWidth);
                
                const neighbors = [
                    y > 0 ? idx - this.gridWidth : -1,                    // up
                    y < this.gridHeight - 1 ? idx + this.gridWidth : -1, // down
                    x > 0 ? idx - 1 : -1,                                 // left
                    x < this.gridWidth - 1 ? idx + 1 : -1                 // right
                ];
                
                for (let n of neighbors) {
                    if (n === -1 || visited.has(n)) continue;
                    
                    const nType = this.cells[n];
                    if (nType === TYPE.WOOD || nType === TYPE.WOOD_OILED) {
                        visited.add(n);
                        queue.push({idx: n, dist: dist + 1});
                    }
                }
            }
        }
        
        // No unconverted wood found within 20 layers
        return false;
    }
    
    
    
    
    
    // ========================================================================
    // GAS PHYSICS
    // ========================================================================
    
    updateGas(i, x, y, type, density, up, leftIdx, rightIdx, dir) {
        // Gases rise with some randomness (like fire)
        if (up !== -1 && this.fastRand() < 0.7) {
            const target = this.cells[up];
            const tState = this.LUT_STATE[target];
            
            if (tState === STATE.AIR || tState === STATE.FIRE || tState === STATE.LIQUID || 
                (tState === STATE.GAS && this.LUT_DENSITY[target] > density)) {
                this.swap(i, up);
                return;
            }
        }
        
        // Spread horizontally occasionally (like fire)
        const r1 = dir === 1 ? rightIdx : leftIdx;
        if (r1 !== -1) {
            const r1Type = this.cells[r1];
            if ((r1Type === TYPE.EMPTY || r1Type === TYPE.FIRE) && this.fastRand() < 0.3) {
                this.swap(i, r1);
                return;
            }
        }
        
        // Decay over time
        this.life[i]--;
        if (this.life[i] <= 0) {
            if (type === TYPE.STEAM && this.fastRand() < 0.1) {
                this.setType(i, TYPE.WATER);
            } else {
                this.setType(i, TYPE.EMPTY);
            }
        }
    }
    
    
    
    
    
    // ========================================================================
    // FIRE PHYSICS
    // ========================================================================
    
    updateFire(i, x, y, up, below, leftIdx, rightIdx, dir) {
        // Ignite flammable neighbors FIRST (before movement)
        // This ensures fire spreads reliably to all connected wood
        this.spreadFireToNeighbors(i, up, below, leftIdx, rightIdx);
        
        // Fire rises
        if (up !== -1 && this.cells[up] === TYPE.EMPTY && this.fastRand() < 0.5) {
            this.swap(i, up);
            return; // Don't process further if moved
        }
        
        // Spread horizontally occasionally
        const r1 = dir === 1 ? rightIdx : leftIdx;
        if (r1 !== -1 && this.cells[r1] === TYPE.EMPTY && this.fastRand() < 0.2) {
            this.swap(i, r1);
            return;
        }
        
        // Decay over time (slower decay, minimum lifetime of 60 frames)
        if (this.life[i] > 60) {
            const decay = 1 + this.fastRand() * 2; // 1-3 decay (was 2-5)
            this.life[i] -= decay;
        } else if (this.life[i] > 0) {
            // Slower decay in final phase to ensure spreading
            this.life[i] -= 0.5;
        }
        
        if (this.life[i] <= 0) {
            // Fire has 5% chance to turn into smoke at the end of its life
            this.setType(i, this.fastRand() < 0.05 ? TYPE.SMOKE : TYPE.EMPTY);
        }
    }
    
    
    spreadFireToNeighbors(fireIndex, up, below, left, right) {
        const neighbors = [up, below, left, right].filter(n => n !== -1);
        
        for (let neighborIndex of neighbors) {
            const neighborType = this.cells[neighborIndex];
            
            // Lava reheating: Fire adds heat to lava instead of consuming it
            if (neighborType === TYPE.LAVA) {
                if (this.fastRand() < 0.3) {
                    // Add 100 heat to lava (max 1500)
                    this.life[neighborIndex] = Math.min(1500, this.life[neighborIndex] + 100);
                }
            }
            // Wood ignites with 3-layer tolerance (can spread through buried wood)
            else if (neighborType === TYPE.WOOD) {
                if (this.fastRand() < 0.7) {
                    // Try to ignite wood within 3 layers
                    this.igniteWoodWithTolerance(neighborIndex, 3);
                }
            }
            // Oiled wood ignites ONLY if exposed (surface layer)
            else if (neighborType === TYPE.WOOD_OILED && this.life[neighborIndex] === 0) {
                const nx = neighborIndex % this.gridWidth;
                const ny = Math.floor(neighborIndex / this.gridWidth);
                
                // Check if oiled wood is exposed to air/fire/smoke
                if (this.isOiledWoodExposed(neighborIndex, nx, ny)) {
                    if (this.fastRand() < 0.8) {
                        // Set burn timer: 180-300 frames (3-5 seconds at 60fps)
                        this.life[neighborIndex] = 180 + Math.floor(this.fastRand() * 120);
                        this.moved[neighborIndex] = 1;
                    }
                }
            }
            // Oil ignites extremely easily (90% per frame) and starts burning
            else if (neighborType === TYPE.OIL && this.life[neighborIndex] === 0) {
                if (this.fastRand() < 0.9) {
                    // Set burn timer: 60-90 frames (1-1.5 seconds at 60fps)
                    this.life[neighborIndex] = 60 + Math.floor(this.fastRand() * 30);
                    this.moved[neighborIndex] = 1;
                }
            }
        }
    }


    // ========================================================================
    // NANOBOT PHYSICS
    // ========================================================================
    
    updateNanobot(i, x, y) {
        // Nanobot behavior: Intelligent predatory AI element
        // - Seeks and consumes non-gas, non-fire elements
        // - Uses neighbor-density scoring to attack exposed edges first
        // - Replicates into consumed material
        // - Random-walk movement when starving
        // Bounces off other nanobots
        // - Dies after 60 frames, with 10% chance of explosion
        
        const neighborOffsets = [
            {dx: 0, dy: -1},  {dx: 0, dy: 1},   // up, down
            {dx: -1, dy: 0},  {dx: 1, dy: 0},   // left, right
            {dx: -1, dy: -1}, {dx: 1, dy: -1},  // diagonals
            {dx: -1, dy: 1},  {dx: 1, dy: 1}
        ];
        
        // Phase 1: Seek consumable targets using neighbor-density scoring
        let bestCandidates = [];
        let minNeighbors = 99;
        
        for (let offset of neighborOffsets) {
            const nx = x + offset.dx;
            const ny = y + offset.dy;
            
            if (nx >= 0 && nx < this.gridWidth && ny >= 0 && ny < this.gridHeight) {
                const nIdx = this.getIdx(nx, ny);
                const nType = this.cells[nIdx];
                
                // Check if target is consumable (not EMPTY, NANOBOT, FIRE, or GAS)
                if (nType !== TYPE.EMPTY && 
                    nType !== TYPE.NANOBOT && 
                    nType !== TYPE.FIRE && 
                    this.LUT_STATE[nType] !== STATE.GAS) {
                    
                    // Calculate neighbor density score for this target
                    let score = 0;
                    for (let subOffset of neighborOffsets) {
                        const nnx = nx + subOffset.dx;
                        const nny = ny + subOffset.dy;
                        
                        if (nnx >= 0 && nnx < this.gridWidth && nny >= 0 && nny < this.gridHeight) {
                            const nnIdx = this.getIdx(nnx, nny);
                            const nnType = this.cells[nnIdx];
                            
                            // Count solid/static neighbors (higher score = more protected)
                            if (nnType !== TYPE.EMPTY && 
                                nnType !== TYPE.NANOBOT && 
                                nnType !== TYPE.FIRE && 
                                this.LUT_STATE[nnType] !== STATE.GAS) {
                                score++;
                            }
                        }
                    }
                    
                    // Track targets with lowest neighbor count (most exposed)
                    if (score < minNeighbors) {
                        minNeighbors = score;
                        bestCandidates = [nIdx];
                    } else if (score === minNeighbors) {
                        bestCandidates.push(nIdx);
                    }
                }
            }
        }
        
        // Phase 2: Consumption and replication
        if (bestCandidates.length > 0) {
            // Select random target from best candidates
            const target = bestCandidates[Math.floor(this.fastRand() * bestCandidates.length)];
            
            // Convert target to nanobot (replication)
            this.cells[target] = TYPE.NANOBOT;
            this.variations[target] = this.variations[i];
            this.life[target] = 90; // Full life (1.5 seconds)
            this.moved[target] = 1;
            
            // Record particle creation for undo
            this.recordParticleCreation(target, TYPE.NANOBOT);
            
            // Original nanobot dies (moves into target)
            this.cells[i] = TYPE.EMPTY;
            this.life[i] = 0;
            this.moved[i] = 1;
            
            return; // Skip starvation logic
        }
        
        // Phase 3: Starvation - decrement life
        this.life[i]--;
        
        // Phase 4: Death
        if (this.life[i] <= 0) {
            // 10% chance of large explosion, 90% small explosion
            const radius = this.fastRand() < 0.1 ? 10 : 3;
            this.explode(x, y, radius);
            this.cells[i] = TYPE.EMPTY;
            return;
        }
        
        // Phase 5: Random-walk movement with bounce
        const moveSteps = 1; // Move once per frame
        let currX = x;
        let currY = y;
        let currIdx = i;
        
        for (let s = 0; s < moveSteps; s++) {
            // Generate random direction (-1, 0, or 1)
            let rDx = Math.floor(this.fastRand() * 3) - 1;
            let rDy = Math.floor(this.fastRand() * 3) - 1;
            
            if (rDx === 0 && rDy === 0) continue; // No movement
            
            let nextX = currX + rDx;
            let nextY = currY + rDy;
            
            if (nextX >= 0 && nextX < this.gridWidth && nextY >= 0 && nextY < this.gridHeight) {
                const nextIdx = this.getIdx(nextX, nextY);
                const nextType = this.cells[nextIdx];
                
                // Bounce off other nanobots
                if (nextType === TYPE.NANOBOT) {
                    rDx = -rDx;
                    rDy = -rDy;
                    nextX = currX + rDx;
                    nextY = currY + rDy;
                    
                    if (nextX >= 0 && nextX < this.gridWidth && nextY >= 0 && nextY < this.gridHeight) {
                        const bounceIdx = this.getIdx(nextX, nextY);
                        if (this.cells[bounceIdx] === TYPE.EMPTY) {
                            this.swap(currIdx, bounceIdx);
                            currIdx = bounceIdx;
                            currX = nextX;
                            currY = nextY;
                        }
                    }
                } else if (nextType === TYPE.EMPTY) {
                    // Move into empty space
                    this.swap(currIdx, nextIdx);
                    currIdx = nextIdx;
                    currX = nextX;
                    currY = nextY;
                }
            }
        }
    }


    explode(cx, cy, radius) {
        // Create fire/smoke explosion at position
        const interactMinY = Math.max(0, cy - radius - 5);
        if (interactMinY < this.minActiveY) this.minActiveY = interactMinY;

        const r2 = radius * radius;

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx * dx + dy * dy <= r2) {
                    const nx = cx + dx;
                    const ny = cy + dy;

                    if (nx >= 0 && nx < this.gridWidth && ny >= 0 && ny < this.gridHeight) {
                        const idx = this.getIdx(nx, ny);

                        // Don't destroy stone (walls)
                        if (this.cells[idx] !== TYPE.STONE) {
                            const rand = this.fastRand();

                            if (rand > 0.3) {
                                this.setType(idx, TYPE.FIRE);
                            } else if (rand > 0.1) {
                                this.setType(idx, TYPE.SMOKE);
                            } else {
                                this.setType(idx, TYPE.EMPTY);
                            }
                        }
                    }
                }
            }
        }
    }


    // ========================================================================
    // RENDERING
    // ========================================================================

    render() {
        // Render all cells to image data
        for (let i = 0; i < this.cellCount; i++) {
            const type = this.cells[i];
            
            if (type === TYPE.EMPTY) {
                // Background color
                this.data[i] = 0xFF080707; // ABGR format
                continue;
            }
            
            // Get base color
            let r = this.LUT_COLOR_R[type];
            let g = this.LUT_COLOR_G[type];
            let b = this.LUT_COLOR_B[type];
            
            // STONE HEAT VISUALS
            if (type === TYPE.STONE && this.life[i] > 0) {
                // Calculate heat percentage (0.0 to 1.0) based on melt threshold (200)
                const heatLevel = Math.min(1.0, this.life[i] / 200);
                
                // Interpolate from Stone Grey [82, 79, 69] to Hot Glowing Red [255, 60, 20]
                // Formula: start + (end - start) * percent
                r = 82 + (173 * heatLevel);  // Red goes up significantly
                g = 79 - (19 * heatLevel);   // Green drops slightly
                b = 69 - (49 * heatLevel);   // Blue drops significantly
                
                // Add a "shimmer" effect when it gets very hot
                if (heatLevel > 0.5) {
                    const shimmer = (this.fastRand() * 30 * heatLevel);
                    r = Math.min(255, r + shimmer);
                }
            }
            
            // GRAVEL HEAT VISUALS (same as stone but with gravel base color)
            if (type === TYPE.GRAVEL && this.life[i] > 0) {
                // Calculate heat percentage (0.0 to 1.0) based on melt threshold (200)
                const heatLevel = Math.min(1.0, this.life[i] / 200);
                
                // Interpolate from Gravel Grey [95, 92, 82] to Hot Glowing Red [255, 60, 20]
                r = 95 + (160 * heatLevel);  // Red goes up significantly
                g = 92 - (32 * heatLevel);   // Green drops slightly
                b = 82 - (62 * heatLevel);   // Blue drops significantly
                
                // Add a "shimmer" effect when it gets very hot
                if (heatLevel > 0.5) {
                    const shimmer = (this.fastRand() * 30 * heatLevel);
                    r = Math.min(255, r + shimmer);
                }
            }
            
            // LAVA COLOR TEMPERATURE LOGIC
            if (type === TYPE.LAVA) {
                // Life ranges from ~1800 (hot) to 0 (cold)
                // Normalize life to 0.0 - 1.0 range based on avg max life (approx 1500)
                const temp = Math.min(1.0, this.life[i] / 1500);
                
                // Interpolate from Dark Red (Cold) to Bright Yellow (Hot)
                // Cold: 80, 20, 20
                // Hot:  255, 220, 50
                r = 80 + (temp * 175);  // 80 -> 255
                g = 20 + (temp * 200);  // 20 -> 220
                b = 20 + (temp * 30);   // 20 -> 50
            }
            
            // Apply variation
            const v = this.variations[i];
            let bloom = 0;
            
            // Add glow effect for certain elements
            if (this.LUT_GLOW[type]) {
                const hash = (i + this.frameCount) & 31;
                bloom = hash;
            } else {
                const hash = (i + this.frameCount) & 15;
                bloom = hash;
            }
            
            // Special rendering for fire
            if (type === TYPE.FIRE) {
                const l = this.life[i];
                if (l > 80) {
                    r = 255; g = 255; b = 100;
                } else if (l > 40) {
                    r = 255; g = 100; b = 0;
                } else {
                    r = 150; g = 10; b = 10;
                }
                r += bloom;
                g += bloom;
                b += bloom * 0.5;
            }
            // Special rendering for burning oil
            else if (type === TYPE.OIL && this.life[i] > 0) {
                // Burning oil glows orange/red
                const burnIntensity = Math.min(1, this.life[i] / 90); // 0-1 range
                r = Math.min(255, r + 150 * burnIntensity);
                g = Math.min(255, g + 50 * burnIntensity);
                b = Math.max(0, b - 20 * burnIntensity);
                r += bloom * 2;
                g += bloom;
            }
            // Special rendering for burning oiled wood
            else if (type === TYPE.WOOD_OILED && this.life[i] > 0) {
                // Burning oiled wood glows orange/red
                const burnIntensity = Math.min(1, this.life[i] / 300); // 0-1 range
                r = Math.min(255, r + 180 * burnIntensity);
                g = Math.min(255, g + 60 * burnIntensity);
                b = Math.max(0, b - 10 * burnIntensity);
                r += bloom * 2;
                g += bloom;
            }
            else {
                r = (r - v) + bloom;
                g = (g - v) + bloom;
                b = (b - v) + bloom;
            }
            
            // Clamp values
            if (r > 255) r = 255; else if (r < 0) r = 0;
            if (g > 255) g = 255; else if (g < 0) g = 0;
            if (b > 255) b = 255; else if (b < 0) b = 0;
            
            // Store in ABGR format
            this.data[i] = (255 << 24) | (b << 16) | (g << 8) | r;
        }
        
        // Put image data to canvas
        this.ctx.putImageData(this.imgData, 0, 0);
        
        // Draw grid overlay if enabled
        if (this.showGrid) {
            this.renderGrid();
        }
    }
    
    
    renderGrid() {
        // Grid canvas dimensions match the scaled simulation
        const canvasWidth = this.gridWidth * this.simScale;
        const canvasHeight = this.gridHeight * this.simScale;
        
        // Clear grid canvas
        this.gridCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        // Draw crisp grid lines
        const ctx = this.gridCtx;
        
        // Save context state
        ctx.save();
        
        // Use subtle color - slightly brighter for better visibility
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
        
        // Line width is 1px
        ctx.lineWidth = 1;
        
        // Cell size in canvas pixels
        const cellSize = this.simScale;
        
        // Begin path for all grid lines
        ctx.beginPath();
        
        // Draw vertical lines between cells
        // Offset by 0.5 for crisp 1px lines
        for (let x = 0; x <= this.gridWidth; x++) {
            const xPos = x * cellSize + 0.5;
            ctx.moveTo(xPos, 0);
            ctx.lineTo(xPos, canvasHeight);
        }
        
        // Draw horizontal lines between cells
        for (let y = 0; y <= this.gridHeight; y++) {
            const yPos = y * cellSize + 0.5;
            ctx.moveTo(0, yPos);
            ctx.lineTo(canvasWidth, yPos);
        }
        
        // Stroke all lines at once for performance
        ctx.stroke();
        
        // Restore context state
        ctx.restore();
    }

    animate(timeStamp) {
        const dt = timeStamp - this.lastTime;
        this.lastTime = timeStamp;
        
        // Allow drawing whenever we're in live mode (not viewing history), even if paused
        if (this.currentHistoryIndex === -1) {
            if (this.isMouseDown && (this.activeTool === 'brush' || this.activeTool === 'eraser')) {
                // Check if mouse has been held long enough to enable continuous drawing
                const holdTime = performance.now() - this.mouseDownTime;
                if (!this.continuousDrawEnabled && holdTime >= this.continuousDrawDelay) {
                    this.continuousDrawEnabled = true;
                }
                
                // Only draw continuously if enabled (prevents single click spam)
                if (this.continuousDrawEnabled) {
                    if (this.lastDrawX !== null && this.lastDrawY !== null) {
                        this.drawLine(this.lastDrawX, this.lastDrawY, this.mouseX, this.mouseY);
                    } else {
                        this.interact(this.mouseX, this.mouseY, 
                            this.activeTool === 'brush' ? this.brushSize : this.eraserSize);
                    }
                    this.lastDrawX = this.mouseX;
                    this.lastDrawY = this.mouseY;
                }
            }
        }
        
        // Only update physics and record history when not paused and in live mode
        if (!this.isPaused && this.currentHistoryIndex === -1) {
            this.update(dt);
            this.saveFrame();
            this.frameCount++;
        }
        
        // Always render (even when paused or viewing history)
        this.render();
        
        requestAnimationFrame((ts) => this.animate(ts));
    }
    
    
    
    
    
    // ========================================================================
    // INTERACTION SYSTEM - Tools & Drawing
    // ========================================================================
    
    handleToolAction(event) {
        // Save state before action (for undo) - only for fill tool
        // Brush/eraser already saved in mousedown/touchstart
        if (!this.isRestoringAction && !this.isDragging && this.activeTool === 'fill') {
            this.saveActionState();
            this.isDragging = true; // Mark that we're in a drag operation
        }
        
        if (this.activeTool === 'brush' || this.activeTool === 'eraser') {
            const currentSize = this.activeTool === 'brush' ? this.brushSize : this.eraserSize;
            
            // Check if shift is held and we have a previous click position
            if (event && event.shiftKey && 
                this.lastClickX !== null && this.lastClickY !== null &&
                this.lastClickTool === this.activeTool) {
                // Draw line from last click to current position with interpolated size
                this.drawLineWithInterpolatedSize(
                    this.lastClickX, this.lastClickY, this.lastClickSize,
                    this.mouseX, this.mouseY, currentSize
                );
            } else {
                // Normal single click/touch
                this.lastDrawX = this.mouseX;
                this.lastDrawY = this.mouseY;
                this.interact(this.mouseX, this.mouseY, currentSize);
            }
        } else if (this.activeTool === 'fill') {
            const typeId = ELEMENT_MAP[this.activeElement] || TYPE.SAND;
            this.floodFill(this.mouseX, this.mouseY, typeId);
        } else if (this.activeTool === 'picker') {
            this.pickElement(this.mouseX, this.mouseY);
        }
    }
    
    
    interact(x, y, size) {
        // Paint or erase in a circular area
        // Convert size (diameter in cells) to radius
        // size 1 = single cell (radius 0), size 2 = 2x2 (radius 1), etc.
        const radius = (size - 1) / 2;
        const radiusCeil = Math.ceil(radius);
        
        const interactMinY = Math.max(0, y - radiusCeil - 5);
        if (interactMinY < this.minActiveY) this.minActiveY = interactMinY;
        
        const typeToDraw = this.activeTool === 'eraser' ? 
            TYPE.EMPTY : (ELEMENT_MAP[this.activeElement] || TYPE.SAND);
        
        const r2 = radius * radius;
        
        for (let dy = -radiusCeil; dy <= radiusCeil; dy++) {
            for (let dx = -radiusCeil; dx <= radiusCeil; dx++) {
                if (dx * dx + dy * dy <= r2) {
                    const nx = x + dx;
                    const ny = y + dy;
                    
                    if (nx >= 0 && nx < this.gridWidth && ny >= 0 && ny < this.gridHeight) {
                        const idx = this.getIdx(nx, ny);
                        
                        // Don't let fire overwrite stone or gravel (both are fireproof)
                        // But allow fire to heat lava when drawn over it
                        if (this.activeTool === 'brush' && typeToDraw === TYPE.FIRE && 
                            (this.cells[idx] === TYPE.STONE || this.cells[idx] === TYPE.GRAVEL)) {
                            continue;
                        }
                        
                        // Special case: fire drawn over lava adds heat instead of replacing it
                        if (this.activeTool === 'brush' && typeToDraw === TYPE.FIRE && 
                            this.cells[idx] === TYPE.LAVA) {
                            // Add significant heat to lava (max 1500)
                            this.life[idx] = Math.min(1500, this.life[idx] + 200);
                            continue;
                        }
                        
                        if (this.fastRand() > 0.1) {
                            // Record particle creation (for undo)
                            this.recordParticleCreation(idx, typeToDraw);
                            
                            this.cells[idx] = typeToDraw;
                            this.life[idx] = 0;
                            
                            // Set lifetime for temporary elements
                            if (typeToDraw === TYPE.FIRE || typeToDraw === TYPE.SMOKE) {
                                this.life[idx] = 100 + this.fastRand() * 50;
                            } else if (typeToDraw === TYPE.STEAM) {
                                this.life[idx] = 100;
                            } else if (typeToDraw === TYPE.LAVA) {
                                this.life[idx] = 1200 + Math.floor(this.fastRand() * 600); // 20-30 seconds
                            } else if (typeToDraw === TYPE.NANOBOT) {
                                this.life[idx] = 90; // 90 frames lifespan (1.5 seconds)
                            }
                            
                            this.variations[idx] = this.fastRand() * 30;
                        }
                    }
                }
            }
        }
    }
    
    
    drawLine(x0, y0, x1, y1) {
        // Bresenham's line algorithm for smooth drawing
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        
        while (true) {
            this.interact(x0, y0, this.activeTool === 'brush' ? this.brushSize : this.eraserSize);
            
            if (x0 === x1 && y0 === y1) break;
            
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x0 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y0 += sy;
            }
        }
    }
    
    
    drawLineWithInterpolatedSize(x0, y0, size0, x1, y1, size1) {
        // Draw line with gradually changing size (like Photoshop shift-click)
        // Uses Bresenham's algorithm with size interpolation
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        
        // Calculate total distance for interpolation
        const totalDistance = Math.sqrt(dx * dx + dy * dy);
        let currentDistance = 0;
        
        // Store starting position for distance calculation
        const startX = x0;
        const startY = y0;
        
        while (true) {
            // Calculate interpolation factor (0 to 1)
            const t = totalDistance > 0 ? currentDistance / totalDistance : 0;
            
            // Interpolate size between size0 and size1
            const interpolatedSize = size0 + (size1 - size0) * t;
            
            // Draw at current position with interpolated size
            this.interact(x0, y0, interpolatedSize);
            
            if (x0 === x1 && y0 === y1) break;
            
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x0 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y0 += sy;
            }
            
            // Update distance traveled
            const distX = x0 - startX;
            const distY = y0 - startY;
            currentDistance = Math.sqrt(distX * distX + distY * distY);
        }
    }
    
    
    floodFill(x, y, newType) {
        if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) return;
        
        const startIdx = this.getIdx(x, y);
        const targetType = this.cells[startIdx];
        
        if (targetType === newType) return;
        
        // FIX 1: Force the entire simulation to wake up.
        // Since flood fill can travel upwards to the very top of the screen,
        // we must set minActiveY to 0 regardless of where you clicked.
        this.minActiveY = 0;
        
        const stack = [startIdx];
        let safety = 0;
        
        // FIX 2: Increase safety limit.
        // Stack-based fills often push duplicate indices before processing them.
        // A limit of cellCount * 2 is too low for empty screens. Increased to * 8.
        const maxChecks = this.cellCount * 8;
        
        while (stack.length && safety < maxChecks) {
            safety++;
            const idx = stack.pop();
            
            // If this cell was already processed by another stack entry, skip it
            if (this.cells[idx] !== targetType) continue;
            
            // Record particle creation (for undo)
            this.recordParticleCreation(idx, newType);
            
            this.setType(idx, newType);
            this.variations[idx] = this.fastRand() * 20;
            
            const cx = idx % this.gridWidth;
            const cy = Math.floor(idx / this.gridWidth);
            
            // Push all 8 neighbors (cardinal + diagonal)
            // Cardinal directions (always check these)
            if (cy > 0) stack.push(idx - this.gridWidth);                                    // up
            if (cy < this.gridHeight - 1) stack.push(idx + this.gridWidth);                  // down
            if (cx > 0) stack.push(idx - 1);                                                 // left
            if (cx < this.gridWidth - 1) stack.push(idx + 1);                                // right
            
            // Diagonal directions (only if both adjacent cardinals are passable)
            // This prevents leaking through diagonal gaps in barriers
            if (cy > 0 && cx > 0) {
                // up-left: only if up AND left are passable
                const upIdx = idx - this.gridWidth;
                const leftIdx = idx - 1;
                if (this.cells[upIdx] === targetType && this.cells[leftIdx] === targetType) {
                    stack.push(idx - this.gridWidth - 1);
                }
            }
            if (cy > 0 && cx < this.gridWidth - 1) {
                // up-right: only if up AND right are passable
                const upIdx = idx - this.gridWidth;
                const rightIdx = idx + 1;
                if (this.cells[upIdx] === targetType && this.cells[rightIdx] === targetType) {
                    stack.push(idx - this.gridWidth + 1);
                }
            }
            if (cy < this.gridHeight - 1 && cx > 0) {
                // down-left: only if down AND left are passable
                const downIdx = idx + this.gridWidth;
                const leftIdx = idx - 1;
                if (this.cells[downIdx] === targetType && this.cells[leftIdx] === targetType) {
                    stack.push(idx + this.gridWidth - 1);
                }
            }
            if (cy < this.gridHeight - 1 && cx < this.gridWidth - 1) {
                // down-right: only if down AND right are passable
                const downIdx = idx + this.gridWidth;
                const rightIdx = idx + 1;
                if (this.cells[downIdx] === targetType && this.cells[rightIdx] === targetType) {
                    stack.push(idx + this.gridWidth + 1);
                }
            }
        }
        
        // Finalize action for undo (save delta to history)
        this.finalizeAction();
    }
    
    
    pickElement(x, y) {
        if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) return;
        
        const idx = this.getIdx(x, y);
        const pickedType = this.cells[idx];
        
        if (pickedType === TYPE.EMPTY) {
            this.activeTool = 'eraser';
            this.updateToolUI('eraser');
        } else {
            // Find element name from type
            for (let [name, typeId] of Object.entries(ELEMENT_MAP)) {
                if (typeId === pickedType) {
                    this.activeElement = name;
                    
                    // Update UI
                    document.querySelectorAll('.element-item').forEach(item => {
                        item.classList.remove('active');
                        if (item.dataset.elem === name) {
                            item.classList.add('active');
                        }
                    });
                    
                    this.activeTool = 'brush';
                    this.updateToolUI('brush');
                    break;
                }
            }
        }
    }
    
    
    
    
    
    // ========================================================================
    // PLAYBACK CONTROLS - Pause, Frame Stepping, History
    // ========================================================================
    
    togglePause() {
        this.isPaused = !this.isPaused;
        const playPauseBtn = document.getElementById('play-pause');
        const icon = playPauseBtn.querySelector('i');
        
        if (this.isPaused) {
            icon.className = 'fas fa-play';
        } else {
            icon.className = 'fas fa-pause';
            // When resuming, return to live mode
            this.currentHistoryIndex = -1;
        }
        
        this.updateStepButtonStates();
    }
    
    
    stepBackward() {
        if (this.frameHistory.length === 0) return;
        
        // If in live mode, start from the most recent frame
        if (this.currentHistoryIndex === -1) {
            this.currentHistoryIndex = this.frameHistory.length - 1;
        } else if (this.currentHistoryIndex > 0) {
            this.currentHistoryIndex--;
        }
        
        // Restore the frame
        this.restoreFrame(this.currentHistoryIndex);
        this.updateStepButtonStates();
    }
    
    
    stepForward() {
        // If in live mode (paused), run one simulation step
        if (this.currentHistoryIndex === -1) {
            if (!this.isPaused) return; // Can't step forward if playing
            
            // Run a single update
            this.update(16); // ~60fps frame time
            this.saveFrame();
            this.frameCount++;
        } else {
            // Viewing history - move forward
            this.currentHistoryIndex++;
            
            // If we've reached the end, return to live mode
            if (this.currentHistoryIndex >= this.frameHistory.length) {
                this.currentHistoryIndex = -1;
            } else {
                // Restore the frame
                this.restoreFrame(this.currentHistoryIndex);
            }
        }
        
        this.updateStepButtonStates();
    }
    
    
    updateStepButtonStates() {
        const stepBackwardBtn = document.getElementById('step-backward');
        const stepForwardBtn = document.getElementById('step-forward');
        
        // Backward is disabled if no history or at the oldest frame
        if (this.frameHistory.length === 0 || 
            (this.currentHistoryIndex !== -1 && this.currentHistoryIndex === 0)) {
            stepBackwardBtn.classList.add('disabled');
        } else {
            stepBackwardBtn.classList.remove('disabled');
        }
        
        // Forward is disabled only if playing in live mode
        // Enabled when: paused in live mode OR viewing history (not at end)
        if (this.currentHistoryIndex === -1) {
            // In live mode - enable only if paused
            if (this.isPaused) {
                stepForwardBtn.classList.remove('disabled');
            } else {
                stepForwardBtn.classList.add('disabled');
            }
        } else {
            // Viewing history - always enabled
            stepForwardBtn.classList.remove('disabled');
        }
    }
    
    
    saveFrame() {
        // Only save frames when in live mode
        if (this.currentHistoryIndex !== -1) return;
        
        // Create a snapshot of the current state
        const frame = {
            cells: new Uint8Array(this.cells),
            variations: new Uint8Array(this.variations),
            life: new Uint16Array(this.life)
        };
        
        this.frameHistory.push(frame);
        
        // Limit history size
        if (this.frameHistory.length > this.maxHistoryFrames) {
            this.frameHistory.shift();
        }
    }
    
    
    restoreFrame(index) {
        if (index < 0 || index >= this.frameHistory.length) return;
        
        const frame = this.frameHistory[index];
        this.cells.set(frame.cells);
        this.variations.set(frame.variations);
        this.life.set(frame.life);
    }
    
    
    
    
    
    // ========================================================================
    // UTILITY FUNCTIONS
    // ========================================================================
    
    getIdx(x, y) {
        return y * this.gridWidth + x;
    }
    
    
    
    
    
    // ========================================================================
    // PARTICLE MANIPULATION UTILITIES
    // ========================================================================
    
    swap(i, j) {
        const tempType = this.cells[i];
        const tempVar = this.variations[i];
        const tempLife = this.life[i];
        const tempId = this.particleId[i];
        
        this.cells[i] = this.cells[j];
        this.variations[i] = this.variations[j];
        this.life[i] = this.life[j];
        this.particleId[i] = this.particleId[j];
        
        this.cells[j] = tempType;
        this.variations[j] = tempVar;
        this.life[j] = tempLife;
        this.particleId[j] = tempId;
        
        this.moved[i] = 1;
        this.moved[j] = 1;
    }
    
    
    moveParticle(fromIdx, toIdx) {
        // Copy all properties from source to destination
        this.cells[toIdx] = this.cells[fromIdx];
        this.variations[toIdx] = this.variations[fromIdx];
        this.life[toIdx] = this.life[fromIdx];
        this.particleId[toIdx] = this.particleId[fromIdx];
        
        // Clear old location
        this.cells[fromIdx] = TYPE.EMPTY;
        this.variations[fromIdx] = 0;
        this.life[fromIdx] = 0;
        this.particleId[fromIdx] = 0;
        
        // Mark destination as moved
        this.moved[toIdx] = 1;
    }
    
    
    setType(idx, type) {
        this.cells[idx] = type;
        this.moved[idx] = 1;
        
        // Set initial lifetime based on particle type
        const lifetimeConfig = INITIAL_LIFETIME[type];
        this.life[idx] = lifetimeConfig ? lifetimeConfig() : 0;
    }
    
    
    fastRand() {
        // Fast pseudo-random number generator
        let t = this.rngState ^ (this.rngState << 13);
        t ^= t >>> 17;
        this.rngState = t ^ (t << 5);
        return (this.rngState >>> 0) / 4294967296;
    }
}


// ============================================================================
// START APPLICATION
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
