<script>
(function() {
    // Configuration
    const CONFIG = {
        webhookUrl: 'https://tunuevaenergia.com/webhook/59200adf-d6df-4dd2-b319-5ab57d2e5052',
        nodoWebhookUrl: 'https://tunuevaenergia.com/webhook/nodo',
        documentWebhookUrl: 'https://tunuevaenergia.com/webhook/documento-nodo',
        bigQueryTable: '`tunergia-1722509306765.NODO.Contratos_Comisiones`',
        productosTable: '`tunergia-1722509306765.Precios_Tunergia.Tarifas Fijas Portfolio`',
        itemsPerPage: 10
    };
    
    // State
    let state = {
        currentUser: null,
        idComercial: null,
        contracts: [],
        filteredContracts: [],
        currentPage: 1,
        currentFilter: 'all',
        searchTerm: '',
        sortColumn: 'fecha',
        sortDirection: 'desc',
        dateFilter: 30, // For stats only
        listDateFrom: null, // For contracts list
        listDateTo: null, // For contracts list
        contractsLimit: 500,
        totalContracts: 0,
        currentContractId: null,
        selectAllMode: false
    };
    
    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    async function init() {
        showLoading(true);
        try {
            await loadUserInfo();
            if (state.idComercial) {
                await loadDashboardData();
            } else {
                showError('No se pudo obtener el ID del comercial. Por favor, contacta con soporte.');
            }
        } catch (error) {
            console.error('Initialization error:', error);
            showError('Error al inicializar el dashboard: ' + error.message);
        } finally {
            showLoading(false);
        }
        
        setupEventListeners();
    }
    
    async function loadUserInfo() {
        try {
            // Try to get user from Odoo session
            const sessionResponse = await fetch('/web/session/get_session_info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {} })
            });
            
            const sessionData = await sessionResponse.json();
            
            if (sessionData.result && sessionData.result.uid) {
                state.currentUser = {
                    uid: sessionData.result.uid,
                    name: sessionData.result.name || 'Usuario',
                    email: sessionData.result.username || ''
                };
                
                // Now get the x_studio_persona_de_contacto field from res.partner
                const partnerResponse = await fetch('/web/dataset/call_kw', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'call',
                        params: {
                            model: 'res.users',
                            method: 'read',
                            args: [[sessionData.result.uid], ['partner_id']],
                            kwargs: {}
                        }
                    })
                });
                
                const partnerData = await partnerResponse.json();
                
                if (partnerData.result && partnerData.result[0] && partnerData.result[0].partner_id) {
                    const partnerId = partnerData.result[0].partner_id[0];
                    
                    // Get the x_studio_persona_de_contacto from res.partner
                    const contactResponse = await fetch('/web/dataset/call_kw', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'call',
                            params: {
                                model: 'res.partner',
                                method: 'read',
                                args: [[partnerId], ['x_studio_persona_de_contacto']],
                                kwargs: {}
                            }
                        })
                    });
                    
                    const contactData = await contactResponse.json();
                    
                    if (contactData.result && contactData.result[0]) {
                        state.idComercial = contactData.result[0].x_studio_persona_de_contacto;
                    }
                }
                
                updateUserUI();
            }
        } catch (error) {
            console.error('Error loading user info:', error);
            // For testing without Odoo session - remove in production
            state.currentUser = { name: 'Demo User', email: 'demo@tunergia.es' };
            state.idComercial = null; // Will show empty state
            updateUserUI();
        }
    }
    
    function updateUserUI() {
        const user = state.currentUser;
        if (!user) return;
        
        document.getElementById('userName').textContent = user.name;
        document.getElementById('userEmail').textContent = user.email;
        document.getElementById('welcomeName').textContent = user.name.split(' ')[0];
        document.getElementById('userAvatar').textContent = getInitials(user.name);
        document.getElementById('userIdBadge').textContent = `ID: ${state.idComercial || 'N/A'}`;
    }
    
    function getInitials(name) {
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }
    
    async function loadDashboardData() {
        console.log('Loading dashboard data for id_comercial:', state.idComercial);
        await Promise.all([
            loadStats(),
            loadContracts()
        ]);
    }
    

    async function loadStats() {
        try {
            // Get date ranges based on filter
            const now = new Date();
            const currentStart = new Date();
            currentStart.setDate(now.getDate() - state.dateFilter);
            const currentStartStr = currentStart.toISOString().split('T')[0];
            const previousStart = new Date(currentStart);
            previousStart.setDate(previousStart.getDate() - state.dateFilter);
            const previousStartStr = previousStart.toISOString().split('T')[0];
            
            console.log('Date ranges:', { currentStartStr, previousStartStr });
            
            // Single query to get all relevant data
            const query = `
                SELECT 
                    estado,
                    fecha_activacion,
                    fecha_cancelacion,
                    consumo
                FROM ${CONFIG.bigQueryTable}
                WHERE (borrado = 0 OR borrado IS NULL)
                    AND id_comercial = '${state.idComercial}'
            `;
            
            const data = await executeQuery(query);
            console.log('Stats raw data count:', data.length);
            
            // Process data in JavaScript
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
                
                // Check if dates are valid (not empty, not 0000-00-00)
                const hasActivacion = fechaActivacion && fechaActivacion !== '' && !fechaActivacion.startsWith('0000');
                const hasCancelacion = fechaCancelacion && fechaCancelacion !== '' && !fechaCancelacion.startsWith('0000');
                
                // EN TRAMITACIÓN: no activation, no cancellation, tramitacion estado
                if (!hasActivacion && !hasCancelacion) {
                    const isTramitacion = tramitacionEstados.some(e => estado.includes(e));
                    if (isTramitacion) {
                        tramitados++;
                        kwhTramitados += consumo;
                    }
                }
                
                // ACTIVADOS: has activation, ACTIVADO estado
                if (hasActivacion && estado.includes('ACTIVADO')) {
                    // Normalize date format (could be DD/MM/YYYY or YYYY-MM-DD)
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
                
                // BAJAS: has cancellation date
                if (hasCancelacion) {
                    // Normalize date format
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
            
            console.log('Stats calculated:', { 
                tramitados, activadosCurrent, bajasCurrent, 
                kwhTramitados, kwhActivadosCurrent, kwhBajasCurrent,
                activadosChange, bajasChange
            });
            
            // Update stats UI - Numbers
            document.getElementById('statTramitados').textContent = formatNumber(tramitados);
            document.getElementById('statActivados').textContent = formatNumber(activadosCurrent);
            document.getElementById('statBajas').textContent = formatNumber(bajasCurrent);
            document.getElementById('statKwhTramitacion').textContent = formatLargeNumber(kwhTramitados);
            document.getElementById('statKwhActivados').textContent = formatLargeNumber(kwhActivadosCurrent);
            document.getElementById('statKwhBajas').textContent = formatLargeNumber(kwhBajasCurrent);
            
            // Update comparison indicators - Activados
            const changeActivadosEl = document.getElementById('changeActivados');
            if (changeActivadosEl) {
                const isPositive = parseFloat(activadosChange) >= 0;
                changeActivadosEl.className = 'stat-change ' + (isPositive ? 'positive' : 'negative');
                changeActivadosEl.innerHTML = '<span class="change-icon">' + (isPositive ? '↑' : '↓') + '</span><span>' + Math.abs(activadosChange) + '% vs período anterior</span>';
            }
            
            // Update comparison indicators - kWh Activados
            const changeKwhActivadosEl = document.getElementById('changeKwhActivados');
            if (changeKwhActivadosEl) {
                const isPositive = parseFloat(kwhActivadosChange) >= 0;
                changeKwhActivadosEl.className = 'stat-change ' + (isPositive ? 'positive' : 'negative');
                changeKwhActivadosEl.innerHTML = '<span class="change-icon">' + (isPositive ? '↑' : '↓') + '</span><span>' + Math.abs(kwhActivadosChange) + '% vs período anterior</span>';
            }
            
            // Update comparison indicators - Bajas
            const changeBajasEl = document.getElementById('changeBajas');
            if (changeBajasEl) {
                const isNegativeChange = parseFloat(bajasChange) <= 0;
                changeBajasEl.className = 'stat-change ' + (isNegativeChange ? 'positive' : 'negative');
                changeBajasEl.innerHTML = '<span class="change-icon">' + (parseFloat(bajasChange) >= 0 ? '↑' : '↓') + '</span><span>' + Math.abs(bajasChange) + '% vs período anterior</span>';
            }
            
            // Update comparison indicators - kWh Bajas
            const changeKwhBajasEl = document.getElementById('changeKwhBajas');
            if (changeKwhBajasEl) {
                const isNegativeChange = parseFloat(kwhBajasChange) <= 0;
                changeKwhBajasEl.className = 'stat-change ' + (isNegativeChange ? 'positive' : 'negative');
                changeKwhBajasEl.innerHTML = '<span class="change-icon">' + (parseFloat(kwhBajasChange) >= 0 ? '↑' : '↓') + '</span><span>' + Math.abs(kwhBajasChange) + '% vs período anterior</span>';
            }
            
        } catch (error) {
            console.error('Error loading stats:', error);
            // Show zeros on error
            document.getElementById('statTramitados').textContent = '0';
            document.getElementById('statActivados').textContent = '0';
            document.getElementById('statBajas').textContent = '0';
            document.getElementById('statKwhTramitacion').textContent = '0';
            document.getElementById('statKwhActivados').textContent = '0';
            document.getElementById('statKwhBajas').textContent = '0';
        }
    }

    async function loadContracts() {
        try {
            // First get total count
            const countQuery = `
                SELECT COUNT(*) as total
                FROM ${CONFIG.bigQueryTable}
                WHERE (borrado = 0 OR borrado IS NULL)
                    AND id_comercial = '${state.idComercial}'
            `;
            
            const countData = await executeQuery(countQuery);
            const totalCount = countData[0] ? parseInt(countData[0].total) || 0 : 0;
            state.totalContracts = totalCount;
            
            document.getElementById('totalContracts').textContent = `${formatNumber(totalCount)} Contratos`;
            
            // Build date filter for list if date range is set
            let dateFilter = '';
            if (state.listDateFrom || state.listDateTo) {
                if (state.listDateFrom) {
                    dateFilter += ` AND fecha >= '${state.listDateFrom}'`;
                }
                if (state.listDateTo) {
                    dateFilter += ` AND fecha <= '${state.listDateTo}'`;
                }
            }
            
            // Load contracts with current limit
            const query = `
                SELECT 
                    id, tipo, estado, fecha, cups, cliente, poblacion, provincia, 
                    consumo, fecha_activacion, fecha_cancelacion, tarifa, tarifa_acceso, observaciones
                FROM ${CONFIG.bigQueryTable}
                WHERE (borrado = 0 OR borrado IS NULL)
                    AND id_comercial = '${state.idComercial}'
                    ${dateFilter}
                ORDER BY fecha DESC
                LIMIT ${state.contractsLimit}
            `;
            
            const data = await executeQuery(query);
            console.log('Contracts data received:', data.length, 'items');
            
            if (!data || data.length === 0) {
                console.warn('No contracts data returned');
                showEmptyState(true);
                return;
            }
            
            state.contracts = data;
            state.filteredContracts = [...data];
            
            // Update load more button visibility
            updateLoadMoreButton();
            
            applyFilters();
            
        } catch (error) {
            console.error('Error loading contracts:', error);
            showEmptyState(true);
        }
    }
    
    function updateLoadMoreButton() {
        const loadedInfo = document.getElementById('loadedInfo');
        
        if (loadedInfo) {
            const loaded = state.contracts.length;
            const total = state.totalContracts || loaded;
            
            loadedInfo.textContent = `Mostrando ${formatNumber(loaded)} de ${formatNumber(total)}`;
        }
    }
    
    async function changeContractsLimit(newLimit) {
        state.contractsLimit = newLimit;
        showLoading(true);
        await loadContracts();
        showLoading(false);
    }
    
    // Contract Detail Modal Functions
    async function openContractDetail(contractId) {
        const modal = document.getElementById('contractDetailModal');
        const loading = document.getElementById('contractDetailLoading');
        const error = document.getElementById('contractDetailError');
        const content = document.getElementById('contractDetailContent');
        const contractIdBadge = document.getElementById('modalContractId');
        
        // Store current contract ID
        state.currentContractId = contractId;
        
        // Show modal
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Reset state
        loading.classList.add('active');
        error.classList.remove('active');
        content.classList.remove('active');
        contractIdBadge.textContent = `ID: ${contractId}`;
        
        // Reset tabs to first tab
        document.querySelectorAll('.detail-tab').forEach((tab, i) => {
            tab.classList.toggle('active', i === 0);
        });
        document.querySelectorAll('.detail-tab-content').forEach((content, i) => {
            content.classList.toggle('active', i === 0);
        });
        
        try {
            // Call NODO webhook
            const response = await fetch(CONFIG.nodoWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: contractId })
            });
            
            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('NODO response:', data);
            
            // Parse and display data
            populateContractDetail(data);

            loading.classList.remove('active');
            content.classList.add('active');

            // Show RENOVAR button
            const renovarBtn = document.getElementById('renovarContractBtn');
            if (renovarBtn) {
                renovarBtn.style.display = 'inline-flex';
            }

        } catch (err) {
            console.error('Error loading contract details:', err);
            loading.classList.remove('active');
            document.getElementById('contractDetailErrorText').textContent = 
                `Error al cargar los datos: ${err.message}`;
            error.classList.add('active');
        }
    }
    
    function closeContractDetail() {
        const modal = document.getElementById('contractDetailModal');
        modal.classList.remove('active');
        document.body.style.overflow = '';

        // Hide RENOVAR button
        const renovarBtn = document.getElementById('renovarContractBtn');
        if (renovarBtn) {
            renovarBtn.style.display = 'none';
        }
    }
    
    // Load Comercializadoras from webhook
    async function loadComercializadoras() {
        const select = document.getElementById('createComercializadora');
        select.innerHTML = '<option value="">Cargando...</option>';

        try {
            const response = await fetch(CONFIG.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: `SELECT DISTINCT COMPA____A FROM ${CONFIG.productosTable} WHERE COMPA____A IS NOT NULL ORDER BY COMPA____A`
                })
            });

            const result = await response.json();
            const comercializadoras = result.data || [];

            select.innerHTML = '<option value="">Seleccionar...</option>';
            comercializadoras.forEach(item => {
                const comercializadora = item.COMPA____A;
                if (comercializadora) {
                    const option = document.createElement('option');
                    option.value = comercializadora;
                    option.textContent = comercializadora;
                    select.appendChild(option);
                }
            });
        } catch (error) {
            console.error('Error loading comercializadoras:', error);
            select.innerHTML = '<option value="">Error al cargar</option>';
            alert('Error al cargar las comercializadoras. Por favor, recarga la página.');
        }
    }

    // Load Products based on filters
    async function loadProducts() {
        const tipoCliente = document.getElementById('createTipoCliente').value;
        const comercializadora = document.getElementById('createComercializadora').value;
        const tarifa = document.getElementById('createTarifaAcceso').value;
        const productoSelect = document.getElementById('createProducto');

        // Disable if no comercializadora or tarifa selected
        if (!comercializadora || !tarifa) {
            productoSelect.disabled = true;
            productoSelect.innerHTML = '<option value="">Selecciona comercializadora y tarifa primero...</option>';
            return;
        }

        productoSelect.innerHTML = '<option value="">Cargando productos...</option>';
        productoSelect.disabled = true;

        try {
            // Map Tipo Cliente to database values
            const tipoClienteMap = {
                'PARTICULAR': 'Residencial',
                'AUTONOMO': 'Empresa;CCPP',
                'EMPRESA': 'EMPRESA',
                'CCPP': 'TODO'
            };

            const tipoClienteValue = tipoClienteMap[tipoCliente] || tipoCliente;

            // Get current date for vigency check
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

            // Build query with filters including vigency dates
            let query = `SELECT DISTINCT PRODUCTO, TARIFA, TIPO_DE_CLIENTE, INICIO_VIGENCIA, FIN_VIGENCIA FROM ${CONFIG.productosTable} WHERE COMPA____A = '${comercializadora}' AND TARIFA = '${tarifa}'`;

            // Add vigency date filter - only show products that are currently valid
            query += ` AND (INICIO_VIGENCIA IS NULL OR INICIO_VIGENCIA <= '${today}')`;
            query += ` AND (FIN_VIGENCIA IS NULL OR FIN_VIGENCIA >= '${today}')`;

            if (tipoCliente) {
                // Handle multiple values in TIPO_DE_CLIENTE field
                if (tipoClienteValue.includes(';')) {
                    const values = tipoClienteValue.split(';');
                    const conditions = values.map(v => `TIPO_DE_CLIENTE LIKE '%${v}%'`).join(' OR ');
                    query += ` AND (${conditions})`;
                } else {
                    query += ` AND (TIPO_DE_CLIENTE = '${tipoClienteValue}' OR TIPO_DE_CLIENTE = 'TODO')`;
                }
            }

            query += ` ORDER BY PRODUCTO`;

            const response = await fetch(CONFIG.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });

            const result = await response.json();
            const productos = result.data || [];

            productoSelect.innerHTML = '<option value="">Seleccionar producto...</option>';

            if (productos.length === 0) {
                productoSelect.innerHTML = '<option value="">No hay productos disponibles</option>';
            } else {
                productos.forEach(item => {
                    const producto = item.PRODUCTO;
                    if (producto) {
                        const option = document.createElement('option');
                        option.value = producto;
                        option.textContent = producto;
                        productoSelect.appendChild(option);
                    }
                });
                productoSelect.disabled = false;
            }
        } catch (error) {
            console.error('Error loading products:', error);
            productoSelect.innerHTML = '<option value="">Error al cargar productos</option>';
        }
    }

    // Create Contract Modal Functions
    async function openCreateContract() {
        const modal = document.getElementById('createContractModal');
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Reset renewal mode and documents
        isRenewalMode = false;
        originalComercializadora = '';
        uploadedDocuments = [];

        // Reset form
        document.getElementById('createContractForm').reset();
        document.getElementById('uploadedFilesList').innerHTML = '';

        // Reset modal title
        const modalBadge = document.querySelector('#createContractModal .contract-id-badge');
        modalBadge.innerHTML = '<span>✨</span> Nuevo Contrato';
        modalBadge.style.background = '#38a169';

        // Load comercializadoras
        await loadComercializadoras();
    }

    function closeCreateContract() {
        const modal = document.getElementById('createContractModal');
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Helper function to match comercializadora names (handles variations)
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

    // RENOVAR contract function
    async function renovarContract() {
        const contractId = state.currentContractId;
        if (!contractId) return;

        try {
            // Fetch full contract data from NODO (not from state.contracts which has limited fields)
            const response = await fetch(CONFIG.nodoWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: contractId })
            });

            if (!response.ok) {
                throw new Error('Error al cargar datos del contrato');
            }

            const data = await response.json();

            // Parse contract data (handle NODO response structure)
            let contractData = {};
            if (Array.isArray(data) && data.length > 0 && data[0].datos) {
                contractData = data[0].datos;
            } else if (data.datos) {
                contractData = data.datos;
            } else if (data.data && data.data.datos) {
                contractData = data.data.datos;
            } else {
                contractData = data;
            }

            console.log('Renewal data loaded:', contractData);

            // Close contract detail modal
            closeContractDetail();

            // Open create contract modal
            const modal = document.getElementById('createContractModal');
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';

            // Set renewal mode
            isRenewalMode = true;
            originalComercializadora = contractData.comercializadora || contractData.tipo || '';
            uploadedDocuments = [];

            // Update modal title
            const modalBadge = document.querySelector('#createContractModal .contract-id-badge');
            modalBadge.innerHTML = '<span>🔄</span> RENOVAR Contrato #' + contractId;
            modalBadge.style.background = '#f6ad55';

            // Load comercializadoras first
            await loadComercializadoras();

            // Pre-fill form with contract data using NODO field names
            const form = document.getElementById('createContractForm');

            // Personal data - using correct NODO field names
            form.nombre_cliente.value = contractData.nombre_cliente || contractData.persona_contacto || '';
            form.nif.value = contractData.nif || contractData.persona_contacto_nif || '';
            form.email.value = contractData.email || '';
            form.movil.value = contractData.movil || contractData.telefono || '';
            form.iban_contrato.value = contractData.iban_contrato || '';
            form.direccion.value = contractData.direccion || '';
            form.cp.value = contractData.cp || '';
            form.poblacion.value = contractData.poblacion || '';
            form.provincia.value = contractData.provincia || '';

            // Supply data
            form.cups.value = contractData.cups || '';
            form.direccion_suministro.value = contractData.direccion_suministro || contractData.direccion || '';
            form.poblacion_suministro.value = contractData.poblacion_suministro || contractData.poblacion || '';
            form.provincia_suministro.value = contractData.provincia_suministro || contractData.provincia || '';
            form.cp_suministro.value = contractData.cp_suministro || contractData.cp || '';
            form.comercializadora_saliente.value = contractData.comercializadora_saliente || originalComercializadora;

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
            if (comercializadoraSelect.value && tarifaValue) {
                await loadProducts();
            }

            // Contract data
            form.cnae_actividad.value = contractData.cnae_actividad || contractData.cnae || '';

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

            // Add event listener to comercializadora to update tipo_contratacion dynamically
            const updateTipoContratacion = function() {
                const newComercializadora = comercializadoraSelect.value;
                const tipoSelect = document.getElementById('createTipoContratacion');

                if (matchComercializadora(newComercializadora, originalComercializadora)) {
                    tipoSelect.value = 'RENOVACION';
                } else {
                    tipoSelect.value = 'CAMBIO';
                }
            };

            // Remove old listener if exists and add new one
            comercializadoraSelect.removeEventListener('change', updateTipoContratacion);
            comercializadoraSelect.addEventListener('change', updateTipoContratacion);

        } catch (error) {
            console.error('Error renovating contract:', error);
            alert('❌ Error al cargar datos para renovación:\n\n' + error.message);
        }
    }

    // Extract SIPS data function
    async function extractSipsData() {
        const cupsInput = document.getElementById('cupsInput');
        const cups = cupsInput.value.trim();

        if (!cups) {
            alert('Por favor, introduce un CUPS válido');
            return;
        }

        const extractBtn = document.getElementById('extractSipsBtn');
        const originalText = extractBtn.innerHTML;
        extractBtn.disabled = true;
        extractBtn.innerHTML = '<span>⏳</span> Extrayendo...';

        try {
            const response = await fetch('https://tunuevaenergia.com/webhook/SIPS-contrato-nodo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cups: cups })
            });

            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status}`);
            }

            const result = await response.json();
            const data = Array.isArray(result) ? result[0] : result;

            // Fill in the form with SIPS data
            if (data.kWhAnual) {
                document.querySelector('input[name="consumo"]').value = data.kWhAnual;
            }
            if (data.cnae_code) {
                document.querySelector('input[name="cnae_actividad"]').value = data.cnae_code;
            }
            if (data.Tarifa) {
                const tarifaSelect = document.getElementById('createTarifaAcceso');
                tarifaSelect.value = data.Tarifa;
                // Trigger products reload
                await loadProducts();
            }

            // Fill consumption data
            if (data.kWhAnual_p1) document.querySelector('input[name="consumo_1"]').value = data.kWhAnual_p1;
            if (data.kWhAnual_p2) document.querySelector('input[name="consumo_2"]').value = data.kWhAnual_p2;
            if (data.kWhAnual_p3) document.querySelector('input[name="consumo_3"]').value = data.kWhAnual_p3;
            if (data.kWhAnual_p4) document.querySelector('input[name="consumo_4"]').value = data.kWhAnual_p4;
            if (data.kWhAnual_p5) document.querySelector('input[name="consumo_5"]').value = data.kWhAnual_p5;
            if (data.kWhAnual_p6) document.querySelector('input[name="consumo_6"]').value = data.kWhAnual_p6;

            // Fill power data
            if (data.Pot_Cont_P1) document.querySelector('input[name="potencia_contratada_1"]').value = data.Pot_Cont_P1;
            if (data.Pot_Cont_P2) document.querySelector('input[name="potencia_contratada_2"]').value = data.Pot_Cont_P2;
            if (data.Pot_Cont_P3) document.querySelector('input[name="potencia_contratada_3"]').value = data.Pot_Cont_P3;
            if (data.Pot_Cont_P4) document.querySelector('input[name="potencia_contratada_4"]').value = data.Pot_Cont_P4;
            if (data.Pot_Cont_P5) document.querySelector('input[name="potencia_contratada_5"]').value = data.Pot_Cont_P5;
            if (data.Pot_Cont_P6) document.querySelector('input[name="potencia_contratada_6"]').value = data.Pot_Cont_P6;

            alert('✅ Datos SIPS extraídos correctamente');
        } catch (error) {
            console.error('Error extracting SIPS data:', error);
            alert('❌ Error al extraer datos SIPS:\n\n' + error.message);
        } finally {
            extractBtn.disabled = false;
            extractBtn.innerHTML = originalText;
        }
    }

    // Global state for uploaded documents and renewal
    let uploadedDocuments = [];
    let isRenewalMode = false;
    let originalComercializadora = '';

    // Handle file upload in create form - convert to base64
    function handleFileUpload(files) {
        const filesList = document.getElementById('uploadedFilesList');

        Array.from(files).forEach(file => {
            const reader = new FileReader();

            reader.onload = function(e) {
                const ext = file.name.split('.').pop().toUpperCase();
                const size = (file.size / 1024).toFixed(1) + ' KB';
                const base64Data = e.target.result.split(',')[1]; // Remove data:...;base64, prefix

                // Store document data
                const docId = Date.now() + '_' + file.name;
                uploadedDocuments.push({
                    id: docId,
                    filename: file.name,
                    data: base64Data,
                    mimeType: file.type,
                    size: file.size
                });

                // Create visual element
                const fileItem = document.createElement('div');
                fileItem.className = 'document-item';
                fileItem.dataset.docId = docId;
                fileItem.innerHTML = `
                    <div class="document-icon ${['JPG', 'JPEG', 'PNG', 'GIF'].includes(ext) ? 'jpg' : ''}">${ext}</div>
                    <div class="document-info">
                        <div class="document-name">${escapeHtml(file.name)}</div>
                        <div class="document-size">${size}</div>
                    </div>
                    <button type="button" class="remove-file-btn" style="margin-left: auto; background: none; border: none; color: #e53e3e; cursor: pointer; font-size: 18px;">✕</button>
                `;

                fileItem.querySelector('.remove-file-btn').addEventListener('click', () => {
                    // Remove from array
                    uploadedDocuments = uploadedDocuments.filter(doc => doc.id !== docId);
                    fileItem.remove();
                });

                filesList.appendChild(fileItem);
            };

            reader.readAsDataURL(file);
        });
    }
    
    // Document download function
    function downloadDocument(url, filename) {
        // Open document URL directly (NODO serves via their API)
        const fullUrl = 'https://gaiag.nodogestion.com' + url;
        window.open(fullUrl, '_blank');
    }
    
    function populateContractDetail(data) {
        // NODO API returns array with {resultado, datos} structure
        let contract = {};
        
        if (Array.isArray(data) && data.length > 0 && data[0].datos) {
            contract = data[0].datos;
        } else if (data.datos) {
            contract = data.datos;
        } else if (data.data && data.data.datos) {
            contract = data.data.datos;
        } else {
            contract = data;
        }
        
        console.log('Parsed contract data:', contract);
        
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
        setText('detailTarifaAcceso', extractTarifaAcceso(contract.concepto) || '-');
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
        
        // Populate Datos de Consumo - Potencias
        setText('detailPotP1', formatDecimal(contract.potencia_contratada_1));
        setText('detailPotP2', formatDecimal(contract.potencia_contratada_2));
        setText('detailPotP3', formatDecimal(contract.potencia_contratada_3));
        setText('detailPotP4', formatDecimal(contract.potencia_contratada_4));
        setText('detailPotP5', formatDecimal(contract.potencia_contratada_5));
        setText('detailPotP6', formatDecimal(contract.potencia_contratada_6));
        
        // Populate Datos de Consumo - Consumos
        setText('detailConsP1', formatDecimal(contract.consumo_1));
        setText('detailConsP2', formatDecimal(contract.consumo_2));
        setText('detailConsP3', formatDecimal(contract.consumo_3));
        setText('detailConsP4', formatDecimal(contract.consumo_4));
        setText('detailConsP5', formatDecimal(contract.consumo_5));
        setText('detailConsP6', formatDecimal(contract.consumo_6));
        
        // Calculate total consumo
        const consumoTotal = parseFloat(contract.consumo) || 
            (parseFloat(contract.consumo_1 || 0) + parseFloat(contract.consumo_2 || 0) + 
             parseFloat(contract.consumo_3 || 0) + parseFloat(contract.consumo_4 || 0) + 
             parseFloat(contract.consumo_5 || 0) + parseFloat(contract.consumo_6 || 0));
        setText('detailConsumoTotal', formatNumber(consumoTotal) + ' kWh');
        
        // Populate Estado badge
        const estadoBadge = document.querySelector('.contract-id-badge');
        if (estadoBadge && contract.estado) {
            estadoBadge.innerHTML = `<span style="margin-right: 8px;">ID: ${contract.id || state.currentContractId || '-'}</span><span class="status-badge ${getStatusClass(contract.estado)}" style="font-size: 11px;">${contract.estado}</span>`;
        }
        
        // Populate Observaciones
        const obs = contract.observaciones || contract.observaciones_internas || '';
        document.getElementById('detailObservaciones').textContent = obs || 'Sin observaciones';
        
        // Populate Documentos
        const docsContainer = document.getElementById('detailDocumentos');
        const documentos = contract.documentacion || [];
        
        if (Array.isArray(documentos) && documentos.length > 0) {
            docsContainer.innerHTML = documentos.map((doc, index) => {
                const name = doc.nombre_original || doc.nombre || doc.filename || doc.name || 'Documento';
                const url = doc.url_descarga || '';
                const fecha = doc.fecha || '';
                const tipo = doc.tipo || '';
                const ext = name.split('.').pop().toUpperCase();
                const iconClass = ['JPG', 'JPEG', 'PNG', 'GIF'].includes(ext) ? 'jpg' : '';
                
                return `
                    <div class="document-item" data-url="${escapeHtml(url)}" data-name="${escapeHtml(name)}" onclick="window.tunergiaDownloadDoc('${escapeHtml(url)}', '${escapeHtml(name)}')">
                        <div class="document-icon ${iconClass}">${ext}</div>
                        <div class="document-info">
                            <div class="document-name">${escapeHtml(name)}</div>
                            <div class="document-size">${fecha} ${tipo ? '• ' + tipo : ''}</div>
                        </div>
                        <span class="download-icon">⬇️</span>
                    </div>
                `;
            }).join('');
        } else {
            docsContainer.innerHTML = '<p class="no-docs">No hay documentos adjuntos</p>';
        }
        
        // Populate Historial
        const historyContainer = document.getElementById('historyTimeline');
        const historial = contract.historico || [];
        
        if (Array.isArray(historial) && historial.length > 0) {
            historyContainer.innerHTML = historial.map(item => {
                return `
                    <div class="history-item">
                        <div class="history-date">${item.fecha || ''}</div>
                        <div class="history-action">${escapeHtml(item.accion || '')}</div>
                        <div class="history-detail">${escapeHtml(item.texto || '')}</div>
                        <div class="history-user">Por: ${escapeHtml(item.usuario || '')}</div>
                    </div>
                `;
            }).join('');
        } else {
            historyContainer.innerHTML = '<p class="no-history">No hay historial disponible para este contrato</p>';
        }
    }
    
    function extractTarifaAcceso(concepto) {
        if (!concepto) return null;
        const match = concepto.match(/(\d\.\d[A-Z]+)/);
        return match ? match[1] : null;
    }
    
    function formatDecimal(value) {
        if (value === null || value === undefined || value === '') return '0.00';
        const num = parseFloat(value);
        return isNaN(num) ? '0.00' : num.toFixed(2);
    }
    
    function setText(elementId, value) {
        const el = document.getElementById(elementId);
        if (el) {
            el.textContent = value || '-';
        }
    }
    
    async function executeQuery(query) {
        console.log('Executing query:', query);
        
        const response = await fetch(CONFIG.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Raw webhook response:', result);
        
        let data = [];
        
        // Case 1: Response has 'data' array (aggregated by Code node)
        if (result && result.data && Array.isArray(result.data)) {
            console.log('Found result.data array with', result.data.length, 'items');
            data = result.data;
        }
        // Case 2: Direct array of results
        else if (Array.isArray(result)) {
            console.log('Direct array response with', result.length, 'items');
            if (result.length > 0 && result[0] && result[0].json) {
                data = result.map(item => item.json);
            } else {
                data = result;
            }
        }
        // Case 3: Single object (fallback for old format - first item only)
        else if (result && typeof result === 'object') {
            console.log('Single object response (old format)');
            if (result.id || result.estado || result.cups || result.cliente || result.count) {
                data = [result];
            }
        }
        
        console.log('Final parsed data:', data.length, 'items');
        return data;
    }
    
    function applyFilters() {
        let filtered = [...state.contracts];
        
        // Apply tab filter with correct business logic
        if (state.currentFilter !== 'all') {
            filtered = filtered.filter(c => {
                const estado = (c.estado || '').toUpperCase();
                // Check for valid dates (not null, empty, or 0000-00-00)
                const hasActivacion = c.fecha_activacion && 
                    c.fecha_activacion !== '' && 
                    c.fecha_activacion !== null &&
                    c.fecha_activacion !== '0000-00-00';
                const hasCancelacion = c.fecha_cancelacion && 
                    c.fecha_cancelacion !== '' && 
                    c.fecha_cancelacion !== null &&
                    c.fecha_cancelacion !== '0000-00-00';
                
                switch (state.currentFilter) {
                    case 'activado': 
                        // Active: has activation date, no cancellation, active estado
                        return hasActivacion && !hasCancelacion && estado.includes('ACTIVADO');
                    case 'tramitado': 
                        // In process: no activation date, no cancellation date, pending estados
                        // Includes: TEMPORAL, PDTE*, PENDIENTE*, INCIDENCIA*, TRAMITADO, VALIDADO, FIRMA, LISTO
                        return !hasActivacion && !hasCancelacion && (
                            estado.includes('TEMPORAL') ||
                            estado.includes('INCIDENCIA') ||
                            estado.includes('PDTE') ||
                            estado.includes('PENDIENTE') ||
                            estado.includes('TRAMITADO') ||
                            estado.includes('VALIDADO') ||
                            estado.includes('FIRMA') ||
                            estado.includes('LISTO')
                        );
                    case 'baja': 
                        // Cancelled: has cancellation date
                        return hasCancelacion;
                    case 'oportunidad': 
                        // Oportunidad includes:
                        // 1. NO RENOVADO contracts
                        // 2. Active contracts approaching 1 year anniversary (within 3 months)
                        if (estado === 'NO RENOVADO') return true;
                        if (estado === 'INTERESADO' || estado.includes('OPORTUNIDAD') || estado === 'LISTO GESTION') return true;
                        
                        // Check if active contract is within 3 months of 1 year anniversary
                        if (hasActivacion && estado.includes('ACTIVADO')) {
                            const activacionDate = parseDate(c.fecha_activacion);
                            if (activacionDate) {
                                const now = new Date();
                                const oneYearAgo = new Date(now);
                                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                                const threeMonthsBeforeNow = new Date(now);
                                threeMonthsBeforeNow.setMonth(threeMonthsBeforeNow.getMonth() - 3);
                                
                                // Contract is due for renewal if activation date is between 9-12 months ago
                                const nineMonthsAgo = new Date(now);
                                nineMonthsAgo.setMonth(nineMonthsAgo.getMonth() - 9);
                                const twelveMonthsAgo = new Date(now);
                                twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
                                
                                // If activated between 9 and 12 months ago, it's approaching anniversary
                                if (activacionDate <= nineMonthsAgo && activacionDate >= twelveMonthsAgo) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    default: 
                        return true;
                }
            });
        }
        
        // Apply search
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
            }
            
            if (valA < valB) return state.sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return state.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        
        state.filteredContracts = filtered;
        state.currentPage = 1;
        
        // Update filtered count display
        const filteredCount = document.getElementById('filteredCount');
        if (filteredCount) {
            if (state.currentFilter !== 'all' || state.searchTerm) {
                filteredCount.textContent = `(${formatNumber(filtered.length)} mostrados)`;
                filteredCount.style.display = 'inline';
            } else {
                filteredCount.style.display = 'none';
            }
        }
        
        renderContracts();
        updatePagination();
    }
    
    function renderContracts() {
        const tbody = document.getElementById('contractsTableBody');
        const startIndex = (state.currentPage - 1) * CONFIG.itemsPerPage;
        const endIndex = startIndex + CONFIG.itemsPerPage;
        const pageContracts = state.filteredContracts.slice(startIndex, endIndex);
        
        if (pageContracts.length === 0) {
            showEmptyState(true);
            return;
        }
        
        showEmptyState(false);
        
        tbody.innerHTML = pageContracts.map(contract => `
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
                openContractDetail(id);
            });
        });
        
        // Add click handler for entire row
        tbody.querySelectorAll('tr[data-id]').forEach(row => {
            row.style.cursor = 'pointer';
            row.addEventListener('click', (e) => {
                // Don't trigger if clicking checkbox or button
                if (e.target.type === 'checkbox' || e.target.closest('.view-btn')) return;
                const id = row.dataset.id;
                if (id) openContractDetail(id);
            });
        });
        
        // Add checkbox handlers
        tbody.querySelectorAll('.row-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', updateSelectionInfo);
        });
    }
    
    // Selection management
    function updateSelectionInfo() {
        const checkboxes = document.querySelectorAll('.row-checkbox:checked');
        const selectedCount = checkboxes.length;
        const selectionInfo = document.getElementById('selectionInfo');
        const selectedCountSpan = document.getElementById('selectedCount');
        const selectAllBtn = document.getElementById('selectAllContracts');
        const selectAllCount = document.getElementById('selectAllCount');
        const exportBtn = document.getElementById('exportBtn');
        const selectAllCheckbox = document.getElementById('selectAll');
        
        if (selectedCount > 0) {
            selectionInfo.style.display = 'flex';
            selectedCountSpan.textContent = `${selectedCount} seleccionado${selectedCount > 1 ? 's' : ''}`;
            exportBtn.disabled = false;
            exportBtn.title = 'Exportar contratos seleccionados';
            
            // Show "Select all" button if there are more contracts than currently visible
            const visibleCount = document.querySelectorAll('.row-checkbox').length;
            if (state.selectAllMode) {
                selectedCountSpan.textContent = `${state.filteredContracts.length} seleccionados (todos)`;
                selectAllBtn.style.display = 'none';
            } else if (selectedCount === visibleCount && state.filteredContracts.length > visibleCount) {
                selectAllBtn.style.display = 'inline-block';
                selectAllCount.textContent = state.filteredContracts.length;
            } else {
                selectAllBtn.style.display = 'none';
            }
        } else {
            selectionInfo.style.display = 'none';
            exportBtn.disabled = true;
            exportBtn.title = 'Selecciona contratos para exportar';
            state.selectAllMode = false;
        }
        
        // Update selectAll checkbox state
        const allCheckboxes = document.querySelectorAll('.row-checkbox');
        if (allCheckboxes.length > 0) {
            selectAllCheckbox.checked = selectedCount === allCheckboxes.length;
            selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < allCheckboxes.length;
        }
    }
    
    function getStatusClass(estado) {
        if (!estado) return 'default';
        const s = estado.toUpperCase();
        
        if (s.includes('ACTIVADO')) return 'activado';
        if (s.includes('TRAMITADO')) return 'tramitado';
        if (s.includes('BAJA')) return 'baja';
        if (s.includes('INCIDENCIA')) return 'incidencia';
        if (s.includes('TEMPORAL')) return 'temporal';
        if (s.includes('PDTE') || s.includes('FIRMA')) return 'pdte-firma';
        if (s.includes('KO')) return 'ko';
        if (s.includes('NO RENOVADO')) return 'no-renovado';
        if (s.includes('INTERESADO') || s.includes('OPORTUNIDAD')) return 'oportunidad';
        
        return 'default';
    }
    
    function updatePagination() {
        const totalPages = Math.ceil(state.filteredContracts.length / CONFIG.itemsPerPage);
        document.getElementById('paginationInfo').textContent = `${state.currentPage} of ${totalPages || 1}`;
        document.getElementById('prevPage').disabled = state.currentPage <= 1;
        document.getElementById('nextPage').disabled = state.currentPage >= totalPages;
    }
    
    function setupEventListeners() {
        // Date filter buttons - ONLY affect stats, not contracts list
        document.querySelectorAll('.filter-btn[data-days]').forEach(btn => {
            btn.addEventListener('click', async () => {
                document.querySelectorAll('.filter-btn[data-days]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.dateFilter = parseInt(btn.dataset.days);
                // Only reload stats, not contracts
                showLoading(true);
                await loadStats();
                showLoading(false);
            });
        });
        
        // Tab filter buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.currentFilter = btn.dataset.filter;
                applyFilters();
            });
        });
        
        // Search input
        document.getElementById('searchInput').addEventListener('input', debounce((e) => {
            state.searchTerm = e.target.value;
            applyFilters();
        }, 300));
        
        // Pagination
        document.getElementById('prevPage').addEventListener('click', () => {
            if (state.currentPage > 1) {
                state.currentPage--;
                renderContracts();
                updatePagination();
            }
        });
        
        document.getElementById('nextPage').addEventListener('click', () => {
            const totalPages = Math.ceil(state.filteredContracts.length / CONFIG.itemsPerPage);
            if (state.currentPage < totalPages) {
                state.currentPage++;
                renderContracts();
                updatePagination();
            }
        });
        
        // Select all checkbox
        document.getElementById('selectAll').addEventListener('change', (e) => {
            state.selectAllMode = false;
            document.querySelectorAll('.row-checkbox').forEach(cb => {
                cb.checked = e.target.checked;
            });
            updateSelectionInfo();
        });
        
        // Select all contracts button (Gmail-style)
        document.getElementById('selectAllContracts').addEventListener('click', () => {
            state.selectAllMode = true;
            updateSelectionInfo();
        });
        
        // Create Contract button
        document.getElementById('createBtn').addEventListener('click', openCreateContract);
        
        // Sortable columns
        document.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const column = th.dataset.sort;
                if (state.sortColumn === column) {
                    state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    state.sortColumn = column;
                    state.sortDirection = 'asc';
                }
                applyFilters();
            });
        });
        
        // Export button
        document.getElementById('exportBtn').addEventListener('click', exportToCSV);
        
        // Contract Detail Modal - Back button
        const backBtn = document.getElementById('backToListBtn');
        if (backBtn) {
            backBtn.addEventListener('click', closeContractDetail);
        }

        // RENOVAR contract button
        const renovarBtn = document.getElementById('renovarContractBtn');
        if (renovarBtn) {
            renovarBtn.addEventListener('click', renovarContract);
        }
        
        // Contract Detail Modal - Overlay click to close
        const overlay = document.getElementById('contractDetailOverlay');
        if (overlay) {
            overlay.addEventListener('click', closeContractDetail);
        }
        
        // Contract Detail Modal - Tab switching
        document.querySelectorAll('.detail-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.dataset.tab;
                
                // Update active tab button
                document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Update active tab content
                document.querySelectorAll('.detail-tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                document.getElementById('tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1)).classList.add('active');
            });
        });
        
        // Close modal on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeContractDetail();
                closeCreateContract();
            }
        });
        
        // Create Contract Modal - Back button
        const backFromCreateBtn = document.getElementById('backFromCreateBtn');
        if (backFromCreateBtn) {
            backFromCreateBtn.addEventListener('click', closeCreateContract);
        }
        
        // Create Contract Modal - Cancel button
        const cancelCreateBtn = document.getElementById('cancelCreateBtn');
        if (cancelCreateBtn) {
            cancelCreateBtn.addEventListener('click', closeCreateContract);
        }
        
        // Create Contract Modal - Overlay click to close
        const createOverlay = document.getElementById('createContractOverlay');
        if (createOverlay) {
            createOverlay.addEventListener('click', closeCreateContract);
        }
        
        // Create Contract Modal - File upload handling
        const fileInput = document.getElementById('fileInput');
        const uploadArea = document.getElementById('uploadArea');
        
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                handleFileUpload(e.target.files);
            });
        }
        
        if (uploadArea) {
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#667eea';
                uploadArea.style.background = '#ebf4ff';
            });
            
            uploadArea.addEventListener('dragleave', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#e2e8f0';
                uploadArea.style.background = '#f7fafc';
            });
            
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#e2e8f0';
                uploadArea.style.background = '#f7fafc';
                handleFileUpload(e.dataTransfer.files);
            });
        }
        
        // Create Contract Form - Same as personal checkbox
        const sameAsPersonal = document.getElementById('sameAsPersonal');
        if (sameAsPersonal) {
            sameAsPersonal.addEventListener('change', (e) => {
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
        
        // Create Contract Form - Submit
        const createForm = document.getElementById('createContractForm');
        if (createForm) {
            createForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const submitBtn = document.getElementById('submitCreateBtn');
                const originalText = submitBtn.innerHTML;
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span>⏳</span> Creando contrato...';

                try {
                    const formData = new FormData(createForm);
                    const data = Object.fromEntries(formData.entries());

                    // Prepare contract data structure
                    const contractData = {
                        contract_data: {
                            titular: data.nombre_cliente || '',
                            nif: data.nif || '',
                            direccion_fiscal: data.direccion || '',
                            cp_fiscal: data.cp || '',
                            poblacion_fiscal: data.poblacion || '',
                            provincia_fiscal: data.provincia || '',
                            email: data.email || '',
                            movil: data.movil || '',
                            cups: data.cups || '',
                            comercializadora_actual: data.comercializadora_saliente || '',
                            direccion_suministro: data.direccion_suministro || '',
                            poblacion_suministro: data.poblacion_suministro || '',
                            provincia_suministro: data.provincia_suministro || '',
                            cp_suministro: data.cp_suministro || '',
                            iban: data.iban_contrato || '',
                            consumo_anual_kwh: data.consumo || 0,
                            potencia_p1: data.potencia_contratada_1 || 0,
                            potencia_p2: data.potencia_contratada_2 || 0,
                            potencia_p3: data.potencia_contratada_3 || 0,
                            potencia_p4: data.potencia_contratada_4 || 0,
                            potencia_p5: data.potencia_contratada_5 || 0,
                            potencia_p6: data.potencia_contratada_6 || 0,
                            consumo_p1: data.consumo_1 || 0,
                            consumo_p2: data.consumo_2 || 0,
                            consumo_p3: data.consumo_3 || 0,
                            consumo_p4: data.consumo_4 || 0,
                            consumo_p5: data.consumo_5 || 0,
                            consumo_p6: data.consumo_6 || 0,
                            tarifa_acceso: data.tarifa_acceso || ''
                        },
                        tipo_empresa: data.tipo_empresa || '',
                        telefono: data.movil || '',
                        comercializadora: data.comercializadora || '',
                        concepto: data.concepto || '',
                        cnae: data.cnae_actividad || '9820',
                        observaciones: data.observaciones || 'Contrato generado desde Tunerface',
                        tipo_contratacion: data.tipo_contratacion || '',
                        comercial: state.idComercial,
                        firma_digital: data.firma_digital || '0',
                        fact_electronica: data.fact_electronica || 'NO',
                        luz_autoconsumo: data.luz_autoconsumo || 'NO',
                        cambio_titular: data.cambio_titular || 'NO',
                        cambio_potencia: data.cambio_potencia || 'NO',
                        documents: uploadedDocuments
                    };

                    // Send to crear-contrato-nodo webhook
                    const response = await fetch('https://tunuevaenergia.com/webhook/crear-contrato-nodo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(contractData)
                    });

                    if (response.ok) {
                        const result = await response.json();
                        alert('✅ Contrato creado exitosamente en NODO!\n\nID: ' + (result.id || 'Generado'));
                        closeCreateContract();
                        // Reload contracts to show the new one
                        await loadContracts();
                    } else if (response.status === 422) {
                        // Handle validation errors (product not valid, missing tarifa, etc.)
                        const errorData = await response.json();
                        let errorMessage = '❌ Error de validación:\n\n';

                        if (errorData.errores && Array.isArray(errorData.errores)) {
                            errorMessage += errorData.errores.join('\n\n');

                            // Check for specific error types
                            const errorString = errorData.errores.join(' ');
                            if (errorString.includes('Tarifa no encontrada') || errorString.includes('no encontrada')) {
                                errorMessage += '\n\n⚠️ El producto seleccionado ya no está disponible o le faltan detalles.\n\nPor favor, selecciona otro producto de la lista.';
                            }
                        } else if (errorData.resultado === 'error') {
                            errorMessage += 'El producto o tarifa seleccionado no es válido.';
                        } else {
                            errorMessage += await response.text();
                        }

                        alert(errorMessage);
                    } else {
                        const errorText = await response.text();
                        throw new Error(`Error del servidor: ${response.status} - ${errorText}`);
                    }
                } catch (error) {
                    console.error('Error creating contract:', error);
                    alert('❌ Error al crear el contrato:\n\n' + error.message + '\n\nPor favor, revisa los datos e intenta nuevamente.');
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                }
            });
        }

        // Add event listeners for product filtering
        const tipoClienteSelect = document.getElementById('createTipoCliente');
        const comercializadoraSelect = document.getElementById('createComercializadora');
        const tarifaSelect = document.getElementById('createTarifaAcceso');

        if (tipoClienteSelect) {
            tipoClienteSelect.addEventListener('change', loadProducts);
        }
        if (comercializadoraSelect) {
            comercializadoraSelect.addEventListener('change', loadProducts);
        }
        if (tarifaSelect) {
            tarifaSelect.addEventListener('change', loadProducts);
        }

        // Add event listener for SIPS extraction button
        const extractSipsBtn = document.getElementById('extractSipsBtn');
        if (extractSipsBtn) {
            extractSipsBtn.addEventListener('click', extractSipsData);
        }
        
        // Global document download function - GET request with direct link (avoids CORS)
        window.tunergiaDownloadDoc = function(url, filename) {
            if (!url) {
                alert('URL de documento no disponible');
                return;
            }
            
            // Build the GET URL with query parameter
            const downloadUrl = `${CONFIG.documentWebhookUrl}?query=${encodeURIComponent(url)}`;
            
            // Create a temporary link element
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = filename || 'documento'; // Suggest filename
            link.target = '_blank'; // Fallback if download doesn't work
            
            // Trigger the download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
        
        // Date range inputs for contracts list
        const dateFromInput = document.getElementById('listDateFrom');
        const dateToInput = document.getElementById('listDateTo');
        const applyDateBtn = document.getElementById('applyDateFilter');
        const clearDateBtn = document.getElementById('clearDateFilter');
        
        if (applyDateBtn) {
            applyDateBtn.addEventListener('click', async () => {
                state.listDateFrom = dateFromInput.value || null;
                state.listDateTo = dateToInput.value || null;
                showLoading(true);
                await loadContracts();
                showLoading(false);
            });
        }
        
        if (clearDateBtn) {
            clearDateBtn.addEventListener('click', async () => {
                dateFromInput.value = '';
                dateToInput.value = '';
                state.listDateFrom = null;
                state.listDateTo = null;
                showLoading(true);
                await loadContracts();
                showLoading(false);
            });
        }
        
        // Items per page selector
        const itemsPerPageSelect = document.getElementById('itemsPerPage');
        if (itemsPerPageSelect) {
            itemsPerPageSelect.addEventListener('change', (e) => {
                CONFIG.itemsPerPage = parseInt(e.target.value);
                state.currentPage = 1;
                renderContracts();
                updatePagination();
            });
        }
    }
    
    function exportToCSV() {
        let contractsToExport = [];
        
        if (state.selectAllMode) {
            // Export all filtered contracts
            contractsToExport = state.filteredContracts;
        } else {
            // Export only selected contracts
            const selectedIds = Array.from(document.querySelectorAll('.row-checkbox:checked'))
                .map(cb => cb.dataset.id);
            
            if (selectedIds.length === 0) {
                alert('Por favor, selecciona al menos un contrato para exportar');
                return;
            }
            
            contractsToExport = state.filteredContracts.filter(c => selectedIds.includes(c.id));
        }
        
        if (contractsToExport.length === 0) {
            alert('No hay datos para exportar');
            return;
        }
        
        const headers = ['ID', 'Cliente', 'Estado', 'Comercializadora', 'Tarifa Acceso', 'CUPS', 'Población', 'Provincia', 'Consumo', 'Fecha Creación', 'Fecha Activación'];
        const rows = contractsToExport.map(c => [
            c.id || '',
            c.cliente || '',
            c.estado || '',
            c.tipo || '',
            c.tarifa_acceso || '',
            c.cups || '',
            c.poblacion || '',
            c.provincia || '',
            c.consumo || '',
            c.fecha || '',
            c.fecha_activacion || ''
        ]);
        
        const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `contratos_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        
        // Reset selection after export
        state.selectAllMode = false;
        document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = false);
        document.getElementById('selectAll').checked = false;
        updateSelectionInfo();
    }
    
    // Utility functions
    function showLoading(show) {
        document.getElementById('dashboardLoading').classList.toggle('active', show);
    }
    
    function showError(message) {
        document.getElementById('errorText').textContent = message;
        document.getElementById('dashboardError').classList.add('active');
    }
    
    function showEmptyState(show) {
        document.getElementById('emptyState').style.display = show ? 'block' : 'none';
        document.querySelector('.contracts-table').style.display = show ? 'none' : 'table';
        document.getElementById('pagination').style.display = show ? 'none' : 'flex';
    }
    
    function formatNumber(num) {
        return new Intl.NumberFormat('es-ES').format(num);
    }
    
    function formatLargeNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1).replace('.', ',') + 'M';
        } else if (num >= 1000) {
            return formatNumber(Math.round(num));
        }
        return formatNumber(num);
    }
    
    function formatDate(dateStr) {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch {
            return '-';
        }
    }
    
    function parseDate(dateStr) {
        if (!dateStr || dateStr === '' || dateStr.startsWith('0000')) return null;
        try {
            // Handle DD/MM/YYYY format
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    return new Date(parts[2], parseInt(parts[1]) - 1, parts[0]);
                }
            }
            // Handle YYYY-MM-DD format
            return new Date(dateStr);
        } catch {
            return null;
        }
    }
    
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
})();
</script>
