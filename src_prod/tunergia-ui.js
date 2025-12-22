/**
 * Tunergia CRM - UI Module
 * User Interface, Event Handlers, and Main Initialization
 * Version: 2.0.0 (Production)
 */

(function() {
    'use strict';

    const T = window.Tunergia;
    const CONFIG = T.CONFIG;
    const state = T.state;
    const utils = T.utils;

    // ============================================
    // INITIALIZATION
    // ============================================

    async function init() {
        console.log('Initializing Tunergia Interface...');
        utils.showLoading(true);

        try {
            await T.api.loadUserInfo();
            await T.api.loadDashboardData();
            setupEventListeners();
            console.log('Tunergia Interface initialized successfully');
        } catch (error) {
            console.error('Initialization error:', error);
            utils.showError('Error al cargar el dashboard: ' + error.message);
        } finally {
            utils.showLoading(false);
        }
    }

    // ============================================
    // USER UI
    // ============================================

    function updateUserUI() {
        if (state.currentUser) {
            document.getElementById('userName').textContent = state.currentUser.name || 'Usuario';
            document.getElementById('userEmail').textContent = state.currentUser.email || '';
            document.getElementById('welcomeName').textContent = (state.currentUser.name || 'Usuario').split(' ')[0];
            document.getElementById('userAvatar').textContent = utils.getInitials(state.currentUser.name || 'U');
        }

        if (state.idComercial) {
            document.getElementById('userIdBadge').textContent = 'ID: ' + state.idComercial;
        } else {
            document.getElementById('userIdBadge').textContent = 'ID: No asignado';
        }
    }

    // ============================================
    // CONTRACTS TABLE
    // ============================================

    function updateLoadMoreButton() {
        const loadedInfo = document.getElementById('loadedInfo');
        if (loadedInfo) {
            const loaded = state.contracts.length;
            const total = state.totalContracts || loaded;
            loadedInfo.textContent = `Mostrando ${utils.formatNumber(loaded)} de ${utils.formatNumber(total)}`;
        }
    }

    async function changeContractsLimit(newLimit) {
        state.contractsLimit = newLimit;
        utils.showLoading(true);
        await T.api.loadContracts();
        utils.showLoading(false);
    }

    function renderContracts() {
        const tbody = document.getElementById('contractsTableBody');
        const contracts = state.filteredContracts;
        const start = (state.currentPage - 1) * CONFIG.itemsPerPage;
        const end = start + CONFIG.itemsPerPage;
        const pageContracts = contracts.slice(start, end);

        if (contracts.length === 0) {
            utils.showEmptyState(true);
            return;
        }

        utils.showEmptyState(false);

        tbody.innerHTML = pageContracts.map(contract => {
            const statusClass = utils.getStatusClass(contract.estado);
            const consumo = parseFloat(contract.consumo) || 0;

            return `
                <tr data-id="${contract.id}">
                    <td class="checkbox-cell">
                        <input type="checkbox" class="row-checkbox" data-id="${contract.id}">
                    </td>
                    <td class="id-cell">${contract.id || '-'}</td>
                    <td class="name-cell">
                        <div class="client-info">
                            <div class="client-name">${utils.escapeHtml(contract.cliente) || '-'}</div>
                            <div class="client-email">${utils.escapeHtml(contract.poblacion) || ''}</div>
                        </div>
                    </td>
                    <td class="status-cell">
                        <span class="status-badge ${statusClass}">${utils.escapeHtml(contract.estado) || '-'}</span>
                    </td>
                    <td class="comercializadora-cell" title="${utils.escapeHtml(contract.tipo) || ''}">${utils.escapeHtml(contract.tipo) || '-'}</td>
                    <td class="tarifa-cell">
                        ${contract.tarifa_acceso ? `<span class="tarifa-badge">${utils.escapeHtml(contract.tarifa_acceso)}</span>` : '-'}
                    </td>
                    <td class="consumo-cell">${utils.formatNumber(consumo)} kWh</td>
                    <td class="cups-cell">
                        <span class="cups-code">${utils.escapeHtml(contract.cups) || '-'}</span>
                    </td>
                    <td class="fecha-cell">${utils.formatDate(contract.fecha)}</td>
                    <td class="action-cell">
                        <button class="view-btn" onclick="Tunergia.ui.openContractDetail('${contract.id}')" title="Ver detalle">
                            👁️
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Add checkbox listeners
        tbody.querySelectorAll('.row-checkbox').forEach(cb => {
            cb.addEventListener('change', updateSelectionInfo);
        });

        updatePagination();
    }

    function applyFilters() {
        let filtered = [...state.contracts];

        // Apply status filter
        if (state.currentFilter !== 'all') {
            if (state.currentFilter === 'oportunidad') {
                filtered = filtered.filter(c => {
                    const estado = (c.estado || '').toUpperCase();
                    if (estado === 'NO RENOVADO' || estado === 'INTERESADO' || estado.includes('OPORTUNIDAD')) {
                        return true;
                    }

                    if (!estado.includes('ACTIVADO')) {
                        return false;
                    }

                    const fechaActivacion = c.fecha_activacion;
                    if (!fechaActivacion || fechaActivacion === '' || fechaActivacion.startsWith('0000')) {
                        return false;
                    }

                    const activacionDate = utils.parseDate(fechaActivacion);
                    if (!activacionDate) return false;

                    const now = new Date();
                    const nineMonthsAgo = new Date(now);
                    nineMonthsAgo.setMonth(now.getMonth() - 9);
                    const twelveMonthsAgo = new Date(now);
                    twelveMonthsAgo.setMonth(now.getMonth() - 12);

                    return activacionDate >= twelveMonthsAgo && activacionDate <= nineMonthsAgo;
                });
            } else if (state.currentFilter === 'tramitado') {
                filtered = filtered.filter(c => {
                    const estado = (c.estado || '').toUpperCase();
                    return estado.includes('TEMPORAL') ||
                           estado.includes('PDTE') ||
                           estado.includes('PENDIENTE') ||
                           estado.includes('INCIDENCIA') ||
                           estado.includes('TRAMITADO') ||
                           estado.includes('VALIDADO') ||
                           estado.includes('FIRMA') ||
                           estado.includes('LISTO');
                });
            } else {
                filtered = filtered.filter(c => {
                    const estado = (c.estado || '').toUpperCase();
                    return estado.includes(state.currentFilter.toUpperCase());
                });
            }
        }

        // Apply search filter
        if (state.searchTerm) {
            const term = state.searchTerm.toLowerCase();
            filtered = filtered.filter(c =>
                (c.id && c.id.toLowerCase().includes(term)) ||
                (c.cliente && c.cliente.toLowerCase().includes(term)) ||
                (c.cups && c.cups.toLowerCase().includes(term)) ||
                (c.tipo && c.tipo.toLowerCase().includes(term)) ||
                (c.poblacion && c.poblacion.toLowerCase().includes(term)) ||
                (c.provincia && c.provincia.toLowerCase().includes(term))
            );
        }

        // Apply sorting
        filtered.sort((a, b) => {
            let valA = a[state.sortColumn] || '';
            let valB = b[state.sortColumn] || '';

            if (state.sortColumn === 'fecha' || state.sortColumn === 'fecha_activacion' || state.sortColumn === 'fecha_cancelacion') {
                valA = new Date(valA).getTime() || 0;
                valB = new Date(valB).getTime() || 0;
            } else if (state.sortColumn === 'consumo') {
                valA = parseFloat(valA) || 0;
                valB = parseFloat(valB) || 0;
            } else {
                valA = String(valA).toLowerCase();
                valB = String(valB).toLowerCase();
            }

            if (valA < valB) return state.sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return state.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        state.filteredContracts = filtered;
        state.currentPage = 1;

        // Update filtered count badge
        const filteredCount = document.getElementById('filteredCount');
        if (state.currentFilter !== 'all' || state.searchTerm) {
            filteredCount.style.display = 'inline';
            filteredCount.textContent = `${utils.formatNumber(filtered.length)} filtrados`;
        } else {
            filteredCount.style.display = 'none';
        }

        renderContracts();
    }

    function updatePagination() {
        const total = state.filteredContracts.length;
        const totalPages = Math.ceil(total / CONFIG.itemsPerPage) || 1;
        const start = (state.currentPage - 1) * CONFIG.itemsPerPage + 1;
        const end = Math.min(state.currentPage * CONFIG.itemsPerPage, total);

        document.getElementById('paginationInfo').textContent = `Página ${state.currentPage} de ${totalPages}`;
        document.getElementById('prevPage').disabled = state.currentPage === 1;
        document.getElementById('nextPage').disabled = state.currentPage >= totalPages;

        const loadedInfo = document.getElementById('loadedInfo');
        if (total > 0) {
            loadedInfo.textContent = `Mostrando ${start}-${end} de ${utils.formatNumber(total)}`;
        } else {
            loadedInfo.textContent = 'Sin resultados';
        }
    }

    function updateSelectionInfo() {
        const checkboxes = document.querySelectorAll('.row-checkbox:checked');
        const selectionInfo = document.getElementById('selectionInfo');
        const selectedCount = document.getElementById('selectedCount');
        const exportBtn = document.getElementById('exportBtn');
        const selectAllContracts = document.getElementById('selectAllContracts');
        const selectAllCount = document.getElementById('selectAllCount');

        if (checkboxes.length > 0) {
            selectionInfo.style.display = 'flex';
            selectedCount.textContent = `${checkboxes.length} seleccionado${checkboxes.length > 1 ? 's' : ''}`;
            exportBtn.disabled = false;

            if (checkboxes.length === CONFIG.itemsPerPage && state.filteredContracts.length > CONFIG.itemsPerPage) {
                selectAllContracts.style.display = 'inline-flex';
                selectAllCount.textContent = state.filteredContracts.length;
            } else {
                selectAllContracts.style.display = 'none';
                state.selectAllMode = false;
            }
        } else {
            selectionInfo.style.display = 'none';
            exportBtn.disabled = true;
            state.selectAllMode = false;
        }
    }

    // ============================================
    // CONTRACT DETAIL MODAL
    // ============================================

    async function openContractDetail(contractId) {
        const modal = document.getElementById('contractDetailModal');
        const loading = document.getElementById('contractDetailLoading');
        const error = document.getElementById('contractDetailError');
        const content = document.getElementById('contractDetailContent');

        state.currentContractId = contractId;
        modal.classList.add('active');
        loading.classList.add('active');
        error.classList.remove('active');
        content.classList.remove('active');

        document.getElementById('modalContractId').textContent = 'ID: ' + contractId;

        try {
            const data = await T.api.getContractDetail(contractId);
            const contract = T.api.parseContractData(data);

            populateContractDetail(contract);
            loading.classList.remove('active');
            content.classList.add('active');

            // Show RENOVAR button for eligible contracts
            const renovarBtn = document.getElementById('renovarContractBtn');
            const estadoUpper = (contract.estado || '').toUpperCase();
            if (estadoUpper.includes('ACTIVADO') || estadoUpper.includes('NO RENOVADO') || estadoUpper.includes('INTERESADO')) {
                renovarBtn.style.display = 'inline-flex';
            } else {
                renovarBtn.style.display = 'none';
            }

        } catch (err) {
            console.error('Error loading contract detail:', err);
            loading.classList.remove('active');
            error.classList.add('active');
            document.getElementById('contractDetailErrorText').textContent = err.message || 'Error al cargar los datos del contrato';
        }
    }

    function populateContractDetail(contract) {
        // Personal data
        utils.setText('detailNombre', contract.nombre_cliente || contract.persona_contacto);
        utils.setText('detailTipoCliente', contract.tipo_empresa);
        document.getElementById('detailCorreo').textContent = contract.email || '-';
        document.getElementById('detailMovil').textContent = contract.movil || contract.telefono || '-';
        document.getElementById('detailDNI').textContent = contract.nif || '-';
        document.getElementById('detailIBAN').textContent = contract.iban_contrato || '-';
        document.getElementById('detailDireccion').textContent = contract.direccion || '-';
        document.getElementById('detailCP').textContent = contract.cp || '-';
        document.getElementById('detailPoblacion').textContent = contract.poblacion || '-';
        document.getElementById('detailProvincia').textContent = contract.provincia || '-';

        // Supply data
        utils.setText('detailNombreSuministro', contract.persona_contacto || contract.nombre_cliente);
        document.getElementById('detailDNISuministro').textContent = contract.persona_contacto_nif || contract.nif || '-';
        document.getElementById('detailDireccionSuministro').textContent = contract.direccion_suministro || '-';
        document.getElementById('detailPoblacionSuministro').textContent = contract.poblacion_suministro || '-';
        document.getElementById('detailCPSuministro').textContent = contract.cp_suministro || '-';
        document.getElementById('detailProvinciaSuministro').textContent = contract.provincia_suministro || '-';
        document.getElementById('detailComercializadoraSaliente').textContent = contract.comercializadora_saliente || '-';
        document.getElementById('detailCUPS').textContent = contract.cups || '-';

        // Contract data
        document.getElementById('detailComercializadora').textContent = contract.comercializadora || '-';
        document.getElementById('detailConcepto').textContent = contract.concepto || '-';
        utils.setText('detailTarifa', contract.tarifa);
        utils.setText('detailTarifaAcceso', contract.tarifa_acceso);
        utils.setText('detailTipoContratacion', contract.tipo_contratacion);
        document.getElementById('detailCNAE').textContent = contract.cnae_actividad || '-';
        utils.setText('detailFirmaDigital', contract.firma_digital === '1' || contract.firma_digital === 1 ? 'Sí' : 'No');
        utils.setText('detailFacturaElectronica', contract.fact_electronica || 'No');
        utils.setText('detailCambioComercializadora', contract.cambio_comercializadora);
        utils.setText('detailAutoconsumo', contract.luz_autoconsumo || 'No');
        utils.setText('detailFuturaActivacion', contract.futura_activacion);
        document.getElementById('detailFechaActivacion').textContent = utils.formatDate(contract.fecha_activacion);
        document.getElementById('detailFechaCancelacion').textContent = utils.formatDate(contract.fecha_cancelacion);
        document.getElementById('detailComercial').textContent = contract.comercial || '-';
        document.getElementById('detailKAM').textContent = contract.kam || '-';

        // Power and consumption table
        utils.setText('detailPotP1', utils.formatDecimal(contract.potencia_contratada_1));
        utils.setText('detailPotP2', utils.formatDecimal(contract.potencia_contratada_2));
        utils.setText('detailPotP3', utils.formatDecimal(contract.potencia_contratada_3));
        utils.setText('detailPotP4', utils.formatDecimal(contract.potencia_contratada_4));
        utils.setText('detailPotP5', utils.formatDecimal(contract.potencia_contratada_5));
        utils.setText('detailPotP6', utils.formatDecimal(contract.potencia_contratada_6));

        utils.setText('detailConsP1', utils.formatDecimal(contract.consumo_1));
        utils.setText('detailConsP2', utils.formatDecimal(contract.consumo_2));
        utils.setText('detailConsP3', utils.formatDecimal(contract.consumo_3));
        utils.setText('detailConsP4', utils.formatDecimal(contract.consumo_4));
        utils.setText('detailConsP5', utils.formatDecimal(contract.consumo_5));
        utils.setText('detailConsP6', utils.formatDecimal(contract.consumo_6));

        const consumoTotal = parseFloat(contract.consumo) ||
            (parseFloat(contract.consumo_1 || 0) + parseFloat(contract.consumo_2 || 0) +
             parseFloat(contract.consumo_3 || 0) + parseFloat(contract.consumo_4 || 0) +
             parseFloat(contract.consumo_5 || 0) + parseFloat(contract.consumo_6 || 0));
        utils.setText('detailConsumoTotal', utils.formatNumber(consumoTotal) + ' kWh');

        // Documents
        const docsContainer = document.getElementById('detailDocumentos');
        const documentos = contract.documentacion || [];

        if (documentos.length > 0) {
            docsContainer.innerHTML = documentos.map((doc, index) => {
                const name = doc.nombre_original || doc.nombre || doc.filename || doc.name || 'Documento';
                const url = doc.url_descarga || '';
                const fecha = doc.fecha || '';
                const tipo = doc.tipo || '';
                const ext = name.split('.').pop().toUpperCase();
                const iconClass = ['JPG', 'JPEG', 'PNG', 'GIF'].includes(ext) ? 'jpg' : '';

                return `
                    <div class="document-item" data-url="${utils.escapeHtml(url)}" data-name="${utils.escapeHtml(name)}" onclick="window.tunergiaDownloadDoc('${utils.escapeHtml(url)}', '${utils.escapeHtml(name)}')">
                        <div class="document-icon ${iconClass}">${ext}</div>
                        <div class="document-info">
                            <div class="document-name">${utils.escapeHtml(name)}</div>
                            <div class="document-size">${fecha} ${tipo ? '• ' + tipo : ''}</div>
                        </div>
                        <span class="download-icon">⬇️</span>
                    </div>
                `;
            }).join('');
        } else {
            docsContainer.innerHTML = '<p class="no-docs">No hay documentos adjuntos</p>';
        }

        // Observations
        document.getElementById('detailObservaciones').textContent = contract.observaciones || 'Sin observaciones';

        // History tab
        renderHistory(contract);
    }

    function renderHistory(contract) {
        const timeline = document.getElementById('historyTimeline');
        const historialData = contract.historico || [];

        if (historialData.length === 0) {
            timeline.innerHTML = '<p class="no-history">No hay historial disponible para este contrato</p>';
            return;
        }

        timeline.innerHTML = historialData.map(item => `
            <div class="history-item">
                <div class="history-date">${utils.formatDate(item.fecha)}</div>
                <div class="history-action">${utils.escapeHtml(item.accion || item.action)}</div>
                <div class="history-detail">${utils.escapeHtml(item.texto || item.detalle || '')}</div>
                ${item.usuario ? `<div class="history-user">Por: ${utils.escapeHtml(item.usuario)}</div>` : ''}
            </div>
        `).join('');
    }

    function closeContractDetail() {
        document.getElementById('contractDetailModal').classList.remove('active');
        state.currentContractId = null;

        // Reset to first tab
        document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.detail-tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector('.detail-tab[data-tab="cliente"]').classList.add('active');
        document.getElementById('tabCliente').classList.add('active');
    }

    // ============================================
    // CREATE CONTRACT MODAL
    // ============================================

    function openCreateContractModal() {
        T.setRenewalMode(false);
        T.setOriginalComercializadora('');

        document.getElementById('createContractForm').reset();
        T.clearUploadedDocuments();
        document.getElementById('uploadedFilesList').innerHTML = '';

        document.getElementById('createProducto').disabled = true;
        document.getElementById('createProducto').innerHTML = '<option value="">Seleccionar comercializadora primero...</option>';

        T.api.loadComercializadoras();

        document.getElementById('createContractModal').classList.add('active');
    }

    function closeCreateContractModal() {
        document.getElementById('createContractModal').classList.remove('active');
        T.setRenewalMode(false);
    }

    // ============================================
    // RENOVAR CONTRACT
    // ============================================

    async function renovarContract() {
        const contractId = state.currentContractId;
        if (!contractId) return;

        const renovarBtn = document.getElementById('renovarContractBtn');
        const originalText = renovarBtn.innerHTML;
        renovarBtn.disabled = true;
        renovarBtn.innerHTML = '<span>⏳</span> Cargando...';

        try {
            const data = await T.api.getContractDetail(contractId);
            const contractData = T.api.parseContractData(data);

            closeContractDetail();

            T.setRenewalMode(true);
            T.setOriginalComercializadora(contractData.comercializadora || '');

            document.getElementById('createContractForm').reset();
            T.clearUploadedDocuments();
            document.getElementById('uploadedFilesList').innerHTML = '';

            await T.api.loadComercializadoras();

            // Pre-fill form with existing data
            const form = document.getElementById('createContractForm');

            form.nombre_cliente.value = contractData.nombre_cliente || contractData.persona_contacto || '';
            form.tipo_empresa.value = contractData.tipo_empresa || '';
            form.email.value = contractData.email || '';
            form.movil.value = contractData.movil || contractData.telefono || '';
            form.nif.value = contractData.nif || '';
            form.iban_contrato.value = contractData.iban_contrato || '';
            form.direccion.value = contractData.direccion || '';
            form.cp.value = contractData.cp || '';
            form.poblacion.value = contractData.poblacion || '';
            form.provincia.value = contractData.provincia || '';

            form.persona_contacto.value = contractData.persona_contacto || '';
            form.persona_contacto_nif.value = contractData.persona_contacto_nif || '';
            form.comercializadora_saliente.value = contractData.comercializadora || '';
            form.direccion_suministro.value = contractData.direccion_suministro || '';
            form.cp_suministro.value = contractData.cp_suministro || '';
            form.poblacion_suministro.value = contractData.poblacion_suministro || '';
            form.provincia_suministro.value = contractData.provincia_suministro || '';
            form.cups.value = contractData.cups || '';

            // Smart comercializadora matching
            const comercializadoraSelect = document.getElementById('createComercializadora');
            const originalCom = contractData.comercializadora || '';
            let matched = false;

            for (let option of comercializadoraSelect.options) {
                if (utils.matchComercializadora(option.value, originalCom)) {
                    comercializadoraSelect.value = option.value;
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                console.log('No exact match for comercializadora:', originalCom);
            }

            // Set tarifa and load products
            form.tarifa_acceso.value = contractData.tarifa_acceso || utils.extractTarifaAcceso(contractData.concepto) || '';

            if (comercializadoraSelect.value && form.tarifa_acceso.value) {
                await T.api.loadProducts();

                const productoSelect = document.getElementById('createProducto');
                const conceptoOriginal = contractData.concepto || '';

                for (let option of productoSelect.options) {
                    if (option.value === conceptoOriginal || option.value.includes(conceptoOriginal) || conceptoOriginal.includes(option.value)) {
                        productoSelect.value = option.value;
                        break;
                    }
                }
            }

            form.cnae_actividad.value = contractData.cnae_actividad || '';

            // Power and consumption
            form.potencia_contratada_1.value = contractData.potencia_contratada_1 || '';
            form.potencia_contratada_2.value = contractData.potencia_contratada_2 || '';
            form.potencia_contratada_3.value = contractData.potencia_contratada_3 || '';
            form.potencia_contratada_4.value = contractData.potencia_contratada_4 || '';
            form.potencia_contratada_5.value = contractData.potencia_contratada_5 || '';
            form.potencia_contratada_6.value = contractData.potencia_contratada_6 || '';

            form.consumo_1.value = contractData.consumo_1 || '';
            form.consumo_2.value = contractData.consumo_2 || '';
            form.consumo_3.value = contractData.consumo_3 || '';
            form.consumo_4.value = contractData.consumo_4 || '';
            form.consumo_5.value = contractData.consumo_5 || '';
            form.consumo_6.value = contractData.consumo_6 || '';
            form.consumo.value = contractData.consumo || '';

            // Set tipo_contratacion
            const tipoContratacionSelect = document.getElementById('createTipoContratacion');
            if (utils.matchComercializadora(comercializadoraSelect.value, originalCom)) {
                tipoContratacionSelect.value = 'RENOVACION';
            } else {
                tipoContratacionSelect.value = 'CAMBIO';
            }

            // Add listener to update tipo_contratacion when comercializadora changes
            const updateTipoContratacion = function() {
                const newComercializadora = comercializadoraSelect.value;
                if (utils.matchComercializadora(newComercializadora, T.getOriginalComercializadora())) {
                    tipoContratacionSelect.value = 'RENOVACION';
                } else {
                    tipoContratacionSelect.value = 'CAMBIO';
                }
            };

            comercializadoraSelect.removeEventListener('change', updateTipoContratacion);
            comercializadoraSelect.addEventListener('change', updateTipoContratacion);

            document.getElementById('createContractModal').classList.add('active');

        } catch (error) {
            console.error('Error loading contract for renewal:', error);
            alert('❌ Error al cargar los datos del contrato:\n\n' + error.message);
        } finally {
            renovarBtn.disabled = false;
            renovarBtn.innerHTML = originalText;
        }
    }

    // ============================================
    // FILE UPLOAD
    // ============================================

    function handleFileUpload(files) {
        const filesList = document.getElementById('uploadedFilesList');

        Array.from(files).forEach(file => {
            const reader = new FileReader();

            reader.onload = function(e) {
                const ext = file.name.split('.').pop().toUpperCase();
                const size = (file.size / 1024).toFixed(1) + ' KB';
                const base64Data = e.target.result.split(',')[1];

                const docId = Date.now() + '_' + file.name;
                T.addUploadedDocument({
                    id: docId,
                    filename: file.name,
                    data: base64Data,
                    mimeType: file.type,
                    size: file.size
                });

                const fileItem = document.createElement('div');
                fileItem.className = 'document-item';
                fileItem.dataset.docId = docId;
                fileItem.innerHTML = `
                    <div class="document-icon">${ext}</div>
                    <div class="document-info">
                        <div class="document-name">${utils.escapeHtml(file.name)}</div>
                        <div class="document-size">${size}</div>
                    </div>
                    <button type="button" class="remove-doc-btn" style="background: #e53e3e; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer;">✕</button>
                `;

                fileItem.querySelector('.remove-doc-btn').addEventListener('click', function(e) {
                    e.stopPropagation();
                    T.removeUploadedDocument(docId);
                    fileItem.remove();
                });

                filesList.appendChild(fileItem);
            };

            reader.readAsDataURL(file);
        });
    }

    // ============================================
    // EXPORT
    // ============================================

    function exportToCSV() {
        const selectedIds = new Set(
            Array.from(document.querySelectorAll('.row-checkbox:checked'))
                .map(cb => cb.dataset.id)
        );

        let contractsToExport;
        if (state.selectAllMode) {
            contractsToExport = state.filteredContracts;
        } else {
            contractsToExport = state.filteredContracts.filter(c => selectedIds.has(String(c.id)));
        }

        if (contractsToExport.length === 0) {
            alert('No hay contratos seleccionados para exportar');
            return;
        }

        const headers = ['ID', 'Cliente', 'Estado', 'Comercializadora', 'Tarifa', 'Consumo', 'CUPS', 'Fecha', 'Población', 'Provincia'];
        const rows = contractsToExport.map(c => [
            c.id,
            c.cliente,
            c.estado,
            c.tipo,
            c.tarifa_acceso,
            c.consumo,
            c.cups,
            c.fecha,
            c.poblacion,
            c.provincia
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `contratos_export_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    }

    // ============================================
    // DOCUMENT DOWNLOAD
    // ============================================

    window.tunergiaDownloadDoc = function(url, filename) {
        if (!url) {
            alert('URL de documento no disponible');
            return;
        }

        const downloadUrl = `${CONFIG.documentWebhookUrl}?query=${encodeURIComponent(url)}`;
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename || 'documento';
        link.target = '_blank';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // ============================================
    // EVENT LISTENERS
    // ============================================

    function setupEventListeners() {
        // Tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                state.currentFilter = this.dataset.filter;
                applyFilters();
            });
        });

        // Search input with debounce
        document.getElementById('searchInput').addEventListener('input', utils.debounce((e) => {
            state.searchTerm = e.target.value;
            applyFilters();
        }, 300));

        // Sort headers
        document.querySelectorAll('.contracts-table th.sortable').forEach(th => {
            th.addEventListener('click', function() {
                const column = this.dataset.sort;
                if (state.sortColumn === column) {
                    state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    state.sortColumn = column;
                    state.sortDirection = 'desc';
                }
                applyFilters();
            });
        });

        // Pagination
        document.getElementById('prevPage').addEventListener('click', function() {
            if (state.currentPage > 1) {
                state.currentPage--;
                renderContracts();
            }
        });

        document.getElementById('nextPage').addEventListener('click', function() {
            const totalPages = Math.ceil(state.filteredContracts.length / CONFIG.itemsPerPage);
            if (state.currentPage < totalPages) {
                state.currentPage++;
                renderContracts();
            }
        });

        // Select all checkbox
        document.getElementById('selectAll').addEventListener('change', function(e) {
            document.querySelectorAll('.row-checkbox').forEach(cb => {
                cb.checked = e.target.checked;
            });
            updateSelectionInfo();
        });

        // Select all contracts button
        document.getElementById('selectAllContracts').addEventListener('click', function() {
            state.selectAllMode = true;
            document.getElementById('selectedCount').textContent = `${state.filteredContracts.length} seleccionados (todos)`;
            this.style.display = 'none';
        });

        // Date filter buttons
        document.querySelectorAll('.filter-btn[data-days]').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.filter-btn[data-days]').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                state.dateFilter = parseInt(this.dataset.days);
                utils.showLoading(true);
                T.api.loadStats().then(() => utils.showLoading(false));
            });
        });

        // List date filter
        const applyDateBtn = document.getElementById('applyDateFilter');
        const clearDateBtn = document.getElementById('clearDateFilter');

        applyDateBtn.addEventListener('click', async function() {
            state.listDateFrom = document.getElementById('listDateFrom').value || null;
            state.listDateTo = document.getElementById('listDateTo').value || null;
            utils.showLoading(true);
            await T.api.loadContracts();
            utils.showLoading(false);
        });

        clearDateBtn.addEventListener('click', async function() {
            document.getElementById('listDateFrom').value = '';
            document.getElementById('listDateTo').value = '';
            state.listDateFrom = null;
            state.listDateTo = null;
            utils.showLoading(true);
            await T.api.loadContracts();
            utils.showLoading(false);
        });

        // Items per page
        const itemsPerPageSelect = document.getElementById('itemsPerPage');
        if (itemsPerPageSelect) {
            itemsPerPageSelect.addEventListener('change', function(e) {
                CONFIG.itemsPerPage = parseInt(e.target.value);
                state.currentPage = 1;
                renderContracts();
                updatePagination();
            });
        }

        // Export button
        document.getElementById('exportBtn').addEventListener('click', exportToCSV);

        // Create button
        document.getElementById('createBtn').addEventListener('click', openCreateContractModal);

        // Contract detail modal
        document.getElementById('backToListBtn').addEventListener('click', closeContractDetail);
        document.getElementById('contractDetailOverlay').addEventListener('click', closeContractDetail);
        document.getElementById('renovarContractBtn').addEventListener('click', renovarContract);

        // Create contract modal
        document.getElementById('backFromCreateBtn').addEventListener('click', closeCreateContractModal);
        document.getElementById('createContractOverlay').addEventListener('click', closeCreateContractModal);
        document.getElementById('cancelCreateBtn').addEventListener('click', closeCreateContractModal);

        // Detail tabs
        document.querySelectorAll('.detail-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.detail-tab-content').forEach(c => c.classList.remove('active'));
                this.classList.add('active');
                document.getElementById('tab' + this.dataset.tab.charAt(0).toUpperCase() + this.dataset.tab.slice(1)).classList.add('active');
            });
        });

        // Same as personal checkbox
        const sameAsPersonal = document.getElementById('sameAsPersonal');
        if (sameAsPersonal) {
            sameAsPersonal.addEventListener('change', function(e) {
                if (e.target.checked) {
                    const form = document.getElementById('createContractForm');
                    form.persona_contacto.value = form.nombre_cliente.value;
                    form.persona_contacto_nif.value = form.nif.value;
                    form.direccion_suministro.value = form.direccion.value;
                    form.cp_suministro.value = form.cp.value;
                    form.poblacion_suministro.value = form.poblacion.value;
                    form.provincia_suministro.value = form.provincia.value;
                }
            });
        }

        // SIPS extraction
        document.getElementById('extractSipsBtn').addEventListener('click', T.api.extractSipsData);

        // Product loading triggers
        document.getElementById('createTipoCliente').addEventListener('change', T.api.loadProducts);
        document.getElementById('createComercializadora').addEventListener('change', T.api.loadProducts);
        document.getElementById('createTarifaAcceso').addEventListener('change', T.api.loadProducts);

        // File upload
        const fileInput = document.getElementById('fileInput');
        const uploadArea = document.getElementById('uploadArea');

        fileInput.addEventListener('change', function(e) {
            handleFileUpload(e.target.files);
            e.target.value = '';
        });

        uploadArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', function() {
            this.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('dragover');
            handleFileUpload(e.dataTransfer.files);
        });

        // Form submission
        document.getElementById('createContractForm').addEventListener('submit', async function(e) {
            e.preventDefault();

            const submitBtn = document.getElementById('submitCreateBtn');
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>⏳</span> <span>Creando...</span>';

            try {
                const formData = new FormData(this);
                const result = await T.api.createContract(formData);

                alert('✅ Contrato creado correctamente' + (result.id ? `\n\nID: ${result.id}` : ''));
                closeCreateContractModal();

                utils.showLoading(true);
                await T.api.loadContracts();
                utils.showLoading(false);

            } catch (error) {
                console.error('Error creating contract:', error);
                alert(error.message || 'Error al crear el contrato');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
    }

    // ============================================
    // EXPORT TO GLOBAL NAMESPACE
    // ============================================

    T.ui = {
        init,
        updateUserUI,
        updateLoadMoreButton,
        changeContractsLimit,
        renderContracts,
        applyFilters,
        updatePagination,
        updateSelectionInfo,
        openContractDetail,
        closeContractDetail,
        openCreateContractModal,
        closeCreateContractModal,
        renovarContract,
        handleFileUpload,
        exportToCSV,
        setupEventListeners
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log('Tunergia UI v2.0.0 loaded');
})();
