// N8N Code Node to replace DYNAMIC CONTRACT NODE
// This node processes incoming contract data and formats it for NODO API

// Get the input data from the webhook
const inputData = $input.all()[0].json;

// Extract contract_data object and other fields
const contractData = inputData.contract_data || {};
const tipoEmpresa = inputData.tipo_empresa || '';
const telefono = inputData.telefono || '';
const comercializadora = inputData.comercializadora || '';
const concepto = inputData.concepto || '';
const cnae = inputData.cnae || '9820';
const observaciones = inputData.observaciones || 'Contrato generado desde Tunerface';
const tipoContratacion = inputData.tipo_contratacion || '';

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
    consumo_anual_kwh: parseFloat(contractData.consumo_anual_kwh) || 0,
    potencia_p1: parseFloat(contractData.potencia_p1) || 0,
    potencia_p2: parseFloat(contractData.potencia_p2) || 0,
    potencia_p3: parseFloat(contractData.potencia_p3) || 0,
    potencia_p4: parseFloat(contractData.potencia_p4) || 0,
    potencia_p5: parseFloat(contractData.potencia_p5) || 0,
    potencia_p6: parseFloat(contractData.potencia_p6) || 0,
    consumo_p1: parseFloat(contractData.consumo_p1) || 0,
    consumo_p2: parseFloat(contractData.consumo_p2) || 0,
    consumo_p3: parseFloat(contractData.consumo_p3) || 0,
    consumo_p4: parseFloat(contractData.consumo_p4) || 0,
    consumo_p5: parseFloat(contractData.consumo_p5) || 0,
    consumo_p6: parseFloat(contractData.consumo_p6) || 0,
    tarifa_acceso: contractData.tarifa_acceso || ''
  },
  tipo_empresa: tipoEmpresa,
  telefono: telefono,
  comercializadora: comercializadora,
  concepto: concepto,
  cnae: cnae,
  observaciones: observaciones,
  tipo_contratacion: tipoContratacion,
  // Add timestamp for tracking
  fecha_creacion: new Date().toISOString()
};

// Return the formatted data
return [{
  json: formattedData
}];
