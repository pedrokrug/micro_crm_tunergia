# Tunergia CRM - Version 3.0.0 Changelog

## 🎉 Major Update: Unified Interface with Comparador Integration

**Release Date:** 2025-12-22
**Version:** 3.0.0

---

## 🚀 New Features

### 1. **Unified Tab Navigation**
- **Two Main Tabs:**
  - 📊 **Contratos**: Existing contract management system
  - ⚡ **Comparador y Análisis**: New comparison and power analysis tool
- Seamless switching between modules
- Shared user authentication across both views
- Persistent tab selection (remembers last active tab)

### 2. **Comparador y Análisis Module**
- **Three Operating Modes:**
  1. **Comparación de Facturas**: Standard bill comparison with multiple energy company offers
  2. **Solo Análisis de Potencia**: Power analysis only mode
  3. **Análisis Completo**: Full comparison + automatic power analysis

- **Features:**
  - Upload PDF bills for analysis
  - Compare with available energy company offers
  - Filter by company, product type (24h, etc.)
  - Power optimization analysis
  - "Turbo Tun" mode for custom calculations
  - Comparison history sidebar with filtering
  - Download PDF reports

### 3. **Crear Contrato desde Comparación**
**⭐ NEW WORKFLOW INTEGRATION**

- After generating a comparison, users can click **"✨ Crear Contrato desde esta Comparación"**
- Automatically switches to Contratos view
- Opens contract creation form pre-filled with:
  - CUPS
  - Tarifa de Acceso
  - Power values (P1-P6)
  - Consumption values (P1-P6)
  - Best offer recommendation
  - Estimated savings data
  - Comparison ID for tracking

- **Contract Tagging:**
  - Contracts created from comparisons are marked with `created_from_comparison: true`
  - Includes `comparison_id` for linking
  - Automatically adds comparison metadata to "Observaciones" field

### 4. **Workflow Enhancement**
The new integrated workflow follows this pattern:

```
1. Sales Rep uses Comparador → Generates comparison
2. Downloads PDF → Shares with client
3. Client agrees → Sales Rep clicks "Crear Contrato"
4. Form pre-fills with comparison data
5. Sales Rep completes remaining fields
6. Contract is created with link to original comparison
```

---

## 📂 New File Structure

```
src_prod/
├── index.html (NEW: Unified interface with tabs)
├── styles.css (UPDATED: Added tab styling)
├── tunergia-core.js
├── tunergia-api.js
├── tunergia-ui.js
├── tunergia-tabs.js (NEW: Tab navigation logic)
└── modules/
    ├── contracts/
    │   └── contracts-content.html (Extracted contracts view)
    └── comparador/
        ├── comparador.html (Comparison tool HTML)
        ├── comparador.css (Comparison tool styles)
        └── comparador.js (UPDATED: Added contract creation integration)
```

---

## 🔧 Technical Changes

### JavaScript

**New File: `tunergia-tabs.js`**
- Handles tab switching between Contratos and Comparador
- Dynamically loads module content
- Manages comparador mode selection
- Integrates with localStorage for persistence

**Updated: `comparador.js`**
- Added `createContractFromComparison()` function
- Added `prefillContractForm()` helper function
- Contract data stored in localStorage for cross-module communication
- Version bumped to v14

### CSS

**Updated: `styles.css`**
- New `.tunergia-app` wrapper styles
- `.main-tabs-container` and `.main-tab` styling
- `.view-panel` animation and transitions
- `.comparador-mode-selector` and `.mode-card` styling
- Responsive design for mobile devices

**Updated: `comparador.css`**
- Added `.create-contract-button` styling
- Updated `.action-buttons` grid for 4 buttons
- Responsive adjustments

### HTML

**New: `LOADER-PROD-V3.html`**
- Updated production loader with tab navigation
- Loads `tunergia-tabs.js` module
- Updated comments and documentation

**New: `modules/contracts/contracts-content.html`**
- Extracted original contracts view for modular loading

---

## 🔄 Migration Guide

### For Development:
1. Use `LOADER-PROD-V3.html` instead of `LOADER-PROD.html`
2. After committing, update CDN links with new commit hash
3. Test tab switching and module loading
4. Test "Crear Contrato" workflow from comparador

### For Production (Odoo):
1. Replace existing HTML block with content from `LOADER-PROD-V3.html`
2. Update CDN links with latest commit hash:
   ```
   Replace: COMMIT_HASH
   With: <actual-commit-hash>
   ```
3. Clear browser cache
4. Test both modules

---

## 🐛 Known Issues

None at this time.

---

## 📝 Notes

- The comparison tool uses existing n8n webhooks (no changes required)
- BigQuery database structure remains unchanged
- User authentication is shared across both modules
- All existing contracts functionality preserved

---

## 🎯 Future Enhancements

- Add more comparison modes (gas, dual supply, etc.)
- Enhanced contract-comparison linking in database
- Bulk comparison operations
- Advanced filtering in comparison history
- Export comparison history to Excel

---

## 👥 Contributors

- Pedro Krug (@pedrokrug)
- Claude AI Assistant

---

## 📄 License

Internal tool for Tunergia use only.
