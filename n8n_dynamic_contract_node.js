// N8N Code Node to replace DYNAMIC CONTRACT NODE
// This node processes incoming contract data and formats it for NODO API

// Get the input data from the webhook - data comes in body
const inputData = $input.all()[0].json.body || $input.all()[0].json;

// Extract contract_data object and other fields
const contractData = inputData.contract_data || {};
const tipoEmpresa = inputData.tipo_empresa || '';
const telefono = inputData.telefono || '';
const comercializadora = inputData.comercializadora || '';
const concepto = inputData.concepto || '';
const cnae = inputData.cnae || '9820';
const observaciones = inputData.observaciones || 'Contrato generado desde Tunerface';
const tipoContratacion = inputData.tipo_contratacion || '';
const comercial = inputData.comercial || '1731';

// Helper function to safely parse numeric values (handles strings and numbers)
function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}

// Prepare the formatted data object
const formattedData = {
  contract_data: {
    titular: contractData.titular || '',
    nif: contractData.nif || '',
    direccion_fiscal: contractData.direccion_fiscal || '',
    cp_fiscal: contractData.cp_fiscal || '',
    poblacion_fiscal: contractData.poblacion_fiscal || '',
    provincia_fiscal: contractData.provincia_fiscal || '',
    email: contractData.email || '',
    movil: contractData.movil || '',
    cups: contractData.cups || '',
    comercializadora_actual: contractData.comercializadora_actual || '',
    direccion_suministro: contractData.direccion_suministro || '',
    poblacion_suministro: contractData.poblacion_suministro || '',
    provincia_suministro: contractData.provincia_suministro || '',
    cp_suministro: contractData.cp_suministro || '',
    iban: contractData.iban || '',
    consumo_anual_kwh: parseNumeric(contractData.consumo_anual_kwh),
    potencia_p1: parseNumeric(contractData.potencia_p1),
    potencia_p2: parseNumeric(contractData.potencia_p2),
    potencia_p3: parseNumeric(contractData.potencia_p3),
    potencia_p4: parseNumeric(contractData.potencia_p4),
    potencia_p5: parseNumeric(contractData.potencia_p5),
    potencia_p6: parseNumeric(contractData.potencia_p6),
    consumo_p1: parseNumeric(contractData.consumo_p1),
    consumo_p2: parseNumeric(contractData.consumo_p2),
    consumo_p3: parseNumeric(contractData.consumo_p3),
    consumo_p4: parseNumeric(contractData.consumo_p4),
    consumo_p5: parseNumeric(contractData.consumo_p5),
    consumo_p6: parseNumeric(contractData.consumo_p6),
    tarifa_acceso: contractData.tarifa_acceso || ''
  },
  tipo_empresa: tipoEmpresa,
  telefono: telefono,
  comercializadora: comercializadora,
  concepto: concepto,
  cnae: cnae,
  observaciones: observaciones,
  tipo_contratacion: tipoContratacion,
  comercial: comercial
};

// Return the formatted data
return [{
  json: formattedData
}];
