# Modular Architecture - Quick Start Guide

## ✅ What Was Created

I've split your 4,000-line monolithic file into 7 clean, modular files in the `/src/` directory:

```
src/
├── styles.css      # 30KB - All CSS styling
├── config.js       # Configuration (webhooks, tables)
├── state.js        # Application state management
├── utils.js        # Utility functions (3.6KB)
├── api.js          # All API calls (8.4KB)
├── ui.js           # UI rendering functions (9.4KB)
└── main.js         # Application entry point (2.8KB)
```

## 🚀 How to Use

### Option 1: Test Locally (Quick Test)

1. **Create a test HTML file:**

```html
<!DOCTYPE html>
<html>
<head>
    <title>Tunergia Test</title>
    <!-- Load CSS -->
    <link rel="stylesheet" href="src/styles.css">
</head>
<body>
    <!-- Your HTML structure here -->
    <div id="tunergiaApp" class="tunergia-dashboard">
        <!-- Add minimal HTML structure for testing -->
        <div id="loadingOverlay" class="loading-overlay">
            <div class="loading-spinner"></div>
            <div class="loading-text">Cargando...</div>
        </div>

        <div class="user-banner">
            <div class="user-info">
                <div class="user-avatar" id="userAvatar">TU</div>
                <div class="user-details">
                    <h3 id="userName">Usuario</h3>
                    <p id="userEmail">email@example.com</p>
                </div>
            </div>
            <div class="user-id-badge" id="userIdBadge">ID: N/A</div>
        </div>

        <div class="contracts-section">
            <div class="contracts-header">
                <h2 id="totalContracts">0 Contratos</h2>
            </div>
            <table class="contracts-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Cliente</th>
                        <th>Estado</th>
                        <th>Tipo</th>
                        <th>Fecha</th>
                        <th>CUPS</th>
                        <th>Consumo</th>
                        <th>Tarifa</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody id="contractsTableBody">
                    <!-- Will be populated by JavaScript -->
                </tbody>
            </table>
        </div>
    </div>

    <!-- Load JavaScript modules IN ORDER -->
    <script src="src/config.js"></script>
    <script src="src/state.js"></script>
    <script src="src/utils.js"></script>
    <script src="src/api.js"></script>
    <script src="src/ui.js"></script>
    <script src="src/main.js"></script>
</body>
</html>
```

2. **Open in browser:**
   - Open Chrome/Firefox DevTools (F12)
   - Check Console for loading messages
   - Should see: ✅ Config loaded, ✅ State loaded, etc.

### Option 2: Use with LOADER.html + CDN (Production)

1. **Paste LOADER.html into Odoo:**
   - Copy content from `LOADER.html`
   - Paste into your Odoo HTML field
   - That's it! Code auto-loads from GitHub

2. **Files load from jsDelivr CDN:**
```
https://cdn.jsdelivr.net/gh/pedrokrug/comparador_ui@claude/enhance-interface-usability/src/config.js
https://cdn.jsdelivr.net/gh/pedrokrug/comparador_ui@claude/enhance-interface-usability/src/state.js
... etc
```

### Option 3: Deploy to Your Own Server

1. **Copy `/src/` folder to your server:**
```bash
scp -r src/ user@yourserver.com:/var/www/tunergia/
```

2. **Update LOADER.html to point to your server:**
```html
<script src="https://tunuevaenergia.com/static/src/config.js"></script>
<script src="https://tunuevaenergia.com/static/src/state.js"></script>
<!-- ... etc -->
```

## 🔧 How It Works

### Loading Order (IMPORTANT!)
Files must load in this specific order:

1. **config.js** - Sets up `window.TunergiaConfig`
2. **state.js** - Sets up `window.TunergiaState` + setState/getState
3. **utils.js** - Sets up `window.TunergiaUtils`
4. **api.js** - Sets up `window.TunergiaAPI` (uses Config, State, Utils)
5. **ui.js** - Sets up `window.TunergiaUI` (uses API, Utils)
6. **main.js** - Initializes app (uses everything)

### Module Communication

```javascript
// Config is read-only
const url = window.TunergiaConfig.webhookUrl;

// State is managed via setState/getState
window.setState({ contracts: [...] });
const contracts = window.getState('contracts');

// Utils are helper functions
const formatted = window.TunergiaUtils.formatDate('2025-12-17');
const matched = window.TunergiaUtils.matchComercializadora('ENDESA', 'ENDESA_GAIAG');

// API calls return promises
const contracts = await window.TunergiaAPI.loadContracts();
const detail = await window.TunergiaAPI.getContractDetail(123);

// UI functions manipulate the DOM
window.TunergiaUI.showLoading(true);
window.TunergiaUI.renderContractsTable();
window.TunergiaUI.openContractDetail(123);
```

## 🐛 Troubleshooting

### Console shows "Missing dependencies" error
**Problem:** Modules not loaded in correct order
**Solution:** Check script tags are in order: config → state → utils → api → ui → main

### Console shows "CONFIG is not defined"
**Problem:** Old code trying to use `CONFIG` instead of `window.TunergiaConfig`
**Solution:** Replace `CONFIG.` with `window.TunergiaConfig.` in your code

### Console shows "state is not defined"
**Problem:** Old code trying to use `state` directly
**Solution:** Use `window.getState('key')` or `window.setState({...})`

### Functions not found
**Problem:** Function moved to a module
**Solution:**
- Format functions → `window.TunergiaUtils.formatDate()`
- API calls → `window.TunergiaAPI.loadContracts()`
- UI functions → `window.TunergiaUI.renderTable()`

### CDN files not updating
**Problem:** jsDelivr cache (7 days)
**Solution:** Increment `?v=1.0.1` in LOADER.html or wait ~5 minutes

## 📝 Making Changes

### To add a new API endpoint:

**Edit `src/api.js`:**
```javascript
window.TunergiaAPI = {
    // ... existing functions ...

    async myNewEndpoint(params) {
        const response = await fetch(window.TunergiaConfig.someUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        return await response.json();
    }
};
```

**Commit and push:**
```bash
git add src/api.js
git commit -m "Add new API endpoint"
git push
```

**If using CDN:** Wait 5 minutes or increment `?v=` version

### To add a new utility function:

**Edit `src/utils.js`:**
```javascript
window.TunergiaUtils = {
    // ... existing functions ...

    myNewUtil(input) {
        return input.toUpperCase();
    }
};
```

## ✨ Benefits You Get

1. **No more 4,000-line file** - Easy to find things
2. **Clear organization** - Know where everything is
3. **Team collaboration** - Multiple people can edit different modules
4. **Auto-deployment** - Push to GitHub, automatic update via CDN
5. **Version control** - Track changes to specific modules
6. **Debugging** - Browser DevTools shows individual files
7. **Reusability** - Share modules across projects

## 🎯 Next Steps

1. **Test the modules** - Use Option 1 above to test locally
2. **Deploy to Odoo** - Use LOADER.html with CDN
3. **Customize** - Edit individual modules as needed
4. **Expand** - Add more functions to existing modules
5. **Document** - Add comments to your custom code

---

**Questions?** Check the console for loading messages. Each module logs when it loads successfully (✅ Config loaded, etc.)
