# Migration Audit: Original vs Modular Version

**Date:** 2025-12-22
**Status:** MODULAR VERSION IS INCOMPLETE
**Action Required:** Sync modular with original before new features

---

## Executive Summary

| Component | Status | Gap |
|-----------|--------|-----|
| **CSS** | IDENTICAL | None - CSS migrated perfectly |
| **HTML** | INCOMPLETE | Missing ~107 lines, 3 form sections, document upload |
| **JavaScript** | INCOMPLETE | Missing 8+ functions, 6+ event listeners, document handling |

**The original code works better because the modular version is missing critical functionality.**

---

## CRITICAL ISSUES (Must Fix)

### 1. Document Upload - COMPLETELY MISSING

**Original has (lines 748-758, 876-921, 1527-1555):**
- Drag-and-drop upload area with `id="uploadArea"`
- File input with `id="fileInput"`
- Uploaded files list with `id="uploadedFilesList"`
- `handleFileUpload()` function with base64 encoding
- Event listeners for dragover/dragleave/drop/change

**Modular has:** Nothing - cannot upload documents with contracts

---

### 2. Document Download - BROKEN

**Original (line 1706-1725):**
```javascript
window.tunergiaDownloadDoc = function(url, filename) {
    const downloadUrl = `${CONFIG.documentWebhookUrl}?query=${encodeURIComponent(url)}`;
    // Creates temp link and clicks it
};
```

**Modular:** Function `window.tunergiaDownloadDoc` is UNDEFINED but called in rendered HTML!

---

### 3. Power/Consumption Table - MISSING IN CREATE FORM

**Original (lines 707-744):** Full P1-P6 table with 12 input fields
```html
<table class="consumo-table">
    <thead><tr><th></th><th>P1</th>...<th>P6</th></tr></thead>
    <tbody>
        <tr><td>Potencia (kW)</td><td><input name="potencia_contratada_1">...</td></tr>
        <tr><td>Consumo (kWh)</td><td><input name="consumo_1">...</td></tr>
    </tbody>
</table>
```

**Modular:** Only single "Consumo Anual (kWh)" field - missing 11 fields!

---

### 4. SIPS Data Extraction - NO UI HANDLER

**Original (lines 802-868):** Complete `extractSipsData()` function that:
- Validates CUPS input
- Calls SIPS webhook
- Auto-fills 20+ form fields (consumption, power, addresses)
- Shows loading state on button

**Modular:** API method exists but NO event listener attached to button

---

### 5. Missing Form Fields in Create Contract

| Field | Original Line | Status in Modular |
|-------|---------------|-------------------|
| Firma Digital | 661-665 | MISSING |
| Factura Electrónica | 667-672 | MISSING |
| Autoconsumo | 674-679 | MISSING |
| Cambio de Titular checkbox | 689-694 | MISSING |
| Cambio de Potencia checkbox | 695-700 | MISSING |

---

### 6. Missing Event Listeners

| Listener | Original Line | Purpose |
|----------|---------------|---------|
| Items per page selector | 1756-1764 | Change pagination size |
| Extract SIPS button | 1700-1703 | Trigger SIPS extraction |
| "Same as personal" checkbox | 1558-1571 | Copy personal to supply address |
| File upload handlers | 1527-1555 | Document upload |
| Debounce on search | 1407-1410 | Performance (filters on every keystroke now) |
| Date range filter apply/clear | 1727-1753 | Filter by date range |

---

## HIGH PRIORITY ISSUES

### 7. Element ID Mismatches

| Component | LOADER ID | Original ID | Impact |
|-----------|-----------|-------------|--------|
| Loading Overlay | `loadingOverlay` | `dashboardLoading` | JS won't find element |
| Error Banner | `errorBanner` | `dashboardError` | Errors won't display |
| Error Text | `errorBannerText` | `errorText` | Error message lost |
| Back Button | `closeContractDetailBtn` | `backToListBtn` | Navigation may fail |

---

### 8. Field Icons/Emojis - Missing ~27 Emojis

**Original has field icons in contract detail view:**
```html
<div class="field-value"><span class="field-icon">✉️</span> <span id="detailCorreo">-</span></div>
<div class="field-value"><span class="field-icon">📱</span> <span id="detailMovil">-</span></div>
<div class="field-value"><span class="field-icon">🪪</span> <span id="detailDNI">-</span></div>
<div class="field-value"><span class="field-icon">🏦</span> <span id="detailIBAN">-</span></div>
<div class="field-value"><span class="field-icon">📍</span> <span id="detailDireccion">-</span></div>
```

**All these field icons are missing in modular:**
- ✉️ Email, 📱 Phone, 🪪 NIF/DNI, 🏦 IBAN
- 📍 Address, 📮 Postal Code, 🏘️ Town, 🏛️ Province
- ⚡ Comercializadora, 🔌 CUPS, 📋 Concepto
- 🏢 CNAE, 📅 Dates, 👤 Comercial, 👔 KAM

---

### 9. Table Column Names Different

| Position | LOADER | Original | Notes |
|----------|--------|----------|-------|
| Col 3 | "Cliente" | "Nombre" | Different label |
| Col 5 | "Tipo" | "Comercializadora" | Wrong semantics! |
| Col 9 | "Fecha" | "Fecha Creación" | Less descriptive |

---

### 10. Missing JavaScript Functions

| Function | Original Line | Purpose |
|----------|---------------|---------|
| `downloadDocument()` | 923-928 | Open document in new tab |
| `updateLoadMoreButton()` | 385-394 | Update "showing X of Y" text |
| `changeContractsLimit()` | 396-401 | Change how many contracts to load |
| `debounce()` | 1886-1896 | Prevent excessive function calls |
| `handleFileUpload()` | 876-921 | Process uploaded files to base64 |
| `extractSipsData()` (UI) | 802-868 | Handle SIPS button click |

---

## MEDIUM PRIORITY ISSUES

### 11. Search Functionality Reduced

**Original searches these fields:**
- id, cliente, cups, tipo, poblacion, provincia

**Modular only searches:**
- cliente, cups, id

**Missing:** tipo, poblacion, provincia search

---

### 12. Date Sorting Broken

**Original (line 1215-1228):** Handles fecha columns specially
```javascript
if (state.sortColumn === 'fecha' || state.sortColumn === 'fecha_activacion') {
    valA = new Date(valA).getTime() || 0;
}
```

**Modular:** Only handles numeric columns (id, consumo) - dates don't sort correctly

---

### 13. API Error Response Mismatch

**Original expects:**
```javascript
errorData.errores  // Spanish plural
```

**Modular expects:**
```javascript
errorData.errors   // English plural
```

May cause validation errors to not display properly.

---

### 14. Renewal Mode Missing Features

**Original (line 787-798):** Dynamic tipo_contratacion update
```javascript
comercializadoraSelect.addEventListener('change', function() {
    if (matchComercializadora(newComercializadora, originalComercializadora)) {
        tipoSelect.value = 'RENOVACION';
    } else {
        tipoSelect.value = 'CAMBIO';
    }
});
```

**Modular:** This dynamic update is NOT implemented

---

### 15. Placeholder Text Less Helpful

| Field | LOADER | Original |
|-------|--------|----------|
| IBAN | `ES00...` | `ES00 0000 0000 0000 0000 0000` |
| CUPS | `ES0000...` | `ES0000000000000000XX` |
| Producto | `Seleccionar primero...` | `Seleccionar comercializadora primero...` |

---

## LOW PRIORITY ISSUES

### 16. Missing Help Text

**Original has these helper texts (missing in modular):**
- "Se carga desde base de datos" under Comercializadora
- "Se carga tras seleccionar comercializadora y tarifa" under Producto

---

### 17. Form Select Missing IDs

| Select | Original ID | LOADER |
|--------|-------------|--------|
| Tipo Cliente | `createTipoCliente` | Missing |
| Tipo Contratación | `createTipoContratacion` | Missing |

---

### 18. CCPP Option Text Truncated

**Original:** `CCPP (Comunidad de Propietarios)`
**Modular:** `CCPP`

---

## CSS STATUS: PERFECT

The CSS files are **100% identical** in functionality:
- Same border-radius values (12px, 8px, 6px, 20px, 4px)
- Same color palette (#667eea primary, #1a202c text, etc.)
- Same responsive breakpoints
- Same animations and transitions
- Same status badge colors (all 11 variants)

**No CSS work needed.**

---

## RECOMMENDED FIX APPROACH

### Option 1: Patch Modular (Estimated: 4-6 hours)
1. Add missing HTML to LOADER.html (~100 lines)
2. Add missing JS functions to ui.js (~200 lines)
3. Add missing event listeners (~50 lines)
4. Fix element IDs to match
5. Test all flows

### Option 2: Re-split Original (Estimated: 2-3 hours)
1. Take working Original Code Scripts.js
2. Split into 3 files: core.js, api.js, ui.js
3. Keep Original HTML as-is (rename to LOADER.html)
4. Test CDN loading

### Recommendation: **Option 2**

The original code works. Re-splitting it into 3 larger files (instead of 6 small ones) will:
- Preserve all functionality
- Reduce context fragmentation
- Be faster than patching 20+ issues
- Give a clean baseline for new features

---

## Files Reference

**Original (working):**
- `Original Code/Original Code HTML.html` (777 lines)
- `Original Code/Original Code Scripts.js` (1898 lines)
- `Original Code/Original Code Styles.css` (same as modular)

**Modular (incomplete):**
- `LOADER.html` (670 lines) - missing ~107 lines
- `src/config.js` (22 lines)
- `src/state.js` (34 lines)
- `src/utils.js` (164 lines)
- `src/api.js` (301 lines)
- `src/ui.js` (1239 lines) - missing functions
- `src/main.js` (99 lines)
- `src/styles.css` (identical to original)

---

## Next Steps

1. **Decision needed:** Patch modular OR re-split original?
2. After sync, create proper test checklist
3. Deploy and verify all features work
4. Then proceed with new features/integrations

---

*Generated by migration audit on 2025-12-22*
