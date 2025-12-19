/**
 * Tunergia UI Module
 * DOM manipulation and UI rendering functions
 */

window.TunergiaUI = {

    /**
     * Show/hide loading overlay
     */
    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.toggle('active', show);
        }
    },

    /**
     * Show error message
     */
    showError(message) {
        const banner = document.getElementById('errorBanner');
        if (banner) {
            document.getElementById('errorBannerText').textContent = message;
            banner.classList.add('active');
            setTimeout(() => banner.classList.remove('active'), 5000);
        } else {
            alert('Error: ' + message);
        }
    },

    /**
     * Update user UI elements
     */
    updateUserUI() {
        const user = window.getState('currentUser');
        if (!user) return;

        const updateEl = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        updateEl('userName', user.name);
        updateEl('userEmail', user.email);
        updateEl('welcomeName', user.name.split(' ')[0]);
        updateEl('userAvatar', window.TunergiaUtils.getInitials(user.name));
        updateEl('userIdBadge', `ID: ${window.getState('idComercial') || 'N/A'}`);
    },

    /**
     * Update dashboard statistics
     */
    async updateStatistics() {
        try {
            // Get date ranges based on filter
            const now = new Date();
            const currentStart = new Date();
            currentStart.setDate(now.getDate() - window.getState('dateFilter'));
            const currentStartStr = currentStart.toISOString().split('T')[0];
            const previousStart = new Date(currentStart);
            previousStart.setDate(previousStart.getDate() - window.getState('dateFilter'));
            const previousStartStr = previousStart.toISOString().split('T')[0];

            console.log('Date ranges:', { currentStartStr, previousStartStr });

            // Get stats data
            const query = `
                SELECT
                    estado,
                    fecha_activacion,
                    fecha_cancelacion,
                    consumo
                FROM ${window.TunergiaConfig.bigQueryTable}
                WHERE (borrado = 0 OR borrado IS NULL)
                    AND id_comercial = '${window.getState('idComercial')}'
            `;

            const data = await window.TunergiaAPI.executeQuery(query);
            console.log('Stats raw data count:', data.length);

            // Process data
            let tramitados = 0, kwhTramitados = 0;
            let activadosCurrent = 0, kwhActivadosCurrent = 0;
            let activadosPrevious = 0, kwhActivadosPrevious = 0;
            let bajasCurrent = 0, kwhBajasCurrent = 0;
            let bajasPrevious = 0, kwhBajasPrevious = 0;

            const tramitacionEstados = ['TEMPORAL', 'PDTE', 'PENDIENTE', 'INCIDENCIA', 'TRAMITADO', 'VALIDADO', 'FIRMA', 'LISTO'];

            data.forEach(row => {
                const estado = (row.estado || '').toUpperCase();
                const consumo = parseFloat(row.consumo) || 0;
                const fechaActivacion = row.fecha_activacion || '';
                const fechaCancelacion = row.fecha_cancelacion || '';

                const hasActivacion = fechaActivacion && fechaActivacion !== '' && !fechaActivacion.startsWith('0000');
                const hasCancelacion = fechaCancelacion && fechaCancelacion !== '' && !fechaCancelacion.startsWith('0000');

                // EN TRAMITACIÓN
                if (!hasActivacion && !hasCancelacion) {
                    const isTramitacion = tramitacionEstados.some(e => estado.includes(e));
                    if (isTramitacion) {
                        tramitados++;
                        kwhTramitados += consumo;
                    }
                }

                // ACTIVADOS
                if (hasActivacion && estado.includes('ACTIVADO')) {
                    let activacionDate = fechaActivacion;
                    if (fechaActivacion.includes('/')) {
                        const parts = fechaActivacion.split('/');
                        if (parts.length === 3) {
                            activacionDate = parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0');
                        }
                    }

                    if (activacionDate >= currentStartStr) {
                        activadosCurrent++;
                        kwhActivadosCurrent += consumo;
                    } else if (activacionDate >= previousStartStr && activacionDate < currentStartStr) {
                        activadosPrevious++;
                        kwhActivadosPrevious += consumo;
                    }
                }

                // BAJAS
                if (hasCancelacion) {
                    let cancelacionDate = fechaCancelacion;
                    if (fechaCancelacion.includes('/')) {
                        const parts = fechaCancelacion.split('/');
                        if (parts.length === 3) {
                            cancelacionDate = parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0');
                        }
                    }

                    if (cancelacionDate >= currentStartStr) {
                        bajasCurrent++;
                        kwhBajasCurrent += consumo;
                    } else if (cancelacionDate >= previousStartStr && cancelacionDate < currentStartStr) {
                        bajasPrevious++;
                        kwhBajasPrevious += consumo;
                    }
                }
            });

            // Calculate percentage changes
            const calcChange = (current, previous) => {
                if (previous === 0) return current > 0 ? 100 : 0;
                return ((current - previous) / previous * 100).toFixed(1);
            };

            const activadosChange = calcChange(activadosCurrent, activadosPrevious);
            const kwhActivadosChange = calcChange(kwhActivadosCurrent, kwhActivadosPrevious);
            const bajasChange = calcChange(bajasCurrent, bajasPrevious);
            const kwhBajasChange = calcChange(kwhBajasCurrent, kwhBajasPrevious);

            console.log('Stats calculated:', { tramitados, activadosCurrent, bajasCurrent });

            // Update UI - Numbers
            const setText = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.textContent = value;
            };

            setText('statTramitados', window.TunergiaUtils.formatNumber(tramitados));
            setText('statActivados', window.TunergiaUtils.formatNumber(activadosCurrent));
            setText('statBajas', window.TunergiaUtils.formatNumber(bajasCurrent));
            setText('statKwhTramitacion', window.TunergiaUtils.formatLargeNumber(kwhTramitados));
            setText('statKwhActivados', window.TunergiaUtils.formatLargeNumber(kwhActivadosCurrent));
            setText('statKwhBajas', window.TunergiaUtils.formatLargeNumber(kwhBajasCurrent));

            // Update comparison indicators
            const updateChangeIndicator = (id, change, invertPositivity = false) => {
                const el = document.getElementById(id);
                if (!el) return;
                const isPositive = invertPositivity ? parseFloat(change) <= 0 : parseFloat(change) >= 0;
                el.className = 'stat-change ' + (isPositive ? 'positive' : 'negative');
                el.innerHTML = `<span class="change-icon">${parseFloat(change) >= 0 ? '↑' : '↓'}</span><span>${Math.abs(change)}% vs período anterior</span>`;
            };

            updateChangeIndicator('changeActivados', activadosChange);
            updateChangeIndicator('changeKwhActivados', kwhActivadosChange);
            updateChangeIndicator('changeBajas', bajasChange, true);
            updateChangeIndicator('changeKwhBajas', kwhBajasChange, true);

        } catch (error) {
            console.error('Error loading stats:', error);
        }
    },

    /**
     * Update pagination display
     */
    updatePagination() {
        const totalPages = Math.ceil(window.getState('filteredContracts').length / window.TunergiaConfig.itemsPerPage);
        const currentPage = window.getState('currentPage');

        const paginationInfo = document.getElementById('paginationInfo');
        const prevPage = document.getElementById('prevPage');
        const nextPage = document.getElementById('nextPage');
        const loadedInfo = document.getElementById('loadedInfo');
        const pagination = document.getElementById('pagination');

        if (!paginationInfo || !prevPage || !nextPage || !loadedInfo) {
            console.error('⚠️ Pagination elements not found in DOM. Required IDs: paginationInfo, prevPage, nextPage, loadedInfo');
            return;
        }

        paginationInfo.textContent = `${currentPage} of ${totalPages || 1}`;
        prevPage.disabled = currentPage <= 1;
        nextPage.disabled = currentPage >= totalPages;

        const startIndex = (currentPage - 1) * window.TunergiaConfig.itemsPerPage;
        const endIndex = Math.min(startIndex + window.TunergiaConfig.itemsPerPage, window.getState('filteredContracts').length);
        loadedInfo.textContent = `Mostrando ${startIndex + 1}-${endIndex} de ${window.getState('filteredContracts').length}`;

        if (pagination) pagination.style.display = 'flex';

        console.log('✅ Pagination updated:', { currentPage, totalPages, showing: `${startIndex + 1}-${endIndex}` });
    },

    /**
     * Update total contracts count display
     */
    updateContractCount() {
        const countEl = document.getElementById('totalContracts');
        if (!countEl) {
            console.warn('⚠️ Total contracts element not found (ID: totalContracts)');
            return;
        }

        const filteredCount = window.getState('filteredContracts').length;
        countEl.textContent = `${window.TunergiaUtils.formatNumber(filteredCount)} Contratos`;

        console.log('✅ Contract count updated:', filteredCount);
    },

    /**
     * Show/hide empty state
     */
    showEmptyState(show) {
        const emptyState = document.getElementById('emptyState');
        const table = document.querySelector('.contracts-table');
        const pagination = document.getElementById('pagination');

        if (!emptyState) {
            console.error('⚠️ Empty state element not found. Required ID: emptyState');
        }

        if (emptyState) emptyState.style.display = show ? 'block' : 'none';
        if (table) table.style.display = show ? 'none' : 'table';
        if (pagination) pagination.style.display = show ? 'none' : 'flex';

        console.log('✅ Empty state:', show ? 'shown' : 'hidden');
    },

    /**
     * Update selection info
     */
    updateSelectionInfo() {
        const checkboxes = document.querySelectorAll('.row-checkbox:checked');
        const selectedCount = checkboxes.length;
        const selectionInfo = document.getElementById('selectionInfo');
        const selectedCountSpan = document.getElementById('selectedCount');
        const selectAllBtn = document.getElementById('selectAllContracts');
        const selectAllCount = document.getElementById('selectAllCount');
        const exportBtn = document.getElementById('exportBtn');
        const selectAllCheckbox = document.getElementById('selectAll');

        if (!selectionInfo || !exportBtn) {
            console.error('⚠️ Selection elements not found. Required IDs: selectionInfo, exportBtn');
            return;
        }

        const selectAllMode = window.getState('selectAllMode');

        if (selectedCount > 0) {
            if (selectionInfo) selectionInfo.style.display = 'flex';

            // Gmail-style select all logic
            const visibleCount = document.querySelectorAll('.row-checkbox').length;
            const totalCount = window.getState('filteredContracts').length;

            if (selectAllMode) {
                // User selected all contracts
                if (selectedCountSpan) selectedCountSpan.textContent = `${totalCount} seleccionados (todos)`;
                if (selectAllBtn) selectAllBtn.style.display = 'none';
            } else if (selectedCount === visibleCount && totalCount > visibleCount) {
                // User selected all visible, show button to select ALL
                if (selectedCountSpan) selectedCountSpan.textContent = `${selectedCount} seleccionado${selectedCount > 1 ? 's' : ''}`;
                if (selectAllBtn) {
                    selectAllBtn.style.display = 'inline-block';
                    if (selectAllCount) selectAllCount.textContent = totalCount;
                }
            } else {
                // Normal selection
                if (selectedCountSpan) selectedCountSpan.textContent = `${selectedCount} seleccionado${selectedCount > 1 ? 's' : ''}`;
                if (selectAllBtn) selectAllBtn.style.display = 'none';
            }

            if (exportBtn) {
                exportBtn.disabled = false;
                exportBtn.title = 'Exportar contratos seleccionados';
            }
        } else {
            if (selectionInfo) selectionInfo.style.display = 'none';
            if (exportBtn) {
                exportBtn.disabled = true;
                exportBtn.title = 'Selecciona contratos para exportar';
            }
            window.setState({ selectAllMode: false });
        }

        const allCheckboxes = document.querySelectorAll('.row-checkbox');
        if (selectAllCheckbox && allCheckboxes.length > 0) {
            selectAllCheckbox.checked = selectedCount === allCheckboxes.length;
            selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < allCheckboxes.length;
        }

        console.log('✅ Selection updated:', { selectedCount, total: allCheckboxes.length, selectAllMode });
    },

    /**
     * Render contracts table
     */
    renderContractsTable() {
        console.log('🎨 renderContractsTable called');

        const tbody = document.getElementById('contractsTableBody');
        const allContracts = window.getState('filteredContracts');

        if (!tbody) {
            console.error('⚠️ Table body not found. Required ID: contractsTableBody');
            return;
        }

        console.log('📊 Contracts to render:', allContracts?.length || 0);

        if (!allContracts || allContracts.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="empty-state">
                        <div class="empty-icon">📋</div>
                        <h3>No hay contratos</h3>
                        <p>No se encontraron contratos con los filtros aplicados</p>
                    </td>
                </tr>
            `;
            this.showEmptyState(true);
            return;
        }

        this.showEmptyState(false);

        // Pagination logic
        const currentPage = window.getState('currentPage');
        const itemsPerPage = window.TunergiaConfig.itemsPerPage;
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const contracts = allContracts.slice(startIndex, endIndex);

        console.log('📄 Rendering page:', { currentPage, itemsPerPage, showing: contracts.length, total: allContracts.length });

        const escapeHtml = window.TunergiaUtils.escapeHtml;
        const getStatusClass = window.TunergiaUtils.getStatusClass;
        const formatNumber = window.TunergiaUtils.formatNumber;
        const formatDate = window.TunergiaUtils.formatDate;

        tbody.innerHTML = contracts.map(contract => `
            <tr data-id="${contract.id || ''}">
                <td class="checkbox-cell">
                    <input type="checkbox" class="row-checkbox" data-id="${contract.id || ''}">
                </td>
                <td class="id-cell">${contract.id || '-'}</td>
                <td class="name-cell">
                    <div class="client-info">
                        <div class="client-name">${escapeHtml(contract.cliente || 'Sin nombre')}</div>
                        <div class="client-email">${escapeHtml(contract.poblacion || '')}</div>
                    </div>
                </td>
                <td class="status-cell">
                    <span class="status-badge ${getStatusClass(contract.estado)}">
                        ${escapeHtml((contract.estado || 'Sin estado').substring(0, 12))}${(contract.estado || '').length > 12 ? '...' : ''}
                    </span>
                </td>
                <td class="comercializadora-cell" title="${escapeHtml(contract.tipo || '')}">${escapeHtml((contract.tipo || '-').substring(0, 10))}${(contract.tipo || '').length > 10 ? '...' : ''}</td>
                <td class="tarifa-cell"><span class="tarifa-badge">${escapeHtml(contract.tarifa_acceso || '-')}</span></td>
                <td class="consumo-cell">${contract.consumo ? formatNumber(parseFloat(contract.consumo)) : '-'}</td>
                <td class="cups-cell"><span class="cups-code">${escapeHtml((contract.cups || '-').substring(0, 15))}...</span></td>
                <td class="fecha-cell">${formatDate(contract.fecha)}</td>
                <td class="action-cell">
                    <button class="view-btn" title="Ver detalles" data-id="${contract.id}">👁️</button>
                </td>
            </tr>
        `).join('');

        // Add click handlers for view buttons
        tbody.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                this.openContractDetail(id);
            });
        });

        // Add click handler for entire row
        tbody.querySelectorAll('tr[data-id]').forEach(row => {
            row.style.cursor = 'pointer';
            row.addEventListener('click', (e) => {
                // Don't trigger if clicking checkbox or button
                if (e.target.type === 'checkbox' || e.target.closest('.view-btn')) return;
                const id = row.dataset.id;
                if (id) this.openContractDetail(id);
            });
        });

        // Add checkbox change handlers
        const checkboxes = tbody.querySelectorAll('.row-checkbox');
        console.log('✅ Adding checkbox listeners to', checkboxes.length, 'rows');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateSelectionInfo());
        });

        // Update pagination display
        this.updatePagination();

        // Update total contracts count display
        this.updateContractCount();

        console.log('✅ Table render complete');
    },

    /**
     * Open contract detail modal
     */
    async openContractDetail(contractId) {
        const modal = document.getElementById('contractDetailModal');
        if (!modal) return;

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        window.setState({ currentContractId: contractId });

        // Reset tabs to first tab (Datos del Cliente) by default
        document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.detail-tab-content').forEach(c => c.classList.remove('active'));
        const firstTab = document.querySelector('.detail-tab[data-tab="cliente"]');
        const firstContent = document.getElementById('tabCliente');
        if (firstTab) firstTab.classList.add('active');
        if (firstContent) firstContent.classList.add('active');

        const loading = document.getElementById('contractDetailLoading');
        const content = document.getElementById('contractDetailContent');
        const error = document.getElementById('contractDetailError');

        if (loading) loading.classList.add('active');
        if (content) content.classList.remove('active');
        if (error) error.classList.remove('active');

        try {
            const data = await window.TunergiaAPI.getContractDetail(contractId);
            this.renderContractDetail(data);

            if (loading) loading.classList.remove('active');
            if (content) content.classList.add('active');

            // Show RENOVAR button
            const renovarBtn = document.getElementById('renovarContractBtn');
            if (renovarBtn) renovarBtn.style.display = 'inline-flex';

        } catch (err) {
            console.error('Error loading contract details:', err);
            if (loading) loading.classList.remove('active');
            if (error) {
                error.classList.add('active');
                const errorText = document.getElementById('contractDetailErrorText');
                if (errorText) errorText.textContent = err.message;
            }
        }
    },

    /**
     * Render contract detail
     */
    renderContractDetail(data) {
        // Parse contract data structure
        let contract = {};
        if (Array.isArray(data) && data.length > 0 && data[0].datos) {
            contract = data[0].datos;
        } else if (data.datos) {
            contract = data.datos;
        } else {
            contract = data;
        }

        // Helper to set text content
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value || '-';
        };

        // Helper to format decimal values
        const formatDecimal = (value) => {
            if (value === null || value === undefined || value === '') return '0.00';
            const num = parseFloat(value);
            return isNaN(num) ? '0.00' : num.toFixed(2);
        };

        // Populate Datos Personales
        setText('detailNombre', contract.nombre_cliente || contract.persona_contacto || '-');
        setText('detailTipoCliente', contract.tipo_empresa || 'Particular');
        setText('detailCorreo', contract.email || '-');
        setText('detailMovil', contract.movil || contract.telefono || '-');
        setText('detailDNI', contract.nif || contract.persona_contacto_nif || '-');
        setText('detailIBAN', contract.iban_contrato || '-');
        setText('detailDireccion', contract.direccion || '-');
        setText('detailCP', contract.cp || '-');
        setText('detailPoblacion', contract.poblacion || '-');
        setText('detailProvincia', contract.provincia || '-');

        // Populate Datos de Suministro
        setText('detailNombreSuministro', contract.persona_contacto || contract.nombre_cliente || '-');
        setText('detailDNISuministro', contract.persona_contacto_nif || contract.nif || '-');
        setText('detailDireccionSuministro', contract.direccion_suministro || contract.direccion || '-');
        setText('detailPoblacionSuministro', contract.poblacion_suministro || contract.poblacion || '-');
        setText('detailCPSuministro', contract.cp_suministro || contract.cp || '-');
        setText('detailProvinciaSuministro', contract.provincia_suministro || contract.provincia || '-');
        setText('detailComercializadoraSaliente', contract.comercializadora_saliente || '-');
        setText('detailCUPS', contract.cups || '-');

        // Populate Datos de Contratación
        setText('detailComercializadora', contract.comercializadora || '-');
        setText('detailConcepto', contract.concepto || '-');
        setText('detailTarifa', contract.tarifa || '-');
        setText('detailTarifaAcceso', contract.concepto ? window.TunergiaUtils.extractTarifaAcceso(contract.concepto) : '-');
        setText('detailTipoContratacion', contract.tipo_contratacion || '-');
        setText('detailCNAE', contract.cnae_actividad || '-');
        setText('detailFirmaDigital', contract.firma_digital === '1' || contract.firma_digital === 1 ? 'Sí' : 'No');
        setText('detailFacturaElectronica', contract.fact_electronica === '1' || contract.fact_electronica === 1 ? 'Sí' : 'No');
        setText('detailCambioComercializadora', contract.cambio_comercializadora || 'Sin cambios');
        setText('detailAutoconsumo', contract.luz_autoconsumo === '1' || contract.luz_autoconsumo === 1 ? 'Sí' : 'No');
        setText('detailFuturaActivacion', contract.futura_activacion || 'Cuanto antes');
        setText('detailFechaActivacion', contract.fecha_activacion || '-');
        setText('detailFechaCancelacion', contract.fecha_cancelacion || contract.fecha_baja || '-');
        setText('detailComercial', contract.comercial || '-');
        setText('detailKAM', contract.kam || '-');

        // Populate Datos de Consumo - Potencias (table cells)
        setText('detailPotP1', formatDecimal(contract.potencia_contratada_1));
        setText('detailPotP2', formatDecimal(contract.potencia_contratada_2));
        setText('detailPotP3', formatDecimal(contract.potencia_contratada_3));
        setText('detailPotP4', formatDecimal(contract.potencia_contratada_4));
        setText('detailPotP5', formatDecimal(contract.potencia_contratada_5));
        setText('detailPotP6', formatDecimal(contract.potencia_contratada_6));

        // Populate Datos de Consumo - Consumos (table cells)
        setText('detailConsP1', formatDecimal(contract.consumo_1));
        setText('detailConsP2', formatDecimal(contract.consumo_2));
        setText('detailConsP3', formatDecimal(contract.consumo_3));
        setText('detailConsP4', formatDecimal(contract.consumo_4));
        setText('detailConsP5', formatDecimal(contract.consumo_5));
        setText('detailConsP6', formatDecimal(contract.consumo_6));

        // Calculate and display total consumo
        const consumoTotal = parseFloat(contract.consumo) ||
            (parseFloat(contract.consumo_1 || 0) + parseFloat(contract.consumo_2 || 0) +
             parseFloat(contract.consumo_3 || 0) + parseFloat(contract.consumo_4 || 0) +
             parseFloat(contract.consumo_5 || 0) + parseFloat(contract.consumo_6 || 0));
        setText('detailConsumoTotal', window.TunergiaUtils.formatNumber(consumoTotal) + ' kWh');

        // Update contract ID badge
        const modalContractId = document.getElementById('modalContractId');
        if (modalContractId && contract.id) {
            modalContractId.textContent = `ID: ${contract.id}`;
        }

        // Populate Observaciones
        const obs = contract.observaciones || contract.observaciones_internas || '';
        const obsEl = document.getElementById('detailObservaciones');
        if (obsEl) obsEl.textContent = obs || 'Sin observaciones';

        // Populate Documentos
        const docsContainer = document.getElementById('detailDocumentos');
        const documentos = contract.documentacion || [];

        if (docsContainer) {
            if (Array.isArray(documentos) && documentos.length > 0) {
                docsContainer.innerHTML = documentos.map((doc, index) => {
                    const name = doc.nombre_original || doc.nombre || doc.filename || doc.name || 'Documento';
                    const url = doc.url_descarga || '';
                    const fecha = doc.fecha || '';
                    const tipo = doc.tipo || '';
                    const ext = name.split('.').pop().toUpperCase();

                    return `
                        <div class="document-item" style="display: flex; align-items: center; gap: 12px; padding: 12px; background: #f7fafc; border-radius: 8px; margin-bottom: 8px;">
                            <div class="document-icon" style="width: 40px; height: 40px; background: #4299e1; color: white; display: flex; align-items: center; justify-content: center; border-radius: 6px; font-weight: 700; font-size: 11px;">${ext}</div>
                            <div class="document-info" style="flex: 1;">
                                <div class="document-name" style="font-weight: 600; color: #2d3748; font-size: 13px;">${name}</div>
                                <div class="document-size" style="font-size: 11px; color: #a0aec0;">${fecha} ${tipo ? '• ' + tipo : ''}</div>
                            </div>
                            ${url ? `<a href="${url}" download="${name}" class="download-icon" style="color: #4299e1; text-decoration: none; font-size: 20px;" title="Descargar">⬇️</a>` : ''}
                        </div>
                    `;
                }).join('');
            } else {
                docsContainer.innerHTML = '<p class="no-docs">No hay documentos adjuntos</p>';
            }
        }

        // Populate Historial
        const historyContainer = document.getElementById('historyTimeline');
        const historial = contract.historico || [];

        if (historyContainer) {
            if (Array.isArray(historial) && historial.length > 0) {
                historyContainer.innerHTML = historial.map(item => {
                    return `
                        <div class="history-item" style="margin-bottom: 20px; padding: 16px; background: white; border-left: 3px solid #4299e1; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                            <div class="history-date" style="font-size: 12px; color: #a0aec0; margin-bottom: 4px;">${item.fecha || ''}</div>
                            <div class="history-action" style="font-size: 14px; font-weight: 600; color: #2d3748; margin-bottom: 4px;">${item.accion || ''}</div>
                            <div class="history-detail" style="font-size: 13px; color: #718096; margin-bottom: 8px;">${item.texto || ''}</div>
                            <div class="history-user" style="font-size: 11px; color: #a0aec0; font-style: italic;">Por: ${item.usuario || ''}</div>
                        </div>
                    `;
                }).join('');
            } else {
                historyContainer.innerHTML = '<p class="no-history" style="text-align: center; color: #a0aec0; padding: 40px 20px;">No hay historial disponible para este contrato</p>';
            }
        }

        console.log('✅ Contract detail rendered:', contract);
    },

    /**
     * Close contract detail modal
     */
    closeContractDetail() {
        const modal = document.getElementById('contractDetailModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }

        const renovarBtn = document.getElementById('renovarContractBtn');
        if (renovarBtn) renovarBtn.style.display = 'none';

        console.log('✅ Contract detail closed');
    },

    /**
     * Open create contract modal
     */
    async openCreateContract() {
        console.log('✨ Opening create contract modal');
        const modal = document.getElementById('createContractModal');
        if (!modal) {
            console.error('⚠️ Create contract modal not found');
            return;
        }

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Reset form
        const form = document.getElementById('createContractForm');
        if (form) form.reset();

        // Reset modal title
        const modalBadge = modal.querySelector('.contract-id-badge');
        if (modalBadge) {
            modalBadge.innerHTML = '<span>✨</span> Nuevo Contrato';
            modalBadge.style.background = '#38a169';
        }

        // Load comercializadoras
        await this.loadComercializadoras();

        console.log('✅ Create contract modal opened');
    },

    /**
     * Close create contract modal
     */
    closeCreateContract() {
        const modal = document.getElementById('createContractModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
        console.log('✅ Create contract modal closed');
    },

    /**
     * Load comercializadoras list
     */
    async loadComercializadoras() {
        const select = document.getElementById('createComercializadora');
        if (!select) return;

        try {
            const query = `SELECT DISTINCT COMPA____A FROM ${window.TunergiaConfig.productosTable} WHERE COMPA____A IS NOT NULL ORDER BY COMPA____A LIMIT 100`;
            const data = await window.TunergiaAPI.executeQuery(query);

            if (data && data.length > 0) {
                select.innerHTML = '<option value="">Seleccionar...</option>' +
                    data.map(row => `<option value="${row.COMPA____A}">${row.COMPA____A}</option>`).join('');
                console.log('✅ Loaded', data.length, 'comercializadoras from BigQuery');
            } else {
                throw new Error('No data returned from query');
            }
        } catch (error) {
            console.error('⚠️ Error loading comercializadoras from BigQuery:', error);
            console.log('📋 Using fallback comercializadoras list');

            // Fallback: Use hardcoded list of common comercializadoras
            const fallbackComercializadoras = [
                'CONTIGO_ENERGIA',
                'CONTIGO_ENERGIA_GAIAG',
                'GESTERNOVA',
                'NATURGY',
                'IBERDROLA',
                'ENDESA',
                'REPSOL',
                'TOTALENERGIES',
                'FACTOR_ENERGIA',
                'HOLALUZ'
            ].sort();

            select.innerHTML = '<option value="">Seleccionar...</option>' +
                fallbackComercializadoras.map(name => `<option value="${name}">${name.replace(/_/g, ' ')}</option>`).join('');

            console.log('✅ Loaded', fallbackComercializadoras.length, 'comercializadoras (fallback)');
        }
    },

    /**
     * Update productos dropdown based on form selections
     */
    async updateProductosDropdown() {
        const tipoClienteSelect = document.getElementById('createTipoCliente');
        const comercializadoraSelect = document.getElementById('createComercializadora');
        const tarifaSelect = document.getElementById('createTarifaAcceso');
        const productoSelect = document.getElementById('createProducto');

        if (!tipoClienteSelect || !comercializadoraSelect || !tarifaSelect || !productoSelect) {
            console.warn('⚠️ Form fields not found for productos update');
            return;
        }

        const tipoCliente = tipoClienteSelect.value;
        const comercializadora = comercializadoraSelect.value;
        const tarifa = tarifaSelect.value;

        // Disable productos dropdown if required fields are not selected
        if (!comercializadora || !tarifa) {
            productoSelect.disabled = true;
            productoSelect.innerHTML = '<option value="">Selecciona comercializadora y tarifa primero...</option>';
            console.log('⚠️ Comercializadora or tarifa not selected');
            return;
        }

        // Show loading state
        productoSelect.innerHTML = '<option value="">Cargando productos...</option>';
        productoSelect.disabled = true;

        try {
            console.log('🔄 Loading products for:', { tipoCliente, comercializadora, tarifa });

            // Call API to load products
            const productos = await window.TunergiaAPI.loadProducts(tipoCliente, comercializadora, tarifa);

            console.log('✅ Loaded', productos.length, 'products');

            // Populate dropdown
            if (productos.length === 0) {
                productoSelect.innerHTML = '<option value="">No hay productos disponibles</option>';
                productoSelect.disabled = true;
            } else {
                productoSelect.innerHTML = '<option value="">Seleccionar producto...</option>' +
                    productos.map(item => `<option value="${item.PRODUCTO}">${item.PRODUCTO}</option>`).join('');
                productoSelect.disabled = false;
            }
        } catch (error) {
            console.error('❌ Error loading products:', error);
            productoSelect.innerHTML = '<option value="">Error al cargar productos</option>';
            productoSelect.disabled = true;
        }
    },

    /**
     * Renovar contract - copy data and open create modal
     */
    async renovarContract() {
        const contractId = window.getState('currentContractId');
        if (!contractId) {
            console.error('No contract ID for renovation');
            return;
        }

        console.log('🔄 Starting contract renovation:', contractId);

        try {
            // Get contract details
            const contractData = await window.TunergiaAPI.getContractDetail(contractId);

            // Parse contract data
            let contract = {};
            if (Array.isArray(contractData) && contractData.length > 0 && contractData[0].datos) {
                contract = contractData[0].datos;
            } else if (contractData.datos) {
                contract = contractData.datos;
            } else {
                contract = contractData;
            }

            console.log('Contract data loaded for renovation:', contract);

            // Close detail modal
            this.closeContractDetail();

            // Open create modal
            const modal = document.getElementById('createContractModal');
            if (!modal) return;

            modal.classList.add('active');
            document.body.style.overflow = 'hidden';

            // Update modal title
            const modalBadge = modal.querySelector('.contract-id-badge');
            if (modalBadge) {
                modalBadge.innerHTML = '<span>🔄</span> RENOVAR Contrato #' + contractId;
                modalBadge.style.background = '#f6ad55';
            }

            // Load comercializadoras first
            await this.loadComercializadoras();

            // Pre-fill form
            const form = document.getElementById('createContractForm');
            if (form && contract) {
                // Personal data
                if (contract.nombre_cliente) form.nombre_cliente.value = contract.nombre_cliente;
                if (contract.tipo_empresa) form.tipo_empresa.value = contract.tipo_empresa;
                if (contract.email) form.email.value = contract.email;
                if (contract.movil) form.movil.value = contract.movil;
                if (contract.nif) form.nif.value = contract.nif;
                if (contract.iban_contrato) form.iban_contrato.value = contract.iban_contrato;
                if (contract.direccion) form.direccion.value = contract.direccion;
                if (contract.cp) form.cp.value = contract.cp;
                if (contract.poblacion) form.poblacion.value = contract.poblacion;
                if (contract.provincia) form.provincia.value = contract.provincia;

                // Supply data
                if (contract.persona_contacto) form.persona_contacto.value = contract.persona_contacto;
                if (contract.persona_contacto_nif) form.persona_contacto_nif.value = contract.persona_contacto_nif;
                if (contract.cups) form.cups.value = contract.cups;
                if (contract.comercializadora_saliente) form.comercializadora_saliente.value = contract.comercializadora_saliente;
                if (contract.direccion_suministro) form.direccion_suministro.value = contract.direccion_suministro;
                if (contract.cp_suministro) form.cp_suministro.value = contract.cp_suministro;
                if (contract.poblacion_suministro) form.poblacion_suministro.value = contract.poblacion_suministro;
                if (contract.provincia_suministro) form.provincia_suministro.value = contract.provincia_suministro;

                // Contract data
                if (contract.tarifa_acceso) form.tarifa_acceso.value = contract.tarifa_acceso;
                if (contract.cnae_actividad) form.cnae_actividad.value = contract.cnae_actividad;
                if (contract.consumo) form.consumo.value = contract.consumo;
            }

            console.log('✅ Contract renovation form pre-filled');

        } catch (error) {
            console.error('Error renovating contract:', error);
            this.showError('Error al cargar datos para renovación');
        }
    },

    /**
     * Apply filters to contracts
     */
    applyFilters() {
        let filtered = [...window.getState('contracts')];
        const searchTerm = window.getState('searchTerm').toLowerCase();
        const currentFilter = window.getState('currentFilter');

        // Apply search
        if (searchTerm) {
            filtered = filtered.filter(c =>
                (c.cliente || '').toLowerCase().includes(searchTerm) ||
                (c.cups || '').toLowerCase().includes(searchTerm) ||
                (c.id || '').toString().includes(searchTerm)
            );
        }

        // Apply status filter
        if (currentFilter !== 'all') {
            if (currentFilter === 'tramitado') {
                // En Tramitación: contracts without activation or cancellation
                filtered = filtered.filter(c => {
                    const estado = (c.estado || '').toUpperCase();
                    const hasActivacion = c.fecha_activacion && c.fecha_activacion !== '' && !c.fecha_activacion.startsWith('0000');
                    const hasCancelacion = c.fecha_cancelacion && c.fecha_cancelacion !== '' && !c.fecha_cancelacion.startsWith('0000');

                    if (hasActivacion || hasCancelacion) return false;

                    return estado.includes('TEMPORAL') || estado.includes('PDTE') || estado.includes('PENDIENTE') ||
                           estado.includes('INCIDENCIA') || estado.includes('TRAMITADO') || estado.includes('VALIDADO') ||
                           estado.includes('FIRMA') || estado.includes('LISTO');
                });
            } else if (currentFilter === 'activado') {
                // Activated: has activation date and ACTIVADO status
                filtered = filtered.filter(c => {
                    const estado = (c.estado || '').toUpperCase();
                    const hasActivacion = c.fecha_activacion && c.fecha_activacion !== '' && !c.fecha_activacion.startsWith('0000');
                    return hasActivacion && estado.includes('ACTIVADO');
                });
            } else if (currentFilter === 'baja') {
                // Bajas: has cancellation date
                filtered = filtered.filter(c => {
                    const hasCancelacion = c.fecha_cancelacion && c.fecha_cancelacion !== '' && !c.fecha_cancelacion.startsWith('0000');
                    return hasCancelacion;
                });
            } else if (currentFilter === 'oportunidad') {
                // Oportunidad: NO RENOVADO, INTERESADO, OPORTUNIDAD status, or active contracts approaching 1 year
                filtered = filtered.filter(c => {
                    const estado = (c.estado || '').toUpperCase();

                    // Check for specific statuses
                    if (estado === 'NO RENOVADO' || estado === 'INTERESADO' || estado === 'LISTO GESTION' || estado.includes('OPORTUNIDAD')) {
                        return true;
                    }

                    // Check if active contract approaching 1 year anniversary (within 3 months)
                    const hasActivacion = c.fecha_activacion && c.fecha_activacion !== '' && !c.fecha_activacion.startsWith('0000');
                    if (hasActivacion && estado.includes('ACTIVADO')) {
                        try {
                            // Parse activation date
                            let activacionDate;
                            if (c.fecha_activacion.includes('/')) {
                                const parts = c.fecha_activacion.split('/');
                                activacionDate = new Date(parts[2], parseInt(parts[1]) - 1, parts[0]);
                            } else {
                                activacionDate = new Date(c.fecha_activacion);
                            }

                            if (!isNaN(activacionDate)) {
                                // Calculate 1 year anniversary
                                const oneYearLater = new Date(activacionDate);
                                oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

                                // Check if within 3 months before anniversary
                                const threeMonthsBefore = new Date(oneYearLater);
                                threeMonthsBefore.setMonth(threeMonthsBefore.getMonth() - 3);

                                const now = new Date();
                                return now >= threeMonthsBefore && now <= oneYearLater;
                            }
                        } catch (e) {
                            // If date parsing fails, ignore this criteria
                        }
                    }

                    return false;
                });
            } else {
                // Generic filter by estado
                filtered = filtered.filter(c => (c.estado || '').toLowerCase() === currentFilter.toLowerCase());
            }
        }

        // Apply sorting
        const sortColumn = window.getState('sortColumn');
        const sortDirection = window.getState('sortDirection');

        if (sortColumn) {
            filtered.sort((a, b) => {
                let aVal = a[sortColumn] || '';
                let bVal = b[sortColumn] || '';

                // Handle numeric columns
                if (sortColumn === 'id' || sortColumn === 'consumo') {
                    aVal = parseFloat(aVal) || 0;
                    bVal = parseFloat(bVal) || 0;
                } else {
                    aVal = String(aVal).toLowerCase();
                    bVal = String(bVal).toLowerCase();
                }

                if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }

        window.setState({ filteredContracts: filtered, currentPage: 1 });
        this.renderContractsTable();
    },

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        console.log('🎧 Setting up event listeners...');

        // Date filter buttons
        const dateFilterBtns = document.querySelectorAll('.filter-btn[data-days]');
        console.log('📅 Date filter buttons found:', dateFilterBtns.length);
        dateFilterBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                document.querySelectorAll('.filter-btn[data-days]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                window.setState({ dateFilter: parseInt(btn.dataset.days) });
                this.showLoading(true);
                await this.updateStatistics();
                this.showLoading(false);
            });
        });

        // Search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                window.setState({ searchTerm: e.target.value });
                this.applyFilters();
            });
        }

        // Filter tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                window.setState({ currentFilter: btn.dataset.filter || 'all' });
                this.applyFilters();
            });
        });

        // Pagination buttons
        const prevPage = document.getElementById('prevPage');
        if (prevPage) {
            prevPage.addEventListener('click', () => {
                console.log('⬅️ Previous page clicked');
                const currentPage = window.getState('currentPage');
                if (currentPage > 1) {
                    window.setState({ currentPage: currentPage - 1 });
                    this.renderContractsTable();
                }
            });
            console.log('✅ Previous page button listener added');
        } else {
            console.warn('⚠️ Previous page button not found (ID: prevPage)');
        }

        const nextPage = document.getElementById('nextPage');
        if (nextPage) {
            nextPage.addEventListener('click', () => {
                console.log('➡️ Next page clicked');
                const currentPage = window.getState('currentPage');
                const totalPages = Math.ceil(window.getState('filteredContracts').length / window.TunergiaConfig.itemsPerPage);
                if (currentPage < totalPages) {
                    window.setState({ currentPage: currentPage + 1 });
                    this.renderContractsTable();
                }
            });
            console.log('✅ Next page button listener added');
        } else {
            console.warn('⚠️ Next page button not found (ID: nextPage)');
        }

        // Select all checkbox
        const selectAll = document.getElementById('selectAll');
        if (selectAll) {
            selectAll.addEventListener('change', (e) => {
                console.log('☑️ Select all toggled:', e.target.checked);
                window.setState({ selectAllMode: false });
                document.querySelectorAll('.row-checkbox').forEach(cb => {
                    cb.checked = e.target.checked;
                });
                this.updateSelectionInfo();
            });
            console.log('✅ Select all checkbox listener added');
        } else {
            console.warn('⚠️ Select all checkbox not found (ID: selectAll)');
        }

        // Select all contracts button (Gmail-style)
        const selectAllContractsBtn = document.getElementById('selectAllContracts');
        if (selectAllContractsBtn) {
            selectAllContractsBtn.addEventListener('click', () => {
                console.log('📋 Select all contracts clicked');
                window.setState({ selectAllMode: true });
                this.updateSelectionInfo();
            });
            console.log('✅ Select all contracts button listener added');
        }

        // Sortable columns
        const sortableHeaders = document.querySelectorAll('.sortable');
        console.log('🔽 Sortable headers found:', sortableHeaders.length);
        sortableHeaders.forEach(th => {
            th.addEventListener('click', () => {
                const column = th.dataset.sort;
                console.log('🔽 Sort clicked:', column);
                const currentColumn = window.getState('sortColumn');
                const currentDirection = window.getState('sortDirection');

                if (currentColumn === column) {
                    window.setState({ sortDirection: currentDirection === 'asc' ? 'desc' : 'asc' });
                } else {
                    window.setState({ sortColumn: column, sortDirection: 'asc' });
                }

                // Update visual indicators
                document.querySelectorAll('.sortable').forEach(header => {
                    header.classList.remove('active', 'asc', 'desc');
                });
                th.classList.add('active', window.getState('sortDirection'));

                this.applyFilters();
            });
        });

        // Create Contract button
        const createBtn = document.getElementById('createBtn');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.openCreateContract());
            console.log('✅ Create contract button listener added');
        } else {
            console.warn('⚠️ Create button not found (ID: createBtn)');
        }

        // Contract Detail Modal - Close button
        const closeBtn = document.getElementById('closeContractDetailBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeContractDetail());
        }

        // Contract Detail Modal - Renovar button
        const renovarBtn = document.getElementById('renovarContractBtn');
        if (renovarBtn) {
            renovarBtn.addEventListener('click', () => this.renovarContract());
            console.log('✅ Renovar button listener added');
        }

        // Contract Detail Modal - Overlay click
        const overlay = document.getElementById('contractDetailOverlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeContractDetail());
        }

        // Contract Detail Modal - Tab switching
        document.querySelectorAll('.detail-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.dataset.tab;

                // Update tab buttons
                document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Update tab content - convert tabId to element id (cliente -> tabCliente)
                document.querySelectorAll('.detail-tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                const targetId = 'tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1);
                const targetContent = document.getElementById(targetId);
                if (targetContent) targetContent.classList.add('active');
            });
        });

        // Create Contract Modal - Back button
        const backFromCreateBtn = document.getElementById('backFromCreateBtn');
        if (backFromCreateBtn) {
            backFromCreateBtn.addEventListener('click', () => this.closeCreateContract());
        }

        // Create Contract Modal - Cancel button
        const cancelCreateBtn = document.getElementById('cancelCreateBtn');
        if (cancelCreateBtn) {
            cancelCreateBtn.addEventListener('click', () => this.closeCreateContract());
        }

        // Create Contract Modal - Overlay click
        const createOverlay = document.getElementById('createContractOverlay');
        if (createOverlay) {
            createOverlay.addEventListener('click', () => this.closeCreateContract());
        }

        // Product dropdown event listeners for form
        const tipoClienteSelect = document.getElementById('createTipoCliente');
        const comercializadoraSelect = document.getElementById('createComercializadora');
        const tarifaSelect = document.getElementById('createTarifaAcceso');

        if (tipoClienteSelect) {
            tipoClienteSelect.addEventListener('change', () => {
                console.log('📝 Tipo de Cliente changed');
                if (this.updateProductosDropdown) {
                    this.updateProductosDropdown();
                }
            });
            console.log('✅ Tipo Cliente event listener added');
        }

        if (comercializadoraSelect) {
            comercializadoraSelect.addEventListener('change', () => {
                console.log('📝 Comercializadora changed');
                if (this.updateProductosDropdown) {
                    this.updateProductosDropdown();
                }
            });
            console.log('✅ Comercializadora event listener added');
        }

        if (tarifaSelect) {
            tarifaSelect.addEventListener('change', () => {
                console.log('📝 Tarifa de Acceso changed');
                if (this.updateProductosDropdown) {
                    this.updateProductosDropdown();
                }
            });
            console.log('✅ Tarifa de Acceso event listener added');
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeContractDetail();
                this.closeCreateContract();
            }
        });

        console.log('✅ Event listeners setup');
    }
};

console.log('✅ UI loaded');
