# Modular Code Structure Guide

## 🎯 Overview

This document explains how to split the monolithic `Interface Tunergia.html` into modular files for better maintainability and automatic deployment via GitHub + jsDelivr CDN.

## 📦 How It Works

### The Problem
Currently, you have to paste 4,000+ lines of HTML/CSS/JS into Odoo every time you make a change.

### The Solution
1. **One-time setup**: Paste the small `LOADER.html` file into Odoo (only ~50 lines)
2. **All future updates**: Edit code in GitHub → Push → Auto-updates via CDN
3. **No more manual pasting**: jsDelivr CDN serves files directly from your GitHub branch

### The Magic: jsDelivr CDN
```
https://cdn.jsdelivr.net/gh/{user}/{repo}@{branch}/{file}
                              ↓        ↓        ↓        ↓
                           pedrokrug/comparador_ui/claude/enhance-interface-usability/src/config.js
```

- **Fast**: Global CDN with caching
- **Free**: No cost for open-source repos
- **Automatic**: Pulls latest code from GitHub
- **Versioned**: Can pin to specific commits or branches

## 📁 File Structure

```
comparador_ui/
├── LOADER.html                    # ← PASTE THIS ONCE INTO ODOO
├── Interface Tunergia.html        # Original monolithic file (keep for reference)
├── MODULAR_STRUCTURE.md          # This file
├── DOCUMENTATION.md              # Project documentation
└── src/
    ├── styles.css                # All CSS (extracted from <style> tag)
    ├── config.js                 # Configuration constants
    ├── state.js                  # State management
    ├── utils.js                  # Utility functions
    ├── api.js                    # API calls
    ├── ui.js                     # UI rendering
    ├── main.js                   # Initialization
    └── html-template.html        # HTML structure (optional)
```

## 🔧 Module Responsibilities

### 1. `src/styles.css` (Lines 1-1517 of original)
**What**: All CSS styling
**Extract**: Everything between `<style>` and `</style>`
```css
.tunergia-dashboard {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', ...;
    /* ... all styles ... */
}
```

### 2. `src/config.js` (Lines ~2300-2307 of original)
**What**: Configuration constants
**Extract**: The CONFIG object
```javascript
window.TunergiaConfig = {
    webhookUrl: 'https://tunuevaenergia.com/webhook/59200adf-d6df-4dd2-b319-5ab57d2e5052',
    nodoWebhookUrl: 'https://tunuevaenergia.com/webhook/nodo',
    documentWebhookUrl: 'https://tunuevaenergia.com/webhook/documento-nodo',
    sipsWebhookUrl: 'https://tunuevaenergia.com/webhook/SIPS-contrato-nodo',
    crearContratoUrl: 'https://tunuevaenergia.com/webhook/crear-contrato-nodo',
    bigQueryTable: '`tunergia-1722509306765.NODO.Contratos_Comisiones`',
    productosTable: '`tunergia-1722509306765.Precios_Tunergia.Tarifas Fijas Portfolio`',
    itemsPerPage: 10
};
```

### 3. `src/state.js` (Lines ~2309-2327 of original)
**What**: Application state
**Extract**: The state object and state management functions
```javascript
window.TunergiaState = {
    currentUser: null,
    idComercial: null,
    contracts: [],
    filteredContracts: [],
    currentPage: 1,
    currentFilter: 'all',
    searchTerm: '',
    sortColumn: 'fecha',
    sortDirection: 'desc',
    dateFilter: 30,
    listDateFrom: null,
    listDateTo: null,
    contractsLimit: 500,
    totalContracts: 0,
    currentContractId: null,
    selectAllMode: false
};

// State management functions
window.setState = function(updates) {
    Object.assign(window.TunergiaState, updates);
};

window.getState = function(key) {
    return key ? window.TunergiaState[key] : window.TunergiaState;
};
```

### 4. `src/utils.js`
**What**: Utility functions (no API calls)
**Extract**: Helper functions like:
- `formatNumber(num)`
- `formatDate(dateStr)`
- `formatCurrency(amount)`
- `matchComercializadora(name1, name2)` - Smart string matching
- `extractTarifaAcceso(concepto)` - Parse tarifa from string
- `parseNumeric(value)` - Safe number parsing
- `generateUUID()` - Generate unique IDs

```javascript
window.TunergiaUtils = {
    formatNumber(num) {
        if (!num && num !== 0) return '0';
        return new Intl.NumberFormat('es-ES').format(num);
    },

    formatDate(dateStr) {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('es-ES');
    },

    match Comercializadora(name1, name2) {
        if (!name1 || !name2) return false;
        const normalize = (str) => {
            return str
                .toUpperCase()
                .replace(/_GAIAG$/i, '')
                .replace(/_/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        };
        const norm1 = normalize(name1);
        const norm2 = normalize(name2);
        return norm1 === norm2 || norm1.includes(norm2) || norm2.includes(norm1);
    },

    extractTarifaAcceso(concepto) {
        if (!concepto) return '';
        const tarifas = ['2.0TD', '3.0TD', '6.1TD', 'RL.1', 'RL.2', 'RL.3'];
        for (let tarifa of tarifas) {
            if (concepto.includes(tarifa)) {
                return tarifa;
            }
        }
        return '';
    },

    parseNumeric(value) {
        if (value === null || value === undefined || value === '') return 0;
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0 : parsed;
    }
};
```

### 5. `src/api.js`
**What**: All API calls
**Extract**: Functions that make fetch() requests
- `executeQuery(query)` - BigQuery via webhook
- `loadUserInfo()` - Odoo session
- `loadContracts()` - BigQuery contracts list
- `getContractDetail(id)` - NODO contract details
- `createContract(data)` - NODO create contract
- `extractSipsData(cups)` - SIPS data extraction
- `uploadDocument(contractId, docData)` - NODO document upload
- `loadComercializadoras()` - BigQuery companies list
- `loadProducts(filters)` - BigQuery products with vigency filtering

```javascript
window.TunergiaAPI = {
    async executeQuery(query) {
        const response = await fetch(window.TunergiaConfig.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        if (!response.ok) {
            throw new Error(`Query failed: ${response.status}`);
        }

        const result = await response.json();
        return result.data || [];
    },

    async loadUserInfo() {
        // Fetch from Odoo session
        const sessionResponse = await fetch('/web/session/get_session_info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {} })
        });

        const sessionData = await sessionResponse.json();
        // ... rest of implementation
    },

    async loadContracts() {
        const query = `
            SELECT id, tipo, estado, fecha, cups, cliente, poblacion, provincia,
                   consumo, fecha_activacion, fecha_cancelacion, tarifa, tarifa_acceso
            FROM ${window.TunergiaConfig.bigQueryTable}
            WHERE (borrado = 0 OR borrado IS NULL)
                AND id_comercial = '${window.getState('idComercial')}'
            ORDER BY fecha DESC
            LIMIT ${window.getState('contractsLimit')}
        `;

        const data = await this.executeQuery(query);
        window.setState({ contracts: data, filteredContracts: [...data] });
        return data;
    },

    async getContractDetail(contractId) {
        const response = await fetch(window.TunergiaConfig.nodoWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: contractId })
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.status}`);
        }

        return await response.json();
    },

    async createContract(contractData) {
        const response = await fetch(window.TunergiaConfig.crearContratoUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(contractData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Error creating contract');
        }

        return await response.json();
    },

    async extractSipsData(cups) {
        const response = await fetch(window.TunergiaConfig.sipsWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cups })
        });

        if (!response.ok) {
            throw new Error('SIPS extraction failed');
        }

        return await response.json();
    },

    async loadProducts(tipoCliente, comercializadora, tarifa) {
        // Product filtering with vigency dates
        const today = new Date().toISOString().split('T')[0];

        // Map tipo_cliente
        const typeMapping = {
            'PARTICULAR': 'Residencial',
            'AUTONOMO': ['Empresa', 'CCPP'],
            'EMPRESA': ['Empresa', 'CCPP'],
            'CCPP': 'CCPP'
        };

        const mappedTypes = typeMapping[tipoCliente];
        let typeFilter = '';

        if (Array.isArray(mappedTypes)) {
            typeFilter = mappedTypes.map(t => `TIPO_DE_CLIENTE = '${t}'`).join(' OR ');
        } else {
            typeFilter = `TIPO_DE_CLIENTE = '${mappedTypes}'`;
        }

        const query = `
            SELECT DISTINCT PRODUCTO, TARIFA, TIPO_DE_CLIENTE, INICIO_VIGENCIA, FIN_VIGENCIA
            FROM ${window.TunergiaConfig.productosTable}
            WHERE COMPA____A = '${comercializadora}'
                AND TARIFA = '${tarifa}'
                AND (${typeFilter})
                AND (INICIO_VIGENCIA IS NULL OR INICIO_VIGENCIA <= '${today}')
                AND (FIN_VIGENCIA IS NULL OR FIN_VIGENCIA >= '${today}')
            ORDER BY PRODUCTO
        `;

        return await this.executeQuery(query);
    }
};
```

### 6. `src/ui.js`
**What**: UI rendering and DOM manipulation
**Extract**: All functions that modify the DOM
- `showLoading(show)` - Toggle loading overlay
- `showError(message)` - Display error
- `renderContractsTable()` - Render contracts table
- `renderContractDetail(data)` - Populate detail modal
- `openContractDetail(id)` - Open detail modal
- `closeContractDetail()` - Close detail modal
- `openCreateContractModal()` - Open create modal
- `closeCreateContractModal()` - Close create modal
- `updateStats()` - Update dashboard stats
- `renderFilters()` - Render filter UI
- `setupEventListeners()` - Attach all event listeners

```javascript
window.TunergiaUI = {
    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.toggle('active', show);
        }
    },

    showError(message) {
        const banner = document.getElementById('errorBanner');
        if (banner) {
            document.getElementById('errorBannerText').textContent = message;
            banner.classList.add('active');
            setTimeout(() => banner.classList.remove('active'), 5000);
        } else {
            alert('Error: ' + message);
        }
    },

    renderContractsTable() {
        const tbody = document.getElementById('contractsTableBody');
        const contracts = window.getState('filteredContracts');

        if (!contracts || contracts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No hay contratos</td></tr>';
            return;
        }

        tbody.innerHTML = contracts.map(contract => `
            <tr>
                <td>${contract.id}</td>
                <td>${contract.cliente || '-'}</td>
                <td><span class="status-badge ${contract.estado || 'default'}">${contract.estado || '-'}</span></td>
                <td>${contract.tipo || '-'}</td>
                <td>${window.TunergiaUtils.formatDate(contract.fecha)}</td>
                <td class="cups-code">${contract.cups || '-'}</td>
                <td>${window.TunergiaUtils.formatNumber(contract.consumo)}</td>
                <td><span class="tarifa-badge">${contract.tarifa_acceso || '-'}</span></td>
                <td><button class="view-btn" onclick="window.TunergiaUI.openContractDetail(${contract.id})">👁️</button></td>
            </tr>
        `).join('');
    },

    async openContractDetail(contractId) {
        const modal = document.getElementById('contractDetailModal');
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        window.setState({ currentContractId: contractId });

        this.showLoading(true);

        try {
            const data = await window.TunergiaAPI.getContractDetail(contractId);
            this.renderContractDetail(data);
        } catch (error) {
            this.showError('Error al cargar contrato: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    },

    closeContractDetail() {
        const modal = document.getElementById('contractDetailModal');
        modal.classList.remove('active');
        document.body.style.overflow = '';
    },

    setupEventListeners() {
        // Search input
        document.getElementById('searchInput')?.addEventListener('input', (e) => {
            window.setState({ searchTerm: e.target.value });
            this.applyFilters();
        });

        // Filter tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                window.setState({ currentFilter: filter });
                this.applyFilters();
            });
        });

        // Create contract button
        document.getElementById('createContractBtn')?.addEventListener('click', () => {
            this.openCreateContractModal();
        });

        // ... more event listeners
    },

    applyFilters() {
        let filtered = window.getState('contracts');
        const searchTerm = window.getState('searchTerm').toLowerCase();
        const currentFilter = window.getState('currentFilter');

        if (searchTerm) {
            filtered = filtered.filter(c =>
                (c.cliente || '').toLowerCase().includes(searchTerm) ||
                (c.cups || '').toLowerCase().includes(searchTerm) ||
                (c.id || '').toString().includes(searchTerm)
            );
        }

        if (currentFilter !== 'all') {
            filtered = filtered.filter(c => c.estado === currentFilter);
        }

        window.setState({ filteredContracts: filtered });
        this.renderContractsTable();
    }
};
```

### 7. `src/main.js`
**What**: Application initialization
**Extract**: Main init() function and entry point

```javascript
(async function() {
    'use strict';

    console.log('🚀 Tunergia Interface Loading...');

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        await new Promise(resolve => {
            document.addEventListener('DOMContentLoaded', resolve);
        });
    }

    // Initialize application
    async function init() {
        window.TunergiaUI.showLoading(true);

        try {
            // Load user info from Odoo session
            await window.TunergiaAPI.loadUserInfo();

            const idComercial = window.getState('idComercial');

            if (!idComercial) {
                window.TunergiaUI.showError('No se pudo obtener el ID del comercial.');
                return;
            }

            console.log('✅ User loaded:', window.getState('currentUser'));

            // Load initial data
            await window.TunergiaAPI.loadContracts();

            console.log(`✅ Loaded ${window.getState('contracts').length} contracts`);

            // Render UI
            window.TunergiaUI.renderContractsTable();
            window.TunergiaUI.updateStats();

            // Setup event listeners
            window.TunergiaUI.setupEventListeners();

            console.log('✅ Tunergia Interface Ready!');

        } catch (error) {
            console.error('❌ Initialization error:', error);
            window.TunergiaUI.showError('Error al inicializar: ' + error.message);
        } finally {
            window.TunergiaUI.showLoading(false);
        }
    }

    // Start the app
    init();
})();
```

## 🚀 Deployment Workflow

### Initial Setup (ONE TIME):
1. Create `/src/` directory in your repo
2. Split `Interface Tunergia.html` into the 7 files above
3. Commit and push to branch `claude/enhance-interface-usability`
4. Paste `LOADER.html` content into Odoo HTML field
5. Refresh Odoo page - app loads from CDN!

### Future Updates (EVERY TIME):
1. Edit files in `/src/` directory
2. Commit and push to GitHub
3. Wait ~5 minutes for jsDelivr to refresh cache
4. (Optional) Increment `?v=X.X.X` in LOADER.html to force immediate update
5. Refresh Odoo page - updates load automatically!

## 🎨 Version Control

### Option 1: Auto-update (Recommended for development)
```html
<script src="https://cdn.jsdelivr.net/gh/user/repo@branch/src/config.js"></script>
```
- Always pulls latest code from branch
- Cache refreshes every ~5 minutes
- Good for active development

### Option 2: Version pinning (Recommended for production)
```html
<script src="https://cdn.jsdelivr.net/gh/user/repo@v1.2.3/src/config.js"></script>
```
- Locks to specific git tag
- Never changes unless you update the tag reference
- Good for stable production

### Option 3: Commit pinning
```html
<script src="https://cdn.jsdelivr.net/gh/user/repo@abc123def/src/config.js"></script>
```
- Locks to specific commit hash
- Immutable - never changes
- Good for debugging

## 📝 Best Practices

1. **Always increment ?v=** when deploying critical fixes
2. **Test in dev branch** before merging to main
3. **Use browser DevTools** to verify CDN files are loading
4. **Check jsDelivr status** if files don't update: https://www.jsdelivr.com/
5. **Keep LOADER.html minimal** - all logic goes in /src/ files
6. **Add console.log()** messages in each module to verify loading order

## 🐛 Troubleshooting

### Files not updating?
- Check jsDelivr cache: `https://purge.jsdelivr.net/gh/user/repo@branch/file.js`
- Increment `?v=` version number
- Check browser DevTools Network tab
- Verify files exist in GitHub at correct path

### Errors in console?
- Check loading order (config → state → utils → api → ui → main)
- Verify all window.XXX globals are defined before use
- Check for circular dependencies

### CORS errors?
- jsDelivr handles CORS automatically
- If using your own server, add proper CORS headers

## ✨ Benefits of This Approach

1. **No more manual pasting** into Odoo
2. **Better code organization** - find things easily
3. **Version control** - track changes over time
4. **Team collaboration** - multiple people can edit
5. **Instant rollback** - just change version/branch
6. **Debugging** - browser DevTools shows individual files
7. **Code reuse** - share modules across projects
8. **Professional workflow** - industry standard approach

---

**Ready to split the file?** Follow the extraction guide above, or ask for help with specific sections!
