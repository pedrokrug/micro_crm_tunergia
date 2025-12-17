// N8N Code Node: Prepare Documents Array
// This node prepares uploaded documents from the contract creation form
// for loop processing to upload each document to NODO

// Get the input data from the Dynamic Contract Node
const inputData = $input.all()[0].json;

// Extract documents array from the input
// Documents should be sent as array of {filename, data, mimeType}
const documents = inputData.documents || [];
const contractId = inputData.contract_id || inputData.id_operacion;

// If no documents, return empty array
if (!documents || documents.length === 0) {
  return [];
}

// Prepare each document for upload
const preparedDocuments = documents.map((doc, index) => {
  return {
    json: {
      contract_id: contractId,
      document_name: doc.filename || `document_${index + 1}`,
      document_data: doc.data, // Base64 encoded file data
      document_mime_type: doc.mimeType || 'application/octet-stream',
      document_index: index + 1,
      total_documents: documents.length
    }
  };
});

return preparedDocuments;
