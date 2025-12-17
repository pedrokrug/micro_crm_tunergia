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
     * Render contracts table
     */
    renderContractsTable() {
        const tbody = document.getElementById('contractsTableBody');
        const contracts = window.getState('filteredContracts');

        if (!tbody) return;

        if (!contracts || contracts.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="empty-state">
                        <div class="empty-icon">📋</div>
                        <h3>No hay contratos</h3>
                        <p>No se encontraron contratos con los filtros aplicados</p>
                    </td>
                </tr>
            `;
            return;
        }

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

        // Populate personal data
        setText('detailNombre', contract.nombre_cliente || contract.persona_contacto);
        setText('detailTipoCliente', contract.tipo_empresa || 'Particular');
        setText('detailCorreo', contract.email);
        setText('detailMovil', contract.movil || contract.telefono);
        setText('detailDNI', contract.nif || contract.persona_contacto_nif);
        setText('detailIBAN', contract.iban_contrato);
        setText('detailDireccion', contract.direccion);
        setText('detailCP', contract.cp);
        setText('detailPoblacion', contract.poblacion);
        setText('detailProvincia', contract.provincia);

        // Populate supply data
        setText('detailCUPS', contract.cups);
        setText('detailComercializadoraSaliente', contract.comercializadora_saliente);

        // Populate contract data
        setText('detailComercializadora', contract.comercializadora);
        setText('detailConcepto', contract.concepto);
        setText('detailTarifaAcceso', window.TunergiaUtils.extractTarifaAcceso(contract.concepto));

        console.log('Contract detail rendered:', contract);
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
    },

    /**
     * Apply filters to contracts
     */
    applyFilters() {
        let filtered = window.getState('contracts');
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
            filtered = filtered.filter(c => (c.estado || '').toLowerCase() === currentFilter.toLowerCase());
        }

        window.setState({ filteredContracts: filtered });
        this.renderContractsTable();

        // Update count
        const countEl = document.getElementById('totalContracts');
        if (countEl) {
            countEl.textContent = `${window.TunergiaUtils.formatNumber(filtered.length)} Contratos`;
        }
    },

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Date filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                const days = parseInt(e.target.dataset.days) || 30;
                window.setState({ dateFilter: days });
                await this.updateStatistics();
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
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                const filter = e.target.dataset.filter || 'all';
                window.setState({ currentFilter: filter });
                this.applyFilters();
            });
        });

        // Close contract detail button
        const closeBtn = document.getElementById('closeContractDetailBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeContractDetail());
        }

        // Close on overlay click
        const overlay = document.querySelector('.contract-detail-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeContractDetail());
        }

        console.log('✅ Event listeners setup');
    }
};

console.log('✅ UI loaded');
