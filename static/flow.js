/**
 * IOSControl Flow Builder — Visual Automation (No-Code)
 * Drag & drop blocks, connect with arrows, generate Python code
 */

// ═══════════════════════════════════════════
// Node Type Definitions
// ═══════════════════════════════════════════

const NODE_TYPES = {
    start:       { label: 'Start',        icon: '🟢', color: '#10B981', category: 'flow',   inputs: 0, outputs: 1, config: [] },
    end:         { label: 'End',          icon: '🔴', color: '#EF4444', category: 'flow',   inputs: 1, outputs: 0, config: [] },
    tap:         { label: 'Tap',          icon: '👆', color: '#3B82F6', category: 'touch',  inputs: 1, outputs: 1, config: [
        { key: 'x', label: 'X', type: 'number', default: 200 },
        { key: 'y', label: 'Y', type: 'number', default: 400 },
    ]},
    swipe:       { label: 'Swipe',        icon: '👉', color: '#3B82F6', category: 'touch',  inputs: 1, outputs: 1, config: [
        { key: 'x1', label: 'From X', type: 'number', default: 200 },
        { key: 'y1', label: 'From Y', type: 'number', default: 600 },
        { key: 'x2', label: 'To X',   type: 'number', default: 200 },
        { key: 'y2', label: 'To Y',   type: 'number', default: 200 },
        { key: 'duration', label: 'Duration (s)', type: 'number', default: 0.5 },
    ]},
    long_press:  { label: 'Long Press',   icon: '👇', color: '#3B82F6', category: 'touch',  inputs: 1, outputs: 1, config: [
        { key: 'x', label: 'X', type: 'number', default: 200 },
        { key: 'y', label: 'Y', type: 'number', default: 400 },
        { key: 'duration', label: 'Duration (s)', type: 'number', default: 1.0 },
    ]},
    type_text:   { label: 'Type Text',    icon: '⌨️', color: '#8B5CF6', category: 'input',  inputs: 1, outputs: 1, config: [
        { key: 'text', label: 'Text', type: 'text', default: 'Hello World' },
    ]},
    wait:        { label: 'Wait',         icon: '⏳', color: '#F59E0B', category: 'timing', inputs: 1, outputs: 1, config: [
        { key: 'seconds', label: 'Seconds', type: 'number', default: 1.0 },
    ]},
    random_wait: { label: 'Random Wait',  icon: '🎲', color: '#F59E0B', category: 'timing', inputs: 1, outputs: 1, config: [
        { key: 'min_s', label: 'Min (s)', type: 'number', default: 0.5 },
        { key: 'max_s', label: 'Max (s)', type: 'number', default: 2.0 },
    ]},
    open_app:    { label: 'Open App',     icon: '🚀', color: '#22D3EE', category: 'app',    inputs: 1, outputs: 1, config: [
        { key: 'bundle_id', label: 'Bundle ID', type: 'text', default: 'com.apple.mobilesafari' },
    ]},
    close_app:   { label: 'Close App',    icon: '💀', color: '#EF4444', category: 'app',    inputs: 1, outputs: 1, config: [
        { key: 'bundle_id', label: 'Bundle ID', type: 'text', default: 'com.apple.mobilesafari' },
    ]},
    open_url:    { label: 'Open URL',     icon: '🌍', color: '#06B6D4', category: 'app',    inputs: 1, outputs: 1, config: [
        { key: 'url', label: 'URL', type: 'text', default: 'https://example.com' },
    ]},
    screenshot:  { label: 'Screenshot',   icon: '📸', color: '#14B8A6', category: 'screen', inputs: 1, outputs: 1, config: [
        { key: 'filename', label: 'Filename', type: 'text', default: 'screen.png' },
    ]},
    find_image:  { label: 'Find Image',   icon: '🖼️', color: '#14B8A6', category: 'screen', inputs: 1, outputs: 2, config: [
        { key: 'path', label: 'Image Path', type: 'text', default: 'target.png' },
        { key: 'threshold', label: 'Match %', type: 'number', default: 0.9 },
        { key: 'timeout', label: 'Timeout (s)', type: 'number', default: 10 },
    ]},
    if_color:    { label: 'Check Color',  icon: '🎨', color: '#F97316', category: 'screen', inputs: 1, outputs: 2, config: [
        { key: 'x', label: 'X', type: 'number', default: 100 },
        { key: 'y', label: 'Y', type: 'number', default: 200 },
        { key: 'color', label: 'Color (hex)', type: 'text', default: 'FF0000' },
    ]},
    ocr:         { label: 'Read Text',    icon: '📖', color: '#D946EF', category: 'screen', inputs: 1, outputs: 1, config: [
        { key: 'x', label: 'Region X', type: 'number', default: 0 },
        { key: 'y', label: 'Region Y', type: 'number', default: 0 },
        { key: 'w', label: 'Width',    type: 'number', default: 400 },
        { key: 'h', label: 'Height',   type: 'number', default: 100 },
    ]},
    loop:        { label: 'For Loop',     icon: '🔄', color: '#A855F7', category: 'flow',   inputs: 1, outputs: 1, config: [
        { key: 'count', label: 'Repeat', type: 'number', default: 3 },
    ]},
    loop_end:    { label: 'Loop End',     icon: '🔚', color: '#A855F7', category: 'flow',   inputs: 1, outputs: 1, config: [] },
    if_else:     { label: 'If / Else',    icon: '🔀', color: '#F59E0B', category: 'flow',   inputs: 1, outputs: 2, config: [
        { key: 'condition_type', label: 'Condition', type: 'select', default: 'color_match',
          options: ['color_match', 'color_not_match', 'app_foreground', 'custom'] },
        { key: 'x', label: 'X', type: 'number', default: 100 },
        { key: 'y', label: 'Y', type: 'number', default: 200 },
        { key: 'color', label: 'Color (hex)', type: 'text', default: 'FF0000' },
        { key: 'bundle_id', label: 'App Bundle ID', type: 'text', default: 'com.apple.mobilesafari' },
        { key: 'custom_expr', label: 'Python Expression', type: 'text', default: 'True' },
    ]},
    while_loop:  { label: 'While Loop',   icon: '♾️', color: '#7C3AED', category: 'flow',   inputs: 1, outputs: 1, config: [
        { key: 'condition_type', label: 'Run Until', type: 'select', default: 'count',
          options: ['forever', 'count', 'color_match', 'color_not_match', 'app_foreground'] },
        { key: 'count', label: 'Max Iterations', type: 'number', default: 10 },
        { key: 'x', label: 'Check X', type: 'number', default: 100 },
        { key: 'y', label: 'Check Y', type: 'number', default: 200 },
        { key: 'color', label: 'Color (hex)', type: 'text', default: 'FF0000' },
        { key: 'bundle_id', label: 'App Bundle ID', type: 'text', default: 'com.apple.mobilesafari' },
        { key: 'delay', label: 'Loop Delay (s)', type: 'number', default: 1.0 },
    ]},
    while_end:   { label: 'While End',    icon: '🔚', color: '#7C3AED', category: 'flow',   inputs: 1, outputs: 1, config: [] },
    toast:       { label: 'Toast',        icon: '💬', color: '#EC4899', category: 'util',   inputs: 1, outputs: 1, config: [
        { key: 'message', label: 'Message', type: 'text', default: 'Hello!' },
        { key: 'delay', label: 'Duration (s)', type: 'number', default: 2.0 },
    ]},
    http_get:    { label: 'HTTP GET',     icon: '📥', color: '#0EA5E9', category: 'http',   inputs: 1, outputs: 1, config: [
        { key: 'url', label: 'URL', type: 'text', default: 'https://httpbin.org/get' },
    ]},
    http_post:   { label: 'HTTP POST',    icon: '📤', color: '#0EA5E9', category: 'http',   inputs: 1, outputs: 1, config: [
        { key: 'url', label: 'URL', type: 'text', default: 'https://httpbin.org/post' },
        { key: 'body', label: 'JSON Body', type: 'textarea', default: '{"key": "value"}' },
    ]},
    log:         { label: 'Log Message',  icon: '📝', color: '#6366F1', category: 'util',   inputs: 1, outputs: 1, config: [
        { key: 'message', label: 'Message', type: 'text', default: 'Step completed' },
    ]},
    key_press:   { label: 'Press Key',    icon: '🔘', color: '#64748B', category: 'input',  inputs: 1, outputs: 1, config: [
        { key: 'key', label: 'Key', type: 'select', default: 'home', options: ['home', 'power', 'volumeUp', 'volumeDown'] },
    ]},
};

const CATEGORIES = [
    { id: 'flow',   label: '🔀 Flow Control',  types: ['start', 'end', 'if_else', 'loop', 'loop_end', 'while_loop', 'while_end'] },
    { id: 'touch',  label: '👆 Touch',          types: ['tap', 'swipe', 'long_press'] },
    { id: 'input',  label: '⌨️ Input',          types: ['type_text', 'key_press'] },
    { id: 'app',    label: '📱 Apps',           types: ['open_app', 'close_app', 'open_url'] },
    { id: 'screen', label: '🖥️ Screen',         types: ['screenshot', 'find_image', 'if_color', 'ocr'] },
    { id: 'timing', label: '⏱️ Timing',         types: ['wait', 'random_wait'] },
    { id: 'http',   label: '🌐 HTTP',           types: ['http_get', 'http_post'] },
    { id: 'util',   label: '🔧 Utility',        types: ['log', 'toast'] },
];

// ═══════════════════════════════════════════
// Flow Builder Class
// ═══════════════════════════════════════════

class FlowBuilder {
    constructor(container) {
        this.container = container;
        this.nodes = [];
        this.connections = [];
        this.nextId = 1;
        this.selectedNode = null;
        this.selectedNodes = new Set(); // multi-select
        this.draggingNode = null;
        this.dragOffset = { x: 0, y: 0 };
        this.connectingFrom = null; // { nodeId, portIndex, color }
        this.canvasOffset = { x: 0, y: 0 };
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.scale = 1.0;
        this._clipboard = null;
        // Rubber-band selection
        this._selecting = false;
        this._selRect = { x: 0, y: 0, w: 0, h: 0 };

        this._build();
        this._addDefaultNodes();
    }

    _build() {
        this.container.innerHTML = `
            <div class="flow-layout">
                <!-- Node Palette -->
                <div class="flow-palette" id="flowPalette">
                    <div class="flow-palette-header">
                        <h3>📦 Blocks</h3>
                    </div>
                    <div class="flow-palette-body" id="flowPaletteBody"></div>
                </div>

                <!-- Canvas -->
                <div class="flow-canvas-wrapper" id="flowCanvasWrapper">
                    <div class="flow-toolbar">
                        <button class="flow-tool-btn" id="flowRunBtn" title="Run Flow">▶ Run Flow</button>
                        <button class="flow-tool-btn" id="flowCodeBtn" title="View Code">{ } View Code</button>
                        <button class="flow-tool-btn" id="flowClearBtn" title="Clear All">🗑 Clear</button>
                        <button class="flow-tool-btn" id="flowArrangeBtn" title="Auto-arrange blocks">⚡ Arrange</button>
                        <span class="flow-tool-sep"></span>
                        <button class="flow-tool-btn" id="flowZoomIn" title="Zoom In">+</button>
                        <button class="flow-tool-btn" id="flowZoomOut" title="Zoom Out">-</button>
                        <button class="flow-tool-btn" id="flowZoomReset" title="Reset Zoom">⊙</button>
                        <span class="flow-tool-info" id="flowInfo">0 blocks</span>
                    </div>
                    <div class="flow-canvas" id="flowCanvas">
                        <svg class="flow-svg" id="flowSvg"></svg>
                        <div class="flow-nodes" id="flowNodes"></div>
                    </div>
                </div>

                <!-- Properties Panel -->
                <div class="flow-props" id="flowProps">
                    <div class="flow-props-header">
                        <h3>⚙️ Properties</h3>
                    </div>
                    <div class="flow-props-body" id="flowPropsBody">
                        <p class="flow-props-empty">Select a block to configure</p>
                    </div>
                </div>
            </div>
        `;

        this._renderPalette();
        this._bindEvents();
    }

    // ── Palette ──

    _renderPalette() {
        const body = document.getElementById('flowPaletteBody');
        body.innerHTML = CATEGORIES.map(cat => `
            <div class="flow-cat">
                <div class="flow-cat-label">${cat.label}</div>
                ${cat.types.map(type => {
                    const nt = NODE_TYPES[type];
                    return `<div class="flow-palette-item" draggable="true" data-type="${type}">
                        <span class="flow-pill" style="background:${nt.color}">${nt.icon}</span>
                        <span>${nt.label}</span>
                    </div>`;
                }).join('')}
            </div>
        `).join('');

        // Drag from palette
        body.querySelectorAll('.flow-palette-item').forEach(el => {
            el.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('nodeType', el.dataset.type);
                e.dataTransfer.effectAllowed = 'copy';
            });

            // Double-click to add block to canvas
            el.addEventListener('dblclick', (e) => {
                const type = el.dataset.type;
                if (type && NODE_TYPES[type]) {
                    // Smart position: near last node or center of visible canvas
                    const canvas = document.getElementById('flowCanvas');
                    let x = 350, y = 200;
                    if (this.nodes.length > 0) {
                        const last = this.nodes[this.nodes.length - 1];
                        x = last.x;
                        y = last.y + 120; // Stack below last block
                    }
                    if (canvas) {
                        // Ensure visible in viewport
                        const maxX = canvas.scrollLeft + canvas.clientWidth - 200;
                        const maxY = canvas.scrollTop + canvas.clientHeight - 100;
                        x = Math.min(x, maxX);
                        y = Math.min(y, maxY);
                    }
                    this.addNode(type, Math.max(50, x), Math.max(50, y));
                }
            });
        });
    }

    // ── Events ──

    _bindEvents() {
        const canvas = document.getElementById('flowCanvas');
        const wrapper = document.getElementById('flowCanvasWrapper');

        // Drop from palette
        canvas.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
        canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            const type = e.dataTransfer.getData('nodeType');
            if (type && NODE_TYPES[type]) {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left + canvas.scrollLeft - 75;
                const y = e.clientY - rect.top + canvas.scrollTop - 25;
                this.addNode(type, x, y);
            }
        });

        // Canvas click to deselect or cancel connection, or start rubber-band
        canvas.addEventListener('mousedown', (e) => {
            const isEmptyArea = e.target === canvas || e.target.closest('.flow-svg') || (e.target.closest('#flowNodes') && !e.target.closest('.flow-node'));
            if (!isEmptyArea) return;

            if (this.connectingFrom) {
                this._cancelConnection();
                return;
            }
            if (e.button === 0) {
                // Start rubber-band selection
                this.selectedNode = null;
                this._clearMultiSelect();
                this._renderProps();
                const rect = canvas.getBoundingClientRect();
                this._selecting = true;
                this._selStart = {
                    x: (e.clientX - rect.left) / this.scale + canvas.scrollLeft,
                    y: (e.clientY - rect.top) / this.scale + canvas.scrollTop
                };
                this._selRect = { x: this._selStart.x, y: this._selStart.y, w: 0, h: 0 };
                // Create selection overlay div
                let selDiv = document.getElementById('flowSelRect');
                if (!selDiv) {
                    selDiv = document.createElement('div');
                    selDiv.id = 'flowSelRect';
                    selDiv.className = 'flow-selection-rect';
                    canvas.appendChild(selDiv);
                }
                selDiv.style.display = 'block';
                selDiv.style.left = this._selStart.x + 'px';
                selDiv.style.top = this._selStart.y + 'px';
                selDiv.style.width = '0px';
                selDiv.style.height = '0px';
            }
        });

        // Toolbar
        document.getElementById('flowRunBtn')?.addEventListener('click', () => this.runFlow());
        document.getElementById('flowCodeBtn')?.addEventListener('click', () => this.viewCode());
        document.getElementById('flowClearBtn')?.addEventListener('click', () => this.clearAll());
        document.getElementById('flowArrangeBtn')?.addEventListener('click', () => this.autoArrange());
        document.getElementById('flowZoomIn')?.addEventListener('click', () => {
            this.scale = Math.min(2, this.scale + 0.1);
            this._applyZoom();
        });
        document.getElementById('flowZoomOut')?.addEventListener('click', () => {
            this.scale = Math.max(0.3, this.scale - 0.1);
            this._applyZoom();
        });
        document.getElementById('flowZoomReset')?.addEventListener('click', () => {
            this.scale = 1.0;
            this._applyZoom();
        });

        // Global mouse handlers for dragging
        document.addEventListener('mousemove', (e) => this._onMouseMove(e));
        document.addEventListener('mouseup', (e) => this._onMouseUp(e));

        // Delete key + Escape to cancel connection + Copy/Paste
        document.addEventListener('keydown', (e) => {
            // Only handle when Flow tab is active
            const flowTab = document.getElementById('flowTab');
            if (!flowTab || flowTab.style.display === 'none') return;
            
            const active = document.activeElement;
            const isEditing = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.closest('.monaco-editor');

            if (e.key === 'Escape' && this.connectingFrom) {
                this._cancelConnection();
                return;
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditing) {
                if (this.selectedNodes.size > 0) {
                    const ids = [...this.selectedNodes];
                    ids.forEach(id => this.deleteNode(id));
                    this._clearMultiSelect();
                    return;
                }
                if (this.selectedNode) {
                    this.deleteNode(this.selectedNode);
                    return;
                }
            }
            // Copy: Cmd+C / Ctrl+C
            if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !isEditing) {
                const ids = this.selectedNodes.size > 0 ? [...this.selectedNodes] : (this.selectedNode ? [this.selectedNode] : []);
                if (ids.length > 0) {
                    const copiedNodes = ids.map(id => this.nodes.find(n => n.id === id)).filter(Boolean);
                    const copiedConns = this.connections.filter(c => ids.includes(c.from) && ids.includes(c.to));
                    this._clipboard = { nodes: copiedNodes.map(n => ({ type: n.type, config: { ...n.config }, x: n.x, y: n.y, origId: n.id })), connections: copiedConns.map(c => ({ ...c })) };
                    appendLog?.(`📋 Copied ${ids.length} block(s)`);
                }
                return;
            }
            // Paste: Cmd+V / Ctrl+V
            if ((e.metaKey || e.ctrlKey) && e.key === 'v' && this._clipboard && !isEditing) {
                e.preventDefault();
                const idMap = {};
                this._clearMultiSelect();
                this._clipboard.nodes.forEach(cn => {
                    const newNode = this.addNode(cn.type, cn.x + 40, cn.y + 40);
                    if (newNode) {
                        Object.assign(newNode.config, cn.config);
                        this._updateNodeDisplay(newNode.id);
                        idMap[cn.origId] = newNode.id;
                        this.selectedNodes.add(newNode.id);
                        document.getElementById(newNode.id)?.classList.add('multi-selected');
                    }
                });
                // Recreate connections between pasted nodes
                this._clipboard.connections.forEach(c => {
                    if (idMap[c.from] && idMap[c.to]) {
                        this.connections.push({ from: idMap[c.from], to: idMap[c.to], portIndex: c.portIndex });
                    }
                });
                this._renderConnections();
                // Shift clipboard for next paste
                this._clipboard.nodes.forEach(cn => { cn.x += 40; cn.y += 40; });
                return;
            }
            // Select all: Cmd+A / Ctrl+A  
            if ((e.metaKey || e.ctrlKey) && e.key === 'a' && !isEditing) {
                e.preventDefault();
                this._clearMultiSelect();
                this.nodes.forEach(n => {
                    this.selectedNodes.add(n.id);
                    document.getElementById(n.id)?.classList.add('multi-selected');
                });
                return;
            }
        });
    }

    // ── Node CRUD ──

    addNode(type, x = 300, y = 200) {
        const id = `node_${this.nextId++}`;
        const nt = NODE_TYPES[type];
        const config = {};
        nt.config.forEach(c => config[c.key] = c.default);

        const node = { id, type, x, y, config };
        this.nodes.push(node);
        this._renderNode(node);
        this._updateInfo();
        this.selectNode(id);
        return node;
    }

    deleteNode(nodeId) {
        this.connections = this.connections.filter(c => c.from !== nodeId && c.to !== nodeId);
        this.nodes = this.nodes.filter(n => n.id !== nodeId);
        document.getElementById(nodeId)?.remove();
        if (this.selectedNode === nodeId) {
            this.selectedNode = null;
            this._renderProps();
        }
        this._renderConnections();
        this._updateInfo();
    }

    selectNode(nodeId) {
        document.querySelectorAll('.flow-node.selected').forEach(el => el.classList.remove('selected'));
        this.selectedNode = nodeId;
        document.getElementById(nodeId)?.classList.add('selected');
        this._renderProps();
    }

    clearAll() {
        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        document.getElementById('flowNodes').innerHTML = '';
        this._renderConnections();
        this._renderProps();
        this._updateInfo();
        this._addDefaultNodes();
    }

    _applyZoom() {
        const canvas = document.getElementById('flowCanvas');
        if (!canvas) return;
        canvas.style.transform = `scale(${this.scale})`;
        canvas.style.transformOrigin = '0 0';
        // Expand canvas size inversely to scale so scroll area grows when zooming out
        const wrapper = document.getElementById('flowCanvasWrapper');
        if (wrapper) {
            const wRect = wrapper.getBoundingClientRect();
            const baseW = wRect.width;
            const baseH = wRect.height - 40; // minus toolbar
            canvas.style.width = Math.max(baseW / this.scale, baseW) + 'px';
            canvas.style.height = Math.max(baseH / this.scale, baseH) + 'px';
        }
        this._renderConnections();
        // Update zoom info
        const info = document.getElementById('flowInfo');
        if (info) {
            info.textContent = `${this.nodes.length} blocks · ${this.connections.length} conn · ${Math.round(this.scale * 100)}%`;
        }
    }

    autoArrange() {
        if (this.nodes.length === 0) return;

        const NODE_W = 170;
        const NODE_H = 80;
        const GAP_X = 60;
        const GAP_Y = 40;
        const START_X = 50;
        const START_Y = 50;

        // Build adjacency: find all chains following connections
        const childrenOf = {};
        const hasParent = new Set();
        this.connections.forEach(c => {
            if (!childrenOf[c.from]) childrenOf[c.from] = [];
            childrenOf[c.from].push({ to: c.to, portIndex: c.portIndex });
            hasParent.add(c.to);
        });

        // Find root nodes (no incoming connections)
        const roots = this.nodes.filter(n => !hasParent.has(n.id));
        if (roots.length === 0) roots.push(this.nodes[0]); // fallback

        // Layout using BFS per tree
        const positioned = new Set();
        let globalX = START_X;

        const layoutTree = (rootId, startX) => {
            const queue = [{ id: rootId, depth: 0, col: 0 }];
            const levels = {}; // depth -> [{id, col}]
            const visited = new Set();

            while (queue.length > 0) {
                const { id, depth, col } = queue.shift();
                if (visited.has(id)) continue;
                visited.add(id);
                positioned.add(id);

                if (!levels[depth]) levels[depth] = [];
                levels[depth].push({ id, col });

                const children = childrenOf[id] || [];
                // Sort: portIndex 0 (yes/default) left, portIndex 1 (no) right
                children.sort((a, b) => a.portIndex - b.portIndex);
                children.forEach((child, i) => {
                    if (!visited.has(child.to)) {
                        queue.push({ id: child.to, depth: depth + 1, col: col + i });
                    }
                });
            }

            // Position nodes
            let maxCol = 0;
            Object.keys(levels).forEach(d => {
                const items = levels[d];
                maxCol = Math.max(maxCol, items.length);
            });

            Object.entries(levels).forEach(([d, items]) => {
                const depth = parseInt(d);
                items.forEach((item, idx) => {
                    const node = this.nodes.find(n => n.id === item.id);
                    if (node) {
                        const totalWidth = items.length * (NODE_W + GAP_X) - GAP_X;
                        const offsetX = startX + idx * (NODE_W + GAP_X) - (items.length > 1 ? totalWidth / 2 - NODE_W / 2 : 0);
                        node.x = Math.max(20, items.length === 1 ? startX : offsetX);
                        node.y = START_Y + depth * (NODE_H + GAP_Y);
                    }
                });
            });

            return maxCol;
        };

        // Layout each disconnected tree
        roots.forEach(root => {
            const cols = layoutTree(root.id, globalX);
            globalX += Math.max(1, cols) * (NODE_W + GAP_X) + GAP_X;
        });

        // Position any remaining unpositioned nodes
        let floatY = START_Y;
        this.nodes.forEach(n => {
            if (!positioned.has(n.id)) {
                n.x = globalX;
                n.y = floatY;
                floatY += NODE_H + GAP_Y;
            }
        });

        // Update DOM positions with animation
        this.nodes.forEach(node => {
            const el = document.getElementById(node.id);
            if (el) {
                el.style.transition = 'left 0.3s ease, top 0.3s ease';
                el.style.left = node.x + 'px';
                el.style.top = node.y + 'px';
                setTimeout(() => { el.style.transition = ''; }, 350);
            }
        });

        this._renderConnections();
    }

    _addDefaultNodes() {
        this.addNode('start', 350, 50);
    }

    // ── Node Rendering ──

    _renderNode(node) {
        const nt = NODE_TYPES[node.type];
        const el = document.createElement('div');
        el.id = node.id;
        el.className = 'flow-node';
        el.style.left = node.x + 'px';
        el.style.top = node.y + 'px';
        el.style.borderColor = nt.color;

        // Build port HTML
        let portsTop = '';
        let portsBottom = '';

        if (nt.inputs > 0) {
            portsTop = `<div class="flow-port flow-port-in" data-node="${node.id}" data-port="in" style="background:${nt.color}"></div>`;
        }

        if (nt.outputs === 1) {
            portsBottom = `<div class="flow-port flow-port-out" data-node="${node.id}" data-port="out-0" style="background:${nt.color}"></div>`;
        } else if (nt.outputs === 2) {
            portsBottom = `
                <div class="flow-port flow-port-out flow-port-yes" data-node="${node.id}" data-port="out-0" style="background:#10B981" title="Yes / Found">
                    <span class="flow-port-label">✓</span>
                </div>
                <div class="flow-port flow-port-out flow-port-no" data-node="${node.id}" data-port="out-1" style="background:#EF4444" title="No / Not Found">
                    <span class="flow-port-label">✗</span>
                </div>
            `;
        }

        // Config summary
        let summary = '';
        const entries = Object.entries(node.config);
        if (entries.length > 0) {
            summary = entries.map(([k, v]) => {
                const val = String(v).length > 15 ? String(v).slice(0, 15) + '…' : v;
                return `<span class="flow-node-param">${val}</span>`;
            }).join(' ');
        }

        el.innerHTML = `
            ${portsTop}
            <div class="flow-node-header" style="background:${nt.color}15; border-bottom: 1px solid ${nt.color}30;">
                <span class="flow-node-icon">${nt.icon}</span>
                <span class="flow-node-title">${nt.label}</span>
            </div>
            <div class="flow-node-body">${summary || '<span class="flow-node-hint">Click to configure</span>'}</div>
            ${portsBottom}
        `;

        // Drag node
        const header = el.querySelector('.flow-node-header');
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.flow-port')) return;
            e.preventDefault();
            this.draggingNode = node.id;
            const rect = el.getBoundingClientRect();
            this.dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            el.classList.add('dragging');
            this.selectNode(node.id);
        });

        // Click to select
        el.addEventListener('mousedown', (e) => {
            if (!e.target.closest('.flow-port')) {
                this.selectNode(node.id);
            }
        });

        // Port click → start connection
        el.querySelectorAll('.flow-port').forEach(port => {
            port.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const portType = port.dataset.port;

                if (portType.startsWith('out')) {
                    // Start connection from output port
                    const portIndex = parseInt(portType.split('-')[1]);
                    const color = portIndex === 1 ? '#EF4444' : '#10B981';
                    this.connectingFrom = { nodeId: node.id, portIndex, color };
                    port.classList.add('connecting');
                    this._enterConnectMode(node.id);
                } else if (portType === 'in' && this.connectingFrom) {
                    this._completeConnection(node.id);
                }
            });

            port.addEventListener('mouseup', (e) => {
                if (port.dataset.port === 'in' && this.connectingFrom) {
                    e.stopPropagation();
                    this._completeConnection(node.id);
                }
            });
        });

        // Allow clicking on the entire block to complete connection
        el.addEventListener('mousedown', (e) => {
            if (this.connectingFrom && this.connectingFrom.nodeId !== node.id) {
                const nt2 = NODE_TYPES[node.type];
                if (nt2.inputs > 0) {
                    e.stopPropagation();
                    this._completeConnection(node.id);
                }
            }
        });

        document.getElementById('flowNodes').appendChild(el);
    }

    _updateNodeDisplay(nodeId) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return;
        const el = document.getElementById(nodeId);
        if (!el) return;

        const entries = Object.entries(node.config);
        const body = el.querySelector('.flow-node-body');
        if (entries.length > 0 && body) {
            body.innerHTML = entries.map(([k, v]) => {
                const val = String(v).length > 15 ? String(v).slice(0, 15) + '…' : v;
                return `<span class="flow-node-param">${val}</span>`;
            }).join(' ');
        }
    }

    // ── Connection Logic ──

    _completeConnection(toNodeId) {
        if (!this.connectingFrom) return;
        const { nodeId: fromId, portIndex } = this.connectingFrom;

        // Don't connect to self
        if (fromId === toNodeId) { this._cancelConnection(); return; }

        // Don't duplicate
        const exists = this.connections.find(c => c.from === fromId && c.to === toNodeId && c.portIndex === portIndex);
        if (exists) { this._cancelConnection(); return; }

        // Remove existing connection from this port
        this.connections = this.connections.filter(c => !(c.from === fromId && c.portIndex === portIndex));

        // Remove existing connection to this input
        this.connections = this.connections.filter(c => c.to !== toNodeId);

        this.connections.push({ from: fromId, to: toNodeId, portIndex });
        this._cancelConnection();
        this._renderConnections();
    }

    _cancelConnection() {
        this.connectingFrom = null;
        document.querySelectorAll('.flow-port.connecting').forEach(p => p.classList.remove('connecting'));
        this._exitConnectMode();
        this._renderConnections(); // Remove temp line
    }

    _enterConnectMode(fromNodeId) {
        // Add 'connect-mode' class to canvas
        document.getElementById('flowCanvas')?.classList.add('connect-mode');
        // Highlight all valid input ports on OTHER nodes
        this.nodes.forEach(n => {
            if (n.id === fromNodeId) return;
            const nt = NODE_TYPES[n.type];
            if (nt.inputs > 0) {
                const el = document.getElementById(n.id);
                el?.classList.add('connectable-target');
                el?.querySelector('.flow-port-in')?.classList.add('glow');
            }
        });
    }

    _exitConnectMode() {
        document.getElementById('flowCanvas')?.classList.remove('connect-mode');
        document.querySelectorAll('.connectable-target').forEach(el => el.classList.remove('connectable-target'));
        document.querySelectorAll('.flow-port.glow').forEach(el => el.classList.remove('glow'));
    }

    _renderConnections() {
        const svg = document.getElementById('flowSvg');
        const canvas = document.getElementById('flowCanvas');
        if (!svg || !canvas) return;

        // Make SVG cover the full unscaled canvas area
        const NODE_W = 170; // approximate node width
        const NODE_H = 70;  // approximate node height

        let paths = '';

        this.connections.forEach(conn => {
            const fromNode = this.nodes.find(n => n.id === conn.from);
            const toNode = this.nodes.find(n => n.id === conn.to);
            if (!fromNode || !toNode) return;

            const fromNt = NODE_TYPES[fromNode.type];

            // Calculate port positions from node data (not DOM rects)
            // Output port: bottom center of node, offset by portIndex for multi-output
            let x1, y1;
            if (fromNt.outputs === 2) {
                x1 = fromNode.x + (conn.portIndex === 0 ? NODE_W * 0.3 : NODE_W * 0.7);
            } else {
                x1 = fromNode.x + NODE_W / 2;
            }
            y1 = fromNode.y + NODE_H;

            // Input port: top center of node
            const x2 = toNode.x + NODE_W / 2;
            const y2 = toNode.y;

            const dy = Math.abs(y2 - y1);
            const cp = Math.max(50, dy * 0.4);

            const color = conn.portIndex === 1 ? '#EF4444' : '#10B981';

            paths += `<path d="M${x1},${y1} C${x1},${y1 + cp} ${x2},${y2 - cp} ${x2},${y2}"
                        stroke="${color}" stroke-width="2" fill="none" stroke-dasharray="${conn.portIndex === 1 ? '6,3' : 'none'}"
                        marker-end="url(#arrow-${conn.portIndex === 1 ? 'red' : 'green'})" />`;
        });

        svg.innerHTML = `
            <defs>
                <marker id="arrow-green" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#10B981"/>
                </marker>
                <marker id="arrow-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#EF4444"/>
                </marker>
            </defs>
            ${paths}
        `;
    }

    // ── Mouse Handlers ──

    _onMouseMove(e) {
        if (this.draggingNode) {
            const canvas = document.getElementById('flowCanvas');
            const rect = canvas.getBoundingClientRect();
            const el = document.getElementById(this.draggingNode);
            const node = this.nodes.find(n => n.id === this.draggingNode);
            if (!el || !node) return;

            node.x = Math.max(0, (e.clientX - rect.left) / this.scale + canvas.scrollLeft - this.dragOffset.x);
            node.y = Math.max(0, (e.clientY - rect.top) / this.scale + canvas.scrollTop - this.dragOffset.y);
            el.style.left = node.x + 'px';
            el.style.top = node.y + 'px';
            this._renderConnections();
        }

        // Draw temporary connection line following mouse
        if (this.connectingFrom) {
            this._drawTempLine(e);
        }

        // Rubber-band selection
        if (this._selecting) {
            const canvas = document.getElementById('flowCanvas');
            const rect = canvas.getBoundingClientRect();
            const mx = (e.clientX - rect.left) / this.scale + canvas.scrollLeft;
            const my = (e.clientY - rect.top) / this.scale + canvas.scrollTop;
            this._selRect = {
                x: Math.min(this._selStart.x, mx),
                y: Math.min(this._selStart.y, my),
                w: Math.abs(mx - this._selStart.x),
                h: Math.abs(my - this._selStart.y)
            };
            const selDiv = document.getElementById('flowSelRect');
            if (selDiv) {
                selDiv.style.left = this._selRect.x + 'px';
                selDiv.style.top = this._selRect.y + 'px';
                selDiv.style.width = this._selRect.w + 'px';
                selDiv.style.height = this._selRect.h + 'px';
            }
        }
    }

    _drawTempLine(e) {
        const canvas = document.getElementById('flowCanvas');
        const svg = document.getElementById('flowSvg');
        if (!canvas || !svg) return;

        const fromNode = this.nodes.find(n => n.id === this.connectingFrom.nodeId);
        if (!fromNode) return;

        const fromNt = NODE_TYPES[fromNode.type];
        const NODE_W = 170;
        const NODE_H = 70;

        // Source port position (unscaled)
        let x1;
        if (fromNt.outputs === 2) {
            x1 = fromNode.x + (this.connectingFrom.portIndex === 0 ? NODE_W * 0.3 : NODE_W * 0.7);
        } else {
            x1 = fromNode.x + NODE_W / 2;
        }
        const y1 = fromNode.y + NODE_H;

        // Mouse position → unscaled canvas coordinates
        const canvasRect = canvas.getBoundingClientRect();
        const x2 = (e.clientX - canvasRect.left) / this.scale + canvas.scrollLeft;
        const y2 = (e.clientY - canvasRect.top) / this.scale + canvas.scrollTop;

        const dy = Math.abs(y2 - y1);
        const cp = Math.max(50, dy * 0.4);
        const color = this.connectingFrom.color || '#10B981';

        // Re-render connections + temp line
        this._renderConnections();
        // Append temp line to SVG
        const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        tempPath.setAttribute('d', `M${x1},${y1} C${x1},${y1 + cp} ${x2},${y2 - cp} ${x2},${y2}`);
        tempPath.setAttribute('stroke', color);
        tempPath.setAttribute('stroke-width', '2.5');
        tempPath.setAttribute('fill', 'none');
        tempPath.setAttribute('stroke-dasharray', '8,4');
        tempPath.setAttribute('opacity', '0.8');
        tempPath.classList.add('flow-temp-line');
        svg.appendChild(tempPath);

        // Add a circle at the cursor end
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x2);
        circle.setAttribute('cy', y2);
        circle.setAttribute('r', '5');
        circle.setAttribute('fill', color);
        circle.setAttribute('opacity', '0.6');
        circle.classList.add('flow-temp-line');
        svg.appendChild(circle);
    }

    _onMouseUp(e) {
        if (this.draggingNode) {
            const el = document.getElementById(this.draggingNode);
            el?.classList.remove('dragging');
            this.draggingNode = null;
        }

        // Finish rubber-band selection
        if (this._selecting) {
            this._selecting = false;
            const selDiv = document.getElementById('flowSelRect');
            if (selDiv) selDiv.style.display = 'none';

            const r = this._selRect;
            if (r.w > 5 || r.h > 5) { // Only if actually dragged
                const NODE_W = 170, NODE_H = 70;
                this.nodes.forEach(n => {
                    const nx = n.x, ny = n.y;
                    const nRight = nx + NODE_W, nBottom = ny + NODE_H;
                    // Check overlap
                    if (nx < r.x + r.w && nRight > r.x && ny < r.y + r.h && nBottom > r.y) {
                        this.selectedNodes.add(n.id);
                        document.getElementById(n.id)?.classList.add('multi-selected');
                    }
                });
                if (this.selectedNodes.size > 0) {
                    appendLog?.(`🔲 Selected ${this.selectedNodes.size} block(s)`);
                }
            }
        }
    }

    _clearMultiSelect() {
        this.selectedNodes.clear();
        document.querySelectorAll('.flow-node.multi-selected').forEach(el => el.classList.remove('multi-selected'));
    }

    // ── Properties Panel ──

    _renderProps() {
        const body = document.getElementById('flowPropsBody');
        if (!body) return;

        if (!this.selectedNode) {
            body.innerHTML = '<p class="flow-props-empty">Select a block to configure</p>';
            return;
        }

        const node = this.nodes.find(n => n.id === this.selectedNode);
        if (!node) return;
        const nt = NODE_TYPES[node.type];

        let configHtml = '';
        if (nt.config.length === 0) {
            configHtml = '<p class="flow-props-empty">No configuration needed</p>';
        } else {
            configHtml = nt.config.map(cfg => {
                const val = node.config[cfg.key] ?? cfg.default;
                let input = '';

                if (cfg.type === 'number') {
                    input = `<input type="number" class="flow-prop-input" data-key="${cfg.key}" value="${val}" step="any">`;
                } else if (cfg.type === 'text') {
                    input = `<input type="text" class="flow-prop-input" data-key="${cfg.key}" value="${val}">`;
                } else if (cfg.type === 'textarea') {
                    input = `<textarea class="flow-prop-input flow-prop-textarea" data-key="${cfg.key}">${val}</textarea>`;
                } else if (cfg.type === 'select') {
                    input = `<select class="flow-prop-input" data-key="${cfg.key}">
                        ${cfg.options.map(opt => `<option value="${opt}" ${opt === val ? 'selected' : ''}>${opt}</option>`).join('')}
                    </select>`;
                }

                return `<div class="flow-prop-row">
                    <label class="flow-prop-label">${cfg.label}</label>
                    ${input}
                </div>`;
            }).join('');
        }

        body.innerHTML = `
            <div class="flow-props-node">
                <div class="flow-props-title" style="color:${nt.color}">
                    ${nt.icon} ${nt.label}
                </div>
                <div class="flow-props-id">${node.id}</div>
                ${configHtml}
                <button class="flow-prop-delete" id="flowDeleteNode">🗑 Delete Block</button>
            </div>
        `;

        // Bind input changes
        body.querySelectorAll('.flow-prop-input').forEach(input => {
            input.addEventListener('change', () => {
                const key = input.dataset.key;
                const cfg = nt.config.find(c => c.key === key);
                let val = input.value;
                if (cfg?.type === 'number') val = parseFloat(val) || 0;
                node.config[key] = val;
                this._updateNodeDisplay(node.id);
            });
            input.addEventListener('input', () => {
                const key = input.dataset.key;
                const cfg = nt.config.find(c => c.key === key);
                let val = input.value;
                if (cfg?.type === 'number') val = parseFloat(val) || 0;
                node.config[key] = val;
            });
        });

        // Delete button
        body.querySelector('#flowDeleteNode')?.addEventListener('click', () => this.deleteNode(node.id));
    }

    _updateInfo() {
        const info = document.getElementById('flowInfo');
        if (info) info.textContent = `${this.nodes.length} blocks · ${this.connections.length} connections`;
    }

    // ═══════════════════════════════════════════
    // Code Generation
    // ═══════════════════════════════════════════

    generateCode() {
        const startNode = this.nodes.find(n => n.type === 'start');
        if (!startNode) return '# No start block found\nlog("Please add a Start block")';

        let code = 'import random\nimport json\n\n# Generated by IOSControl Flow Builder\n';
        let indent = '';

        // Helper: normalize hex color (strip 0x/# prefix)
        const hexColor = (v) => {
            let s = String(v || 'FF0000').trim();
            if (s.startsWith('0x') || s.startsWith('0X')) s = s.slice(2);
            if (s.startsWith('#')) s = s.slice(1);
            return '0x' + s.toUpperCase();
        };

        const visited = new Set();
        const generate = (nodeId) => {
            if (!nodeId || visited.has(nodeId)) return;
            visited.add(nodeId);

            const node = this.nodes.find(n => n.id === nodeId);
            if (!node) return;
            const nt = NODE_TYPES[node.type];
            const c = node.config;

            switch (node.type) {
                case 'start':
                    code += `${indent}log("▶ Flow started")\n`;
                    break;
                case 'end':
                    code += `${indent}log("✅ Flow completed")\n`;
                    return;
                case 'tap':
                    code += `${indent}tap(${c.x}, ${c.y})\n`;
                    break;
                case 'swipe':
                    code += `${indent}swipe(${c.x1}, ${c.y1}, ${c.x2}, ${c.y2}, ${c.duration})\n`;
                    break;
                case 'long_press':
                    code += `${indent}long_press(${c.x}, ${c.y}, ${c.duration})\n`;
                    break;
                case 'type_text':
                    code += `${indent}input_text("${c.text}")\n`;
                    break;
                case 'wait':
                    code += `${indent}sleep(${c.seconds})\n`;
                    break;
                case 'random_wait':
                    code += `${indent}sleep(random.uniform(${c.min_s}, ${c.max_s}))\n`;
                    break;
                case 'open_app':
                    code += `${indent}app_run("${c.bundle_id}")\n`;
                    break;
                case 'close_app':
                    code += `${indent}app_kill("${c.bundle_id}")\n`;
                    break;
                case 'open_url':
                    code += `${indent}open_url("${c.url}")\n`;
                    break;
                case 'screenshot':
                    code += `${indent}screenshot("${c.filename}")\n`;
                    break;
                case 'find_image': {
                    code += `${indent}# Find image: ${c.path}\n`;
                    code += `${indent}_img_result = find_image("${c.path}", 1, ${c.threshold})\n`;
                    code += `${indent}if _img_result:\n`;
                    const oldIndent = indent;
                    indent += '    ';
                    code += `${indent}log(f"Found at {_img_result[0]}")\n`;
                    // Generate "Yes" branch
                    const yesConn = this.connections.find(cn => cn.from === node.id && cn.portIndex === 0);
                    if (yesConn) generate(yesConn.to);
                    indent = oldIndent;
                    code += `${indent}else:\n`;
                    indent += '    ';
                    code += `${indent}log("Image not found")\n`;
                    // Generate "No" branch
                    const noConn = this.connections.find(cn => cn.from === node.id && cn.portIndex === 1);
                    if (noConn) generate(noConn.to);
                    indent = oldIndent;
                    return; // Already handled sub-branches
                }
                case 'if_color': {
                    code += `${indent}# Check color at (${c.x}, ${c.y})\n`;
                    code += `${indent}_color = get_color(${c.x}, ${c.y})\n`;
                    code += `${indent}if _color == ${hexColor(c.color)}:\n`;
                    const oldIndent2 = indent;
                    indent += '    ';
                    code += `${indent}log("Color matched!")\n`;
                    const yesConn2 = this.connections.find(cn => cn.from === node.id && cn.portIndex === 0);
                    if (yesConn2) generate(yesConn2.to);
                    indent = oldIndent2;
                    code += `${indent}else:\n`;
                    indent += '    ';
                    code += `${indent}log("Color not matched")\n`;
                    const noConn2 = this.connections.find(cn => cn.from === node.id && cn.portIndex === 1);
                    if (noConn2) generate(noConn2.to);
                    indent = oldIndent2;
                    return;
                }
                case 'if_else': {
                    let condCode = 'True';
                    const ct = c.condition_type;
                    if (ct === 'color_match') {
                        condCode = `get_color(${c.x}, ${c.y}) == ${hexColor(c.color)}`;
                    } else if (ct === 'color_not_match') {
                        condCode = `get_color(${c.x}, ${c.y}) != ${hexColor(c.color)}`;
                    } else if (ct === 'app_foreground') {
                        condCode = `front_most_app() == "${c.bundle_id}"`;
                    } else if (ct === 'custom') {
                        condCode = c.custom_expr || 'True';
                    }
                    code += `${indent}if ${condCode}:\n`;
                    const oldIndentIf = indent;
                    indent += '    ';
                    const yesBranch = this.connections.find(cn => cn.from === node.id && cn.portIndex === 0);
                    if (yesBranch) generate(yesBranch.to);
                    else code += `${indent}pass\n`;
                    indent = oldIndentIf;
                    code += `${indent}else:\n`;
                    indent += '    ';
                    const noBranch = this.connections.find(cn => cn.from === node.id && cn.portIndex === 1);
                    if (noBranch) generate(noBranch.to);
                    else code += `${indent}pass\n`;
                    indent = oldIndentIf;
                    return;
                }
                case 'loop': {
                    code += `${indent}for _i in range(${c.count}):\n`;
                    const oldIndent3 = indent;
                    indent += '    ';
                    code += `${indent}log(f"Loop {_i + 1}/${c.count}")\n`;
                    const nextConn = this.connections.find(cn => cn.from === node.id && cn.portIndex === 0);
                    if (nextConn) {
                        this._generateUntilLoopEnd(nextConn.to, visited, (line) => { code += indent + line + '\n'; });
                    }
                    indent = oldIndent3;
                    const loopEnd = this._findLoopEnd(node.id, 'loop_end');
                    if (loopEnd) {
                        visited.add(loopEnd);
                        const afterLoop = this.connections.find(cn => cn.from === loopEnd && cn.portIndex === 0);
                        if (afterLoop) generate(afterLoop.to);
                    }
                    return;
                }
                case 'loop_end':
                    return;
                case 'while_loop': {
                    let whileCond = 'True';
                    const wt = c.condition_type;
                    if (wt === 'forever') {
                        whileCond = 'True';
                    } else if (wt === 'count') {
                        code += `${indent}_while_count = 0\n`;
                        whileCond = `_while_count < ${c.count}`;
                    } else if (wt === 'color_match') {
                        whileCond = `get_color(${c.x}, ${c.y}) == ${hexColor(c.color)}`;
                    } else if (wt === 'color_not_match') {
                        whileCond = `get_color(${c.x}, ${c.y}) != ${hexColor(c.color)}`;
                    } else if (wt === 'app_foreground') {
                        whileCond = `front_most_app() == "${c.bundle_id}"`;
                    }
                    code += `${indent}while ${whileCond}:\n`;
                    const oldIndentW = indent;
                    indent += '    ';
                    if (wt === 'count') {
                        code += `${indent}_while_count += 1\n`;
                        code += `${indent}log(f"While loop {_while_count}/${c.count}")\n`;
                    }
                    const nextConnW = this.connections.find(cn => cn.from === node.id && cn.portIndex === 0);
                    if (nextConnW) {
                        this._generateUntilLoopEnd(nextConnW.to, visited, (line) => { code += indent + line + '\n'; });
                    }
                    if (c.delay > 0) {
                        code += `${indent}sleep(${c.delay})\n`;
                    }
                    indent = oldIndentW;
                    const whileEnd = this._findLoopEnd(node.id, 'while_end');
                    if (whileEnd) {
                        visited.add(whileEnd);
                        const afterWhile = this.connections.find(cn => cn.from === whileEnd && cn.portIndex === 0);
                        if (afterWhile) generate(afterWhile.to);
                    }
                    return;
                }
                case 'while_end':
                    return;
                case 'http_get':
                    code += `${indent}_res = get("${c.url}")\n`;
                    code += `${indent}log(f"HTTP {_res['status_code']}")\n`;
                    break;
                case 'http_post':
                    code += `${indent}_res = post("${c.url}", json=${c.body})\n`;
                    code += `${indent}log(f"HTTP {_res['status_code']}")\n`;
                    break;
                case 'log':
                    code += `${indent}log("${c.message}")\n`;
                    break;
                case 'ocr':
                    code += `${indent}_text = ocr([${c.x}, ${c.y}, ${c.w}, ${c.h}])\n`;
                    code += `${indent}log(f"OCR: {_text}")\n`;
                    break;
                case 'key_press':
                    code += `${indent}key_press("${c.key}")\n`;
                    break;
                case 'toast':
                    code += `${indent}toast("${c.message}", ${c.delay})\n`;
                    break;
            }

            // Follow connection to next node
            const nextConn = this.connections.find(cn => cn.from === node.id && cn.portIndex === 0);
            if (nextConn) generate(nextConn.to);
        };

        generate(startNode.id);
        return code;
    }

    _generateUntilLoopEnd(nodeId, visited, emit) {
        if (!nodeId || visited.has(nodeId)) return;
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node || node.type === 'loop_end' || node.type === 'while_end') return;
        visited.add(nodeId);

        const c = node.config;
        switch (node.type) {
            case 'tap':   emit(`tap(${c.x}, ${c.y})`); break;
            case 'swipe': emit(`swipe(${c.x1}, ${c.y1}, ${c.x2}, ${c.y2}, ${c.duration})`); break;
            case 'wait':  emit(`sleep(${c.seconds})`); break;
            case 'log':   emit(`log("${c.message}")`); break;
            case 'type_text': emit(`input_text("${c.text}")`); break;
            case 'random_wait': emit(`sleep(random.uniform(${c.min_s}, ${c.max_s}))`); break;
            case 'screenshot': emit(`screenshot("${c.filename}")`); break;
            case 'key_press': emit(`key_press("${c.key}")`); break;
            case 'open_app': emit(`app_run("${c.bundle_id}")`); break;
            case 'close_app': emit(`app_kill("${c.bundle_id}")`); break;
            case 'long_press': emit(`long_press(${c.x}, ${c.y}, ${c.duration})`); break;
            case 'http_get': emit(`_res = get("${c.url}")`); emit(`log(f"HTTP {_res['status_code']}")`); break;
            case 'open_url': emit(`open_url("${c.url}")`); break;
            case 'toast': emit(`toast("${c.message}", ${c.delay})`); break;
            default: emit(`# ${node.type}`); break;
        }

        const nextConn = this.connections.find(cn => cn.from === nodeId && cn.portIndex === 0);
        if (nextConn) this._generateUntilLoopEnd(nextConn.to, visited, emit);
    }

    _findLoopEnd(loopNodeId, endType = 'loop_end') {
        // BFS from loop node to find the matching end block
        const visited = new Set();
        const queue = [loopNodeId];
        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current)) continue;
            visited.add(current);
            const node = this.nodes.find(n => n.id === current);
            if (node && node.type === endType && current !== loopNodeId) return current;
            const conns = this.connections.filter(c => c.from === current);
            conns.forEach(c => queue.push(c.to));
        }
        return null;
    }

    // ── Run / View Code ──

    viewCode() {
        const code = this.generateCode();
        // Switch to Script Editor tab and set code
        if (typeof setEditorValue === 'function') {
            setEditorValue(code);
        }
        // Switch to editor tab
        document.querySelector('.tab[data-tab="editor"]')?.click();
        if (typeof appendLog === 'function') {
            appendLog('🔄 Flow → Code generated');
        }
    }

    runFlow() {
        const code = this.generateCode();
        if (typeof setEditorValue === 'function') {
            setEditorValue(code);
        }
        document.querySelector('.tab[data-tab="editor"]')?.click();
        setTimeout(() => {
            if (typeof runScript === 'function') runScript();
        }, 300);
    }

    // ── Save / Load Flow ──

    toJSON() {
        return JSON.stringify({ nodes: this.nodes, connections: this.connections, nextId: this.nextId });
    }

    fromJSON(json) {
        try {
            const data = JSON.parse(json);
            this.nodes = data.nodes || [];
            this.connections = data.connections || [];
            this.nextId = data.nextId || 1;
            document.getElementById('flowNodes').innerHTML = '';
            this.nodes.forEach(n => this._renderNode(n));
            this._renderConnections();
            this._updateInfo();
        } catch (e) {
            console.error('Failed to load flow:', e);
        }
    }
}

// ═══════════════════════════════════════════
// Global init
// ═══════════════════════════════════════════

let flowBuilder = null;

function initFlowBuilder() {
    const container = document.getElementById('flowTab');
    if (container && !flowBuilder) {
        flowBuilder = new FlowBuilder(container);
    }
}
