// N8N Code Node: Prepare Documents Array
// This node prepares uploaded documents from the contract creation form
// for loop processing to upload each document to NODO

// This node should receive TWO inputs:
// Input 0: NODO response with the created contract ID
// Input 1: Original webhook data with documents array (or use $node reference)

const allInputs = $input.all();

// Get contract ID from NODO response (first input - from "NODO - Crear Contrato" node)
let contractId = null;
const nodoResponse = allInputs[0].json;

// NODO returns different structures, try to find the ID
if (nodoResponse.id_operacion) {
  contractId = nodoResponse.id_operacion;
} else if (nodoResponse.id) {
  contractId = nodoResponse.id;
} else if (nodoResponse.data && nodoResponse.data.id_operacion) {
  contractId = nodoResponse.data.id_operacion;
} else if (nodoResponse.data && nodoResponse.data.id) {
  contractId = nodoResponse.data.id;
} else if (Array.isArray(nodoResponse) && nodoResponse[0] && nodoResponse[0].id_operacion) {
  contractId = nodoResponse[0].id_operacion;
}

if (!contractId) {
  console.error('No contract ID found in NODO response:', nodoResponse);
  throw new Error('Contract ID not found in NODO response');
}

// Get documents array - try from second input first, then from webhook node
let documents = [];

// Try to get from second input if available
if (allInputs.length > 1 && allInputs[1].json.body) {
  documents = allInputs[1].json.body.documents || [];
} else if (allInputs.length > 1 && allInputs[1].json.documents) {
  documents = allInputs[1].json.documents || [];
}

// If not found in inputs, try to reference the webhook node directly
// This assumes your webhook node is named "Webhook" or similar
if (documents.length === 0) {
  try {
    const webhookData = $('Webhook').first().json.body || $('Webhook').first().json;
    documents = webhookData.documents || [];
  } catch (e) {
    // Webhook node not found or named differently
    console.log('Could not find webhook node, checking first input for documents');
    documents = nodoResponse.documents || [];
  }
}

// If still no documents, return empty array (no documents to upload)
if (!documents || documents.length === 0) {
  console.log('No documents found to upload');
  return [];
}

console.log(`Preparing ${documents.length} documents for contract ID: ${contractId}`);

// Prepare each document for upload
const preparedDocuments = documents.map((doc, index) => {
  return {
    json: {
      contract_id: contractId,
      document_name: doc.filename || `document_${index + 1}`,
      document_data: doc.data, // Base64 encoded file data
      document_mime_type: doc.mimeType || 'application/pdf',
      document_index: index + 1,
      total_documents: documents.length
    }
  };
});

return preparedDocuments;
