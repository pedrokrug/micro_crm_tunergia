// This file contains all the logic for contract renewal and document upload
// Add this code to the Interface Tunergia.html file in the script section

// Global state for uploaded documents
let uploadedDocuments = [];
let isRenewalMode = false;
let originalComercializadora = '';

// Modified handleFileUpload to convert to base64
function handleFileUpload(files) {
    const filesList = document.getElementById('uploadedFilesList');

    Array.from(files).forEach(file => {
        const reader = new FileReader();

        reader.onload = function(e) {
            const ext = file.name.split('.').pop().toUpperCase();
            const size = (file.size / 1024).toFixed(1) + ' KB';
            const base64Data = e.target.result.split(',')[1]; // Remove data:...;base64, prefix

            // Store document data
            uploadedDocuments.push({
                filename: file.name,
                data: base64Data,
                mimeType: file.type,
                size: file.size
            });

            // Create visual element
            const fileItem = document.createElement('div');
            fileItem.className = 'document-item';
            fileItem.innerHTML = `
                <div class="document-icon ${['JPG', 'JPEG', 'PNG', 'GIF'].includes(ext) ? 'jpg' : ''}">${ext}</div>
                <div class="document-info">
                    <div class="document-name">${file.name}</div>
                    <div class="document-size">${size}</div>
                </div>
                <button type="button" onclick="removeDocument('${file.name}')" style="background: none; border: none; cursor: pointer; font-size: 18px; color: #e53e3e;">×</button>
            `;
            filesList.appendChild(fileItem);
        };

        reader.readAsDataURL(file);
    });
}

// Remove document from array
function removeDocument(filename) {
    uploadedDocuments = uploadedDocuments.filter(doc => doc.filename !== filename);
    // Update UI
    const filesList = document.getElementById('uploadedFilesList');
    const items = filesList.querySelectorAll('.document-item');
    items.forEach(item => {
        if (item.querySelector('.document-name').textContent === filename) {
            item.remove();
        }
    });
}

// Function to match comercializadora names (handles variations)
function matchComercializadora(name1, name2) {
    if (!name1 || !name2) return false;

    // Normalize names: remove underscores, _GAIAG suffix, convert to lowercase, remove extra spaces
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

    // Check if they match or if one contains the other
    return norm1 === norm2 || norm1.includes(norm2) || norm2.includes(norm1);
}

// RENOVAR contract function
async function renovarContract(contractId) {
    try {
        // Get contract data from NODO
        const response = await fetch(CONFIG.nodoWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: contractId })
        });

        if (!response.ok) {
            throw new Error('Error al cargar datos del contrato');
        }

        const contractData = await response.json();

        // Close contract detail modal
        closeContractDetail();

        // Open create contract modal
        const modal = document.getElementById('createContractModal');
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Set renewal mode
        isRenewalMode = true;
        originalComercializadora = contractData.comercializadora || contractData.tipo;

        // Update modal title
        const modalBadge = document.querySelector('#createContractModal .contract-id-badge');
        modalBadge.innerHTML = '<span>🔄</span> RENOVAR Contrato';
        modalBadge.style.background = '#f6ad55';

        // Load comercializadoras first
        await loadComercializadoras();

        // Pre-fill form with contract data
        const form = document.getElementById('createContractForm');

        // Personal data
        form.nombre_cliente.value = contractData.cliente || contractData.nombre_cliente || '';
        form.nif.value = contractData.nif || '';
        form.email.value = contractData.email || '';
        form.movil.value = contractData.movil || contractData.telefono || '';
        form.iban_contrato.value = contractData.iban || contractData.iban_contrato || '';
        form.direccion.value = contractData.direccion || contractData.direccion_fiscal || '';
        form.cp.value = contractData.cp || contractData.cp_fiscal || '';
        form.poblacion.value = contractData.poblacion || contractData.poblacion_fiscal || '';
        form.provincia.value = contractData.provincia || contractData.provincia_fiscal || '';

        // Supply data
        form.cups.value = contractData.cups || '';
        form.direccion_suministro.value = contractData.direccion_suministro || contractData.direccion || '';
        form.poblacion_suministro.value = contractData.poblacion_suministro || contractData.poblacion || '';
        form.provincia_suministro.value = contractData.provincia_suministro || contractData.provincia || '';
        form.cp_suministro.value = contractData.cp_suministro || contractData.cp || '';
        form.comercializadora_saliente.value = originalComercializadora;

        // Try to match and select the same comercializadora
        const comercializadoraSelect = document.getElementById('createComercializadora');
        let matched = false;

        for (let option of comercializadoraSelect.options) {
            if (matchComercializadora(option.value, originalComercializadora)) {
                comercializadoraSelect.value = option.value;
                matched = true;
                break;
            }
        }

        // Set tarifa
        const tarifaValue = contractData.tarifa_acceso || extractTarifaAcceso(contractData.concepto);
        if (tarifaValue) {
            document.getElementById('createTarifaAcceso').value = tarifaValue;
        }

        // Load products if comercializadora and tarifa are set
        if (matched && tarifaValue) {
            await loadProducts();
        }

        // Contract data
        form.cnae_actividad.value = contractData.cnae || contractData.cnae_actividad || '';

        // Consumption data
        form.consumo.value = contractData.consumo || contractData.consumo_anual_kwh || '';
        form.potencia_contratada_1.value = contractData.potencia_p1 || '';
        form.potencia_contratada_2.value = contractData.potencia_p2 || '';
        form.potencia_contratada_3.value = contractData.potencia_p3 || '';
        form.potencia_contratada_4.value = contractData.potencia_p4 || '';
        form.potencia_contratada_5.value = contractData.potencia_p5 || '';
        form.potencia_contratada_6.value = contractData.potencia_p6 || '';
        form.consumo_1.value = contractData.consumo_p1 || '';
        form.consumo_2.value = contractData.consumo_p2 || '';
        form.consumo_3.value = contractData.consumo_p3 || '';
        form.consumo_4.value = contractData.consumo_p4 || '';
        form.consumo_5.value = contractData.consumo_p5 || '';
        form.consumo_6.value = contractData.consumo_p6 || '';

        // Set tipo_contratacion to RENOVACION initially
        document.getElementById('createTipoContratacion').value = 'RENOVACION';

        // Add event listener to comercializadora to update tipo_contratacion
        comercializadoraSelect.addEventListener('change', function() {
            const newComercializadora = this.value;
            const tipoSelect = document.getElementById('createTipoContratacion');

            if (matchComercializadora(newComercializadora, originalComercializadora)) {
                tipoSelect.value = 'RENOVACION';
            } else {
                tipoSelect.value = 'CAMBIO';
            }
        });

    } catch (error) {
        console.error('Error renovating contract:', error);
        alert('❌ Error al cargar datos para renovación:\n\n' + error.message);
    }
}

// Helper function to extract tarifa from concepto
function extractTarifaAcceso(concepto) {
    if (!concepto) return '';
    const tarifas = ['2.0TD', '3.0TD', '6.1TD', 'RL.1', 'RL.2', 'RL.3'];
    for (let tarifa of tarifas) {
        if (concepto.includes(tarifa)) {
            return tarifa;
        }
    }
    return '';
}
