# Interface Tunergia - Micro CRM Documentation

**Branch:** `claude/enhance-interface-usability-UKPeH`
**Last Updated:** 2025-12-17
**Project:** Tunergia Contract Management Interface

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture & Technical Stack](#architecture--technical-stack)
3. [API Endpoints & Webhooks](#api-endpoints--webhooks)
4. [Data Flow & Business Logic](#data-flow--business-logic)
5. [Important Fields & Mappings](#important-fields--mappings)
6. [Current State](#current-state)
7. [Suggested Improvements](#suggested-improvements)
8. [Historical Changelog](#historical-changelog)

---

## 🎯 Project Overview

**Purpose:** A lightweight CRM interface for Tunergia energy contract management, integrated with:
- **Odoo** (user sessions and authentication)
- **BigQuery** (contract data and product catalog)
- **NODO API** (GAIAG contract management platform)
- **SIPS** (Spanish electricity supply point data)

**Key Features:**
- ✅ Contract list view with filtering and search
- ✅ Detailed contract viewing with NODO integration
- ✅ New contract creation with dynamic product filtering
- ✅ Contract renewal workflow with smart comercializadora matching
- ✅ SIPS data extraction for CUPS (consumption and power data)
- ✅ Document upload with base64 encoding
- ✅ BigQuery integration for product catalog
- ✅ Vigency date filtering for products
- ✅ 422 error handling with user-friendly messages

**Technology:**
- **Frontend:** Single-page HTML/CSS/JavaScript application
- **Backend:** n8n workflow automation (webhook-based)
- **Database:** Google BigQuery
- **External APIs:** NODO (GAIAG), SIPS, Odoo

---

## 🏗️ Architecture & Technical Stack

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Odoo Web Interface                       │
│              (Embedded HTML in IFrame)                      │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ User Session Data
                  │ (idComercial, userName)
                  ↓
┌─────────────────────────────────────────────────────────────┐
│              Interface Tunergia.html                        │
│         (Single-page JavaScript application)                │
├─────────────────────────────────────────────────────────────┤
│  • Contract List View                                       │
│  • Contract Detail Modal                                    │
│  • Create Contract Modal                                    │
│  • Renewal Workflow                                         │
│  • Document Upload                                          │
│  • SIPS Integration                                         │
└─────────┬───────────────────┬───────────────────┬───────────┘
          │                   │                   │
          │                   │                   │
    ┌─────▼─────┐      ┌──────▼──────┐    ┌──────▼──────┐
    │  BigQuery │      │ n8n Webhooks│    │  NODO API   │
    │  Database │      │  Workflows  │    │   (GAIAG)   │
    └───────────┘      └──────┬──────┘    └─────────────┘
                              │
                       ┌──────▼──────┐
                       │  SIPS API   │
                       └─────────────┘
```

### Frontend Components

**Main JavaScript State Object:**
```javascript
const state = {
    contracts: [],           // Full contract list from BigQuery
    filteredContracts: [],   // Filtered results
    currentContractId: null, // Selected contract for detail view
    idComercial: null,       // From Odoo session
    userName: '',            // From Odoo session
    contractsLimit: 100,     // Pagination limit
    totalContracts: 0        // Total count
}
```

**Key Functions:**
- `loadContracts()` - Fetch contracts from BigQuery
- `openContractDetail(id)` - Fetch full contract data from NODO
- `renovarContract()` - Pre-fill renewal form with contract data
- `extractSipsData()` - Auto-fill consumption data from SIPS
- `handleFileUpload()` - Convert files to base64 for upload
- `loadProducts()` - Dynamic product filtering with vigency dates
- `matchComercializadora()` - Smart string matching for renewals

---

## 🔗 API Endpoints & Webhooks

### n8n Webhook Endpoints

**Base URL:** `https://tunuevaenergia.com/webhook/`

| Endpoint | Method | Purpose | Request Body | Response |
|----------|--------|---------|--------------|----------|
| `/bigquery-nodo` | POST | Execute BigQuery queries | `{ query: string }` | `{ data: Array }` |
| `/nodo` | POST | Get contract details from NODO | `{ id: number }` | Contract object with full details |
| `/crear-contrato-nodo` | POST | Create new contract in NODO | Contract data object | `{ id_operacion: number, ... }` |
| `/SIPS-contrato-nodo` | POST | Extract SIPS data for CUPS | `{ cups: string }` | Consumption and power data |
| `/documento-nodo` | GET | Download document from NODO | `query` param with NODO path | Binary file |

### BigQuery Tables

**Products Table:**
```
tunergia-1722509306765.Precios_Tunergia.Tarifas Fijas Portfolio
```

**Fields:**
- `COMPA____A` - Comercializadora name
- `PRODUCTO` - Product name
- `TARIFA` - Product tariff name
- `TIPO_DE_CLIENTE` - Customer type (Residencial, Empresa, CCPP)
- `TARIFA_ACCESO` - Access tariff (2.0TD, 3.0TD, 6.1TD, RL.1, RL.2, RL.3)
- `INICIO_VIGENCIA` - Product validity start date
- `FIN_VIGENCIA` - Product validity end date

**Contracts Table:**
```
tunergia-1722509306765.Contratos_Comisiones.Contratos
```

**Fields:**
- `id`, `tipo`, `estado`, `fecha`, `cups`, `cliente`, `poblacion`, `provincia`
- `consumo`, `fecha_activacion`, `fecha_cancelacion`, `tarifa`, `tarifa_acceso`
- `observaciones`, `id_comercial`, `borrado`

### NODO API (GAIAG Platform)

**Base URL:** `https://gaiag.nodogestion.com`
**Authentication:** HTTP Basic Auth

**Key Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/operaciones/consultar` | POST | Get contract by ID or CUPS |
| `/api/operaciones/crear` | POST | Create new contract |
| `/api/documentos/subir` | POST | Upload document to contract |

**NODO Contract Response Structure:**
```javascript
{
  resultado: "OK",
  datos: {
    nombre_cliente: string,
    nif: string,
    email: string,
    movil: string,
    telefono: string,
    iban_contrato: string,
    direccion: string,
    cp: string,
    poblacion: string,
    provincia: string,
    cups: string,
    comercializadora: string,
    comercializadora_saliente: string,
    concepto: string,
    tipo_contratacion: string,
    cnae_actividad: string,
    consumo: number,
    potencia_p1: number,
    potencia_p2: number,
    // ... p3-p6
    consumo_p1: number,
    consumo_p2: number,
    // ... p3-p6
    firma_digital: string,
    fact_electronica: string,
    luz_autoconsumo: string,
    // ... more fields
  }
}
```

### SIPS API

**Endpoint:** Integrated via n8n webhook `/SIPS-contrato-nodo`

**CUPS Format Detection:**
- Electricity: Starts with `ES` + 16 digits + 2 letters (e.g., `ES0021000008926202HZ0F`)
- Gas: Different pattern

**Response Fields:**
- Consumption periods (P1-P6)
- Contracted power per period
- Annual consumption in kWh

---

## 🔄 Data Flow & Business Logic

### 1. Contract List Loading

```
User Opens Interface
    ↓
Odoo injects session data (idComercial)
    ↓
loadContracts() executes BigQuery query
    ↓
Filter: WHERE id_comercial = '${idComercial}' AND borrado = 0
    ↓
Display in table with filters
```

### 2. Contract Detail View

```
User clicks contract
    ↓
openContractDetail(contractId)
    ↓
POST to /nodo webhook with { id: contractId }
    ↓
n8n calls NODO API: /api/operaciones/consultar
    ↓
Parse and display full contract data
    ↓
Show RENOVAR button
```

### 3. New Contract Creation

```
User clicks "Crear Contrato"
    ↓
loadComercializadoras() - Fetch from BigQuery
    ↓
User selects: Tipo Cliente, Comercializadora, Tarifa de Acceso
    ↓
loadProducts() with vigency filtering:
    WHERE COMPA____A = X
      AND TARIFA_ACCESO = Y
      AND TIPO_DE_CLIENTE = mapped_type
      AND (INICIO_VIGENCIA <= today OR NULL)
      AND (FIN_VIGENCIA >= today OR NULL)
    ↓
User fills form + optional SIPS extraction
    ↓
User uploads documents (converted to base64)
    ↓
Submit → POST to /crear-contrato-nodo
    ↓
n8n processes via DYNAMIC CONTRACT NODE
    ↓
NODO API creates contract
    ↓
Prepare Documents Array node
    ↓
Loop: Upload each document to NODO
```

### 4. Contract Renewal Workflow

```
User clicks "RENOVAR" button
    ↓
renovarContract() fetches full data from NODO
    ↓
Pre-fill all form fields with existing data
    ↓
Set renewal mode flag
    ↓
Smart comercializadora matching:
    - Normalize strings (remove _GAIAG, underscores, trim)
    - Match original with selected
    ↓
Dynamic tipo_contratacion:
    - Same comercializadora → "RENOVACION"
    - Different → "CAMBIO"
    ↓
User can modify fields
    ↓
Submit as new contract
```

### 5. SIPS Data Extraction

```
User enters CUPS
    ↓
Click "Extrair datos SIPS" button
    ↓
Detect CUPS type (electricity vs gas) via regex
    ↓
POST to /SIPS-contrato-nodo with { cups: string }
    ↓
n8n calls SIPS API (no factura endpoint)
    ↓
Auto-fill consumption and power fields
```

---

## 📊 Important Fields & Mappings

### Customer Type Mapping

The interface maps UI customer types to BigQuery filter values:

| UI Value (tipo_empresa) | BigQuery Filter (TIPO_DE_CLIENTE) |
|-------------------------|-------------------------------------|
| PARTICULAR | `Residencial` |
| AUTONOMO | `Empresa` OR `CCPP` |
| EMPRESA | `Empresa` OR `CCPP` |
| CCPP | `CCPP` |

**Implementation:**
```javascript
const typeMapping = {
    'PARTICULAR': 'Residencial',
    'AUTONOMO': ['Empresa', 'CCPP'],
    'EMPRESA': ['Empresa', 'CCPP'],
    'CCPP': 'CCPP'
};
```

### Form Fields to NODO Mapping

**Personal Data:**
```javascript
{
  nombre_cliente: form.nombre_cliente.value,
  nif: form.nif.value,
  email: form.email.value,
  movil: form.movil.value,
  iban_contrato: form.iban_contrato.value,
  direccion: form.direccion.value,        // Dirección Fiscal
  cp: form.cp.value,                      // Código Postal
  poblacion: form.poblacion.value,        // Población
  provincia: form.provincia.value         // Provincia
}
```

**Supply Data:**
```javascript
{
  persona_contacto: form.persona_contacto.value,      // Nombre Completo (suministro)
  persona_contacto_nif: form.persona_contacto_nif.value, // DNI (suministro)
  cups: form.cups.value,
  comercializadora_saliente: form.comercializadora_saliente.value,
  direccion_suministro: form.direccion_suministro.value,
  poblacion_suministro: form.poblacion_suministro.value,
  provincia_suministro: form.provincia_suministro.value,
  cp_suministro: form.cp_suministro.value
}
```

**Contract Data:**
```javascript
{
  comercializadora: form.comercializadora.value,
  concepto: form.concepto.value,                 // Selected product
  tarifa_acceso: form.tarifa_acceso.value,
  tipo_contratacion: form.tipo_contratacion.value, // RENOVACION / CAMBIO
  cnae_actividad: form.cnae_actividad.value,
  firma_digital: form.firma_digital.value,       // "0" or "1"
  fact_electronica: form.fact_electronica.value, // "NO" or "SI"
  luz_autoconsumo: form.luz_autoconsumo.value,   // "NO" or "SI"
  cambio_titular: checkbox ? "SI" : "NO",
  cambio_potencia: checkbox ? "SI" : "NO"
}
```

**Consumption Data:**
```javascript
{
  consumo_anual_kwh: form.consumo.value,
  potencia_p1: form.potencia_contratada_1.value,
  potencia_p2: form.potencia_contratada_2.value,
  potencia_p3: form.potencia_contratada_3.value,
  // ... p4, p5, p6
  consumo_p1: form.consumo_1.value,
  consumo_p2: form.consumo_2.value,
  consumo_p3: form.consumo_3.value,
  // ... p4, p5, p6
}
```

**Documents Array:**
```javascript
documents: [
  {
    id: timestamp_filename,
    filename: "document.pdf",
    data: "base64EncodedString...",
    mimeType: "application/pdf",
    size: 726570
  }
]
```

### n8n DYNAMIC CONTRACT NODE

Formats data for NODO API with numeric parsing:

```javascript
function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}

// All numeric fields processed with parseNumeric()
contract_data: {
  potencia_p1: parseNumeric(contractData.potencia_p1),
  consumo_p1: parseNumeric(contractData.consumo_p1),
  // ... etc
}
```

### n8n PREPARE DOCUMENTS ARRAY NODE

Extracts documents and contract ID for loop upload:

**Inputs:**
1. NODO response (contract ID)
2. Original webhook data (documents)

**Output:** Array of items for loop
```javascript
[
  {
    contract_id: "123456",
    document_name: "file.pdf",
    document_data: "base64...",
    document_mime_type: "application/pdf",
    document_index: 1,
    total_documents: 3
  },
  // ... more documents
]
```

---

## 📍 Current State

**Version:** Branch `claude/enhance-interface-usability-UKPeH`
**Status:** ✅ Fully functional with all core features implemented

### ✅ Completed Features

1. **Contract Management**
   - ✅ List view with pagination (100, 200, 500, 1000 contracts)
   - ✅ Real-time search and filtering
   - ✅ Date range filtering
   - ✅ Contract detail modal with full NODO data

2. **Contract Creation**
   - ✅ Dynamic comercializadora loading from BigQuery
   - ✅ Product filtering by tipo_cliente, comercializadora, tarifa_acceso
   - ✅ Vigency date filtering (INICIO_VIGENCIA, FIN_VIGENCIA)
   - ✅ SIPS data extraction with auto-fill
   - ✅ Document upload with base64 conversion
   - ✅ Form validation and 422 error handling

3. **Contract Renewal**
   - ✅ RENOVAR button in contract detail
   - ✅ Full data fetching from NODO (not limited BigQuery list)
   - ✅ All fields pre-filled (email, phone, NIF, IBAN, addresses)
   - ✅ Smart comercializadora matching (handles variations like _GAIAG)
   - ✅ Dynamic tipo_contratacion (RENOVACION vs CAMBIO)
   - ✅ Cambio de Titular / Cambio de Potencia checkboxes

4. **UI/UX Improvements**
   - ✅ Reorganized form layout (Comercializadora Saliente next to names)
   - ✅ Centered optional checkboxes
   - ✅ Centered button text
   - ✅ Purple consumption table headers (was white/invisible)
   - ✅ Responsive modal design

5. **n8n Workflow**
   - ✅ DYNAMIC CONTRACT NODE with numeric parsing
   - ✅ PREPARE DOCUMENTS ARRAY with multi-input handling
   - ✅ Document upload loop
   - ✅ SIPS integration with CUPS type detection

### 🔧 Known Issues

**None currently reported** - All major bugs from previous iterations have been resolved.

### 🎯 Current Configuration

**BigQuery Tables:**
- Products: `tunergia-1722509306765.Precios_Tunergia.Tarifas Fijas Portfolio`
- Contracts: `tunergia-1722509306765.Contratos_Comisiones.Contratos`

**Default Values:**
- CNAE: `9820`
- Observaciones: `"Contrato generado desde Tunerface"`
- Comercial ID: Dynamic from Odoo session

---

## 💡 Suggested Improvements

### Priority 1: High Impact

1. **Product Search/Autocomplete**
   - Current: Dropdown with all products (can be long list)
   - Improvement: Add search/filter input within product dropdown
   - Benefit: Faster product selection, better UX

2. **Form Autosave**
   - Current: Data lost if user closes modal accidentally
   - Improvement: Save form state to localStorage
   - Benefit: Prevent data loss, better UX

3. **Bulk Contract Import**
   - Current: One contract at a time
   - Improvement: CSV/Excel upload for multiple contracts
   - Benefit: Faster onboarding for multiple clients

4. **Contract Templates**
   - Current: Fill all fields manually each time
   - Improvement: Save common configurations as templates
   - Benefit: Faster contract creation for similar customers

### Priority 2: Medium Impact

5. **Advanced Analytics Dashboard**
   - Add charts for: contracts by comercializadora, by month, by status
   - Show conversion rates, renewal rates
   - Export reports to PDF/Excel

6. **Document Preview**
   - Current: Upload blindly, no preview
   - Improvement: Show PDF/image preview before upload
   - Benefit: Verify correct document before submission

7. **Validation Improvements**
   - Add real-time NIF/CIF validation (checksum)
   - Add IBAN validation
   - Add CUPS format validation beyond basic length
   - Add postal code validation by province

8. **Notification System**
   - Contract creation success/failure notifications
   - Document upload progress indicator
   - SIPS extraction loading state

### Priority 3: Nice to Have

9. **Mobile Responsive Design**
   - Current: Desktop-optimized
   - Improvement: Full mobile responsive with touch-friendly controls
   - Benefit: Use on tablets/phones

10. **Keyboard Shortcuts**
    - Ctrl+K: Quick search
    - Ctrl+N: New contract
    - Esc: Close modals
    - Tab navigation improvements

11. **Export Contract Data**
    - Export filtered contracts to Excel/CSV
    - Include all fields or custom column selection

12. **Dark Mode**
    - Add dark theme toggle
    - Save preference to localStorage

### Technical Debt & Optimization

13. **Code Splitting**
    - Current: Single 3800+ line HTML file
    - Split into: config.js, state.js, ui.js, api.js, utils.js
    - Better maintainability

14. **Caching Strategy**
    - Cache comercializadoras list (rarely changes)
    - Cache product list with TTL
    - Reduce BigQuery calls

15. **Error Logging**
    - Send errors to backend logging service
    - Track user actions for debugging
    - Monitor API response times

16. **Type Safety**
    - Consider migrating to TypeScript
    - Better autocomplete and error catching

---

## 📜 Historical Changelog

### 2025-12-17 - Contract Renewal & UI Improvements

**Commit:** `ddd4773` - Improve document upload handling in n8n workflow
- Updated Prepare Documents Array node to handle multiple input sources
- Get contract ID from NODO response with multiple structure format support
- Get documents from original webhook data via second input or node reference
- Added robust error handling and logging

**Commit:** `6e3f178` - Fix contract renewal data loading and improve form UI layout
- Fixed missing fields in contract renewal by fetching full data from NODO API instead of limited BigQuery list
- Used correct NODO field names (email, movil, iban_contrato, etc.)
- Reorganized Datos de Suministro: moved Comercializadora Saliente next to Nombre Completo and DNI
- Centered Opciones Adicionales checkboxes (Cambio de Titular/Potencia)
- Centered text in Crear Contrato submit button with flexbox

**Changes:**
- `Interface Tunergia.html:2955-3095` - Modified `renovarContract()` to fetch full contract data
- `Interface Tunergia.html:2098-2142` - Reorganized Datos de Suministro form layout
- `Interface Tunergia.html:2207-2219` - Centered optional checkboxes
- `Interface Tunergia.html:2287-2289` - Centered button text
- `n8n_prepare_documents_array.js` - Enhanced document handling logic

### 2025-12-17 - Document Upload & Renewal Flow

**Commit:** `37949d7` - Implement contract renewal flow and document upload functionality
- Implemented RENOVAR button in contract detail header
- Created `renovarContract()` function with smart comercializadora matching
- Added `matchComercializadora()` helper to normalize and compare company names
- Added `extractTarifaAcceso()` to parse tarifa from concepto field
- Implemented dynamic tipo_contratacion based on comercializadora selection
- Created file upload functionality with base64 conversion
- Updated n8n nodes to handle documents array

**Files Created:**
- `n8n_prepare_documents_array.js` - Document loop preparation code
- `IMPLEMENTATION_GUIDE.md` - n8n setup documentation
- `renewal_and_upload_logic.js` - Reference implementation

**Changes:**
- `Interface Tunergia.html` - Added renewal workflow and document upload UI/logic
- `n8n_dynamic_contract_node.js` - Added cambio_titular, cambio_potencia, documents fields

### 2025-12-16 - SIPS Integration & Error Handling

**Commit:** Previous iteration
- Added "Extrair datos SIPS" button for CUPS data extraction
- Created SIPS webhook endpoint `/SIPS-contrato-nodo`
- Implemented CUPS type detection (electricity vs gas)
- Added 422 error handling with user-friendly messages
- Fixed consumption table header colors (purple background)
- Added vigency date filtering for products

**Changes:**
- `Interface Tunergia.html:3097-3170` - `extractSipsData()` function
- `Interface Tunergia.html` - Added vigency date filtering in `loadProducts()`
- `BigQuery for MCP.json` - Added SIPS webhook and nodes

### 2025-12-15 - Product Filtering & Field Mappings

**Commit:** Previous iteration
- Implemented multi-criteria product filtering
- Added tipo_cliente to TIPO_DE_CLIENTE mapping logic
- Fixed BigQuery table reference to `Tarifas Fijas Portfolio`
- Changed CCMM to CCPP (Comunidad de Propietarios)
- Fixed field name from TIPO_CLIENTE to TIPO_DE_CLIENTE

**Changes:**
- Added RL.1, RL.2, RL.3 tariff options
- Updated product query with tipo_cliente mapping
- Fixed n8n DYNAMIC CONTRACT NODE data access

### 2025-12-14 - Initial Implementation

**Initial Commit:** Project setup
- Created Interface Tunergia.html with contract list view
- Implemented BigQuery integration via n8n webhooks
- Created NODO API integration for contract details
- Set up create contract modal with form validation
- Implemented basic filtering and search

**Files Created:**
- `Interface Tunergia.html` - Main application file
- `BigQuery for MCP.json` - n8n workflow configuration
- `n8n_dynamic_contract_node.js` - Contract data formatting node

---

## 📞 Support & Contact

**Project Repository:** Branch `claude/enhance-interface-usability-UKPeH`
**Integration Platform:** Odoo (tunergiav18.odoo.com)
**Workflow Automation:** n8n (tunuevaenergia.com)

**Key Integrations:**
- NODO API: `gaiag.nodogestion.com`
- BigQuery: `tunergia-1722509306765`
- SIPS: Spanish electricity supply data

---

**Document Version:** 1.0
**Last Updated:** 2025-12-17
**Maintained By:** Development team working on contract management enhancements
