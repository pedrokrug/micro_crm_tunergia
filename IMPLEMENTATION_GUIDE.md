# n8n Workflow Implementation Guide

## Document Upload Workflow

### 1. Add "Prepare Documents Array" Node
- **Type**: Code Node
- **Position**: After "NODO - Crear Contrato" success response
- **Code**: Use content from `n8n_prepare_documents_array.js`
- **Purpose**: Converts documents array into individual items for loop processing

### 2. Add "NODO - Upload Document (Loop)" Node
- **Type**: HTTP Request Node
- **Method**: POST
- **URL**: `https://gaiag.nodogestion.com/api/operaciones/{{ $json.contract_id }}/documentos`
- **Authentication**: HTTP Basic Auth (NODO credentials)
- **Body Type**: Multipart Form Data
- **Parameters**:
  - `nombre`: `={{ $json.document_name }}`
  - `archivo`: `={{ $binary.data }}` (for binary data)
  OR
  - `archivo_base64`: `={{ $json.document_data }}` (if using base64)

### 3. Workflow Connections
```
Crear Contrato en NODO (webhook)
  ↓
DYNAMIC CONTRACT NODE
  ↓
NODO - Crear Contrato (HTTP Request)
  ↓ (on success)
Split into two paths:
  Path 1: Return success response to UI
  Path 2: Prepare Documents Array → NODO - Upload Document (Loop)
```

### 4. Response to Webhook
Make sure to respond to webhook BEFORE the document upload loop starts, so the UI doesn't wait for all documents to upload.

## UI Changes Summary

### Contract Renewal Flow
1. Added "RENOVAR" button to contract detail view
2. Opens contract creation form with pre-filled data
3. Smart comercializadora matching (handles variations like "CONTIGO_ENERGIA_GAIAG" vs "Contigo Energia")
4. Dynamic tipo_contratacion:
   - "RENOVACION" if same comercializadora
   - "CAMBIO" if different comercializadora
5. Added radio buttons for:
   - Cambio de Titular
   - Cambio de Potencia

### Document Upload
1. File upload converts to base64
2. Sent as array in contract payload
3. n8n processes documents after contract creation
