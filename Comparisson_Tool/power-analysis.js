// ============================================
// POWER ANALYSIS TOOL - JavaScript
// ============================================

// Webhook URL for Power Analysis
const POWER_ANALYSIS_WEBHOOK_URL = 'https://tunuevaenergia.com/webhook/power-analysis-crm';

// BOE Default Prices (3.0TD)
const BOE_DEFAULT_PRICES = {
  P1: 0.053858904,
  P2: 0.028086712,
  P3: 0.011678192,
  P4: 0.010086438,
  P5: 0.006378548,
  P6: 0.003716137
};

// Configuration
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const REQUEST_TIMEOUT = 120000; // 2 minutes

// State
let selectedFile = null;
let currentUser = {
  user_id: null,
  name: 'Usuario',
  email: '',
  login: ''
};
let uploadController = null;

// DOM Elements
let hasBillYes, hasBillNo;
let manualInputSection, fileUploadSection;
let cupsInput;
let priceInputs = {};
let uploadArea, fileInput, selectedFileDiv, fileName, fileSize, removeFileBtn;
let analyzeButton;
let loading, loadingText, loadingProgress;
let errorMessage;
let results;

// ============================================
// INITIALIZATION
// ============================================

function initPowerAnalysis() {
  console.log('Initializing Power Analysis Tool...');

  // Get DOM elements
  hasBillYes = document.getElementById('has-bill-yes');
  hasBillNo = document.getElementById('has-bill-no');
  manualInputSection = document.getElementById('manualInputSection');
  fileUploadSection = document.getElementById('fileUploadSection');
  cupsInput = document.getElementById('cupsInput');

  // Price inputs
  for (let i = 1; i <= 6; i++) {
    priceInputs[`P${i}`] = document.getElementById(`precio_p${i}`);
  }

  // File upload elements
  uploadArea = document.getElementById('uploadArea');
  fileInput = document.getElementById('fileInput');
  selectedFileDiv = document.getElementById('selectedFile');
  fileName = document.getElementById('fileName');
  fileSize = document.getElementById('fileSize');
  removeFileBtn = document.getElementById('removeFile');

  // Action elements
  analyzeButton = document.getElementById('analyzeButton');
  const resetPricesButton = document.getElementById('resetPricesButton');

  // State elements
  loading = document.getElementById('loading');
  loadingText = document.getElementById('loadingText');
  loadingProgress = document.getElementById('loadingProgress');
  errorMessage = document.getElementById('errorMessage');
  results = document.getElementById('results');

  // Setup event listeners
  setupEventListeners();

  // Load user info
  loadUserInfo();

  console.log('Power Analysis Tool initialized');
}

function setupEventListeners() {
  // Bill question radio buttons
  hasBillYes.addEventListener('change', toggleInputMode);
  hasBillNo.addEventListener('change', toggleInputMode);

  // CUPS input validation
  cupsInput.addEventListener('input', validateCups);
  cupsInput.addEventListener('blur', validateCups);

  // Reset prices button
  const resetPricesButton = document.getElementById('resetPricesButton');
  if (resetPricesButton) {
    resetPricesButton.addEventListener('click', resetPricesToDefault);
  }

  // File upload handlers
  uploadArea.addEventListener('click', () => fileInput.click());

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  });

  removeFileBtn.addEventListener('click', removeSelectedFile);

  // Analyze button
  analyzeButton.addEventListener('click', runPowerAnalysis);
}

// ============================================
// INPUT MODE TOGGLE
// ============================================

function toggleInputMode() {
  const hasBill = hasBillYes.checked;

  if (hasBill) {
    // Show file upload, hide manual input
    manualInputSection.style.display = 'none';
    fileUploadSection.style.display = 'block';
    analyzeButton.disabled = !selectedFile;
  } else {
    // Show manual input, hide file upload
    manualInputSection.style.display = 'block';
    fileUploadSection.style.display = 'none';
    validateCups();
  }

  hideError();
}

// ============================================
// CUPS VALIDATION
// ============================================

function validateCups() {
  const cups = cupsInput.value.trim().toUpperCase();
  cupsInput.value = cups;

  // CUPS validation: starts with ES, 20-22 characters
  const cupsRegex = /^ES[0-9]{16}[A-Z]{2}[0-9A-Z]{0,2}$/;
  const isValid = cupsRegex.test(cups);

  if (cups.length > 0) {
    if (isValid) {
      cupsInput.classList.remove('invalid');
      cupsInput.classList.add('valid');
    } else {
      cupsInput.classList.remove('valid');
      cupsInput.classList.add('invalid');
    }
  } else {
    cupsInput.classList.remove('valid', 'invalid');
  }

  // Enable/disable analyze button based on manual mode validation
  if (!hasBillYes.checked) {
    analyzeButton.disabled = !isValid;
  }

  return isValid;
}

// ============================================
// PRICE HANDLING
// ============================================

function resetPricesToDefault() {
  for (const period in BOE_DEFAULT_PRICES) {
    const input = priceInputs[period];
    if (input) {
      input.value = BOE_DEFAULT_PRICES[period];
    }
  }
}

function getPowerPrices() {
  const prices = {};
  for (let i = 1; i <= 6; i++) {
    const input = priceInputs[`P${i}`];
    prices[`precio_p${i}`] = parseFloat(input.value) || BOE_DEFAULT_PRICES[`P${i}`];
  }
  return prices;
}

// ============================================
// FILE HANDLING
// ============================================

function handleFileSelect(file) {
  // Validate file type
  if (file.type !== 'application/pdf') {
    showError('Por favor, selecciona un archivo PDF válido.');
    return;
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    showError('El archivo es demasiado grande. El tamaño máximo es 5 MB.');
    return;
  }

  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatFileSize(file.size);
  selectedFileDiv.classList.add('active');
  analyzeButton.disabled = false;
  hideError();
}

function removeSelectedFile() {
  selectedFile = null;
  fileInput.value = '';
  selectedFileDiv.classList.remove('active');
  analyzeButton.disabled = true;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================
// POWER ANALYSIS EXECUTION
// ============================================

async function runPowerAnalysis() {
  const hasBill = hasBillYes.checked;

  hideError();
  showLoading();

  try {
    let payload;

    if (hasBill) {
      // PATH B: File upload
      if (!selectedFile) {
        throw new Error('Por favor, selecciona un archivo PDF.');
      }

      loadingText.textContent = 'Leyendo factura...';

      const fileData = await readFileAsBase64(selectedFile);

      payload = {
        has_bill: true,
        file_data: fileData,
        file_name: selectedFile.name,
        user_name: currentUser.name,
        user_email: currentUser.email,
        user_id: currentUser.user_id
      };

    } else {
      // PATH A: Manual input
      if (!validateCups()) {
        throw new Error('Por favor, introduce un CUPS válido.');
      }

      loadingText.textContent = 'Consultando datos del suministro...';

      const prices = getPowerPrices();

      payload = {
        has_bill: false,
        cups: cupsInput.value.trim().toUpperCase(),
        ...prices,
        user_name: currentUser.name,
        user_email: currentUser.email,
        user_id: currentUser.user_id
      };
    }

    loadingText.textContent = 'Analizando potencia...';
    loadingProgress.textContent = '';

    // Send request
    const response = await sendWithXHR(POWER_ANALYSIS_WEBHOOK_URL, payload, REQUEST_TIMEOUT);

    hideLoading();

    if (response.success) {
      displayResults(response);
    } else {
      throw new Error(response.error || 'Error al analizar la potencia.');
    }

  } catch (error) {
    hideLoading();
    showError(error.message || 'Error al procesar la solicitud.');
    console.error('Power Analysis Error:', error);
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

function sendWithXHR(url, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.timeout = timeoutMs;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        loadingProgress.textContent = `Enviando: ${percentComplete}%`;
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch (e) {
          reject(new Error('Error al procesar la respuesta del servidor.'));
        }
      } else {
        reject(new Error(`Error del servidor: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Error de conexión. Verifica tu conexión a internet.'));
    });

    xhr.addEventListener('timeout', () => {
      reject(new Error('La solicitud ha tardado demasiado. Por favor, inténtalo de nuevo.'));
    });

    xhr.send(JSON.stringify(payload));
    uploadController = { abort: () => xhr.abort() };
  });
}

// ============================================
// RESULTS DISPLAY
// ============================================

function displayResults(response) {
  const analysisResults = response.analysis_results || [];

  if (analysisResults.length === 0) {
    showError('No se encontraron datos para analizar este CUPS.');
    return;
  }

  const data = analysisResults[0];

  // Hide upload section
  document.getElementById('power-analysis-section').style.display = 'none';

  let html = '';

  // New Analysis Button
  html += `
    <div class="results-top-action">
      <button class="new-comparison-top-button" onclick="resetAnalysis()">
        <span>➕</span>
        <span>Nuevo Análisis</span>
      </button>
    </div>`;

  // CUPS Banner
  html += `
    <div class="cups-display-banner">
      <div class="cups-display-icon">🔌</div>
      <div class="cups-display-content">
        <div class="cups-display-label">CUPS del Suministro</div>
        <div class="cups-display-value">${data.CUPS}</div>
      </div>
      <button class="cups-display-copy" onclick="copyCups('${data.CUPS}')">📋 Copiar</button>
    </div>`;

  // Savings Header
  const ahorro = data.Ahorro_Anual || 0;
  const savingsClass = ahorro > 0 ? 'positive' : (ahorro < 0 ? 'negative' : 'neutral');
  const savingsSign = ahorro > 0 ? '+' : '';

  html += `
    <div class="results-header power-analysis-results-header">
      <div class="savings-amount ${savingsClass}">${savingsSign}${ahorro.toFixed(2)} €</div>
      <div class="savings-label">Ahorro Anual Potencial</div>
      <div class="annual-savings">Ahorro Mensual: ${(data.Ahorro_Mensual || 0).toFixed(2)} €</div>
      <div class="method-badge">${data.Tarifa} - ${data.Tipo_Cliente}</div>
      <div class="analysis-period">📅 Período: ${data.Periodo_Analisis}</div>
    </div>`;

  // Recommendation Banner
  const recomendacion = data.Recomendacion_General || '';
  let recClass = 'optimal';
  if (recomendacion.includes('URGENTE')) recClass = 'urgent';
  else if (recomendacion.includes('OPTIMIZAR')) recClass = 'optimize';

  html += `
    <div class="recommendation-banner ${recClass}">
      <div class="recommendation-text">${recomendacion}</div>
    </div>`;

  // Cost Comparison Cards
  html += `
    <div class="cost-comparison-grid">
      <div class="cost-card current">
        <div class="cost-card-header">
          <span>📊</span>
          <span>Situación Actual</span>
        </div>
        <div class="cost-card-value">${(data.Coste_Actual_Anual || 0).toFixed(2)} €/año</div>
        <div class="cost-breakdown">
          <div class="cost-row">
            <span>Potencia Fija:</span>
            <span>${(data.Coste_Potencia_Fija_Actual_Anual || 0).toFixed(2)} €</span>
          </div>
          <div class="cost-row penalty">
            <span>Penalizaciones:</span>
            <span>${(data.Total_Penalizaciones_Anual || 0).toFixed(2)} €</span>
          </div>
        </div>
      </div>

      <div class="cost-card arrow">
        <div class="arrow-icon">➡️</div>
      </div>

      <div class="cost-card suggested">
        <div class="cost-card-header">
          <span>✨</span>
          <span>Situación Optimizada</span>
        </div>
        <div class="cost-card-value">${(data.Coste_Total_Sugerido_Anual || 0).toFixed(2)} €/año</div>
        <div class="cost-breakdown">
          <div class="cost-row">
            <span>Potencia Fija:</span>
            <span>${(data.Coste_Potencia_Fija_Sugerida_Anual || 0).toFixed(2)} €</span>
          </div>
          <div class="cost-row penalty">
            <span>Penalizaciones:</span>
            <span>${(data.Total_Penalizaciones_Sugerido_Anual || 0).toFixed(2)} €</span>
          </div>
        </div>
      </div>
    </div>`;

  // Power Period Details Table
  html += `
    <div class="power-details-section">
      <div class="section-title">⚡ Detalle por Periodo de Potencia</div>
      <div class="power-details-table">
        <div class="power-table-header">
          <div class="power-table-cell">Periodo</div>
          <div class="power-table-cell">Contratada (kW)</div>
          <div class="power-table-cell">Máxima (kW)</div>
          <div class="power-table-cell">Sugerida (kW)</div>
          <div class="power-table-cell">Utilización</div>
          <div class="power-table-cell">Estado</div>
        </div>`;

  const periods = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
  for (const period of periods) {
    const isActive = data[`${period}_Activo`] === 'SI';
    if (!isActive) continue;

    const contratada = data[`${period}_Contratada`] || 0;
    const maxima = data[`${period}_Maxima_Global`] || 0;
    const sugerida = data[`${period}_Sugerida`] || 0;
    const utilizacion = data[`${period}_Utilizacion_Pct`] || 0;
    const estado = data[`${period}_Estado`] || 'N/A';

    let estadoClass = 'optimal';
    let estadoIcon = '✅';
    if (estado === 'AUMENTAR') { estadoClass = 'increase'; estadoIcon = '🔺'; }
    else if (estado === 'REDUCIR') { estadoClass = 'decrease'; estadoIcon = '🔻'; }
    else if (estado === 'ELIMINAR') { estadoClass = 'eliminate'; estadoIcon = '❌'; }

    html += `
        <div class="power-table-row">
          <div class="power-table-cell period-cell">${period}</div>
          <div class="power-table-cell">${contratada.toFixed(2)}</div>
          <div class="power-table-cell">${maxima.toFixed(2)}</div>
          <div class="power-table-cell suggested-value">${sugerida.toFixed(2)}</div>
          <div class="power-table-cell">
            <div class="utilization-bar">
              <div class="utilization-fill" style="width: ${Math.min(utilizacion, 100)}%"></div>
            </div>
            <span class="utilization-text">${utilizacion.toFixed(1)}%</span>
          </div>
          <div class="power-table-cell">
            <span class="estado-badge ${estadoClass}">${estadoIcon} ${estado}</span>
          </div>
        </div>`;
  }

  html += `
      </div>
    </div>`;

  // Penalties Summary (if any)
  if ((data.Total_Penalizaciones_Anual || 0) > 0) {
    html += `
    <div class="penalties-summary">
      <div class="section-title">⚠️ Resumen de Penalizaciones</div>
      <div class="penalties-grid">`;

    for (const period of periods) {
      const penalizacion = data[`${period}_Penalizacion_Anual`] || 0;
      const meses = data[`${period}_Meses_Con_Penalizacion`] || 0;
      if (penalizacion > 0) {
        html += `
        <div class="penalty-card">
          <div class="penalty-period">${period}</div>
          <div class="penalty-amount">${penalizacion.toFixed(2)} €</div>
          <div class="penalty-months">${meses} meses afectados</div>
        </div>`;
      }
    }

    html += `
      </div>
    </div>`;
  }

  // Price Info Footer
  const preciosUtilizados = response.precios_utilizados || {};
  html += `
    <div class="prices-info-footer">
      <div class="prices-info-title">💰 Precios Término Potencia Utilizados (€/kW·día)</div>
      <div class="prices-info-grid">
        ${Object.entries(preciosUtilizados).map(([period, price]) =>
          `<div class="price-info-item"><span>${period}:</span><span>${price.toFixed(9)}</span></div>`
        ).join('')}
      </div>
      <div class="prices-info-source">
        ${response.is_manual_input ? '📝 Precios ingresados manualmente' : '📄 Precios extraídos de la factura'}
      </div>
    </div>`;

  results.innerHTML = html;
  results.style.display = 'block';
}

function resetAnalysis() {
  // Show upload section again
  document.getElementById('power-analysis-section').style.display = 'block';

  // Clear results
  results.innerHTML = '';
  results.style.display = 'none';

  // Reset form
  cupsInput.value = '';
  cupsInput.classList.remove('valid', 'invalid');
  removeSelectedFile();
  resetPricesToDefault();

  // Reset to manual mode
  hasBillNo.checked = true;
  toggleInputMode();

  hideError();
}

function copyCups(cups) {
  navigator.clipboard.writeText(cups).then(() => {
    const copyBtn = document.querySelector('.cups-display-copy');
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = '✓ Copiado';
    setTimeout(() => {
      copyBtn.innerHTML = originalText;
    }, 2000);
  });
}

// ============================================
// UI HELPERS
// ============================================

function showLoading() {
  loading.classList.add('active');
  analyzeButton.disabled = true;
}

function hideLoading() {
  loading.classList.remove('active');
  // Re-enable based on current mode
  if (hasBillYes.checked) {
    analyzeButton.disabled = !selectedFile;
  } else {
    validateCups();
  }
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.add('active');
}

function hideError() {
  errorMessage.textContent = '';
  errorMessage.classList.remove('active');
}

// ============================================
// USER INFO
// ============================================

async function loadUserInfo() {
  try {
    const response = await fetch('/web/session/get_session_info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const data = await response.json();

    if (data.result && data.result.uid) {
      currentUser = {
        user_id: data.result.uid,
        name: data.result.name || 'Usuario',
        email: data.result.username || '',
        login: data.result.username || ''
      };

      const userInfoText = document.getElementById('userInfoText');
      if (userInfoText) {
        userInfoText.textContent = currentUser.name;
      }
    }
  } catch (error) {
    console.warn('Could not load user info:', error);
  }
}

// ============================================
// INITIALIZE ON LOAD
// ============================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPowerAnalysis);
} else {
  initPowerAnalysis();
}
