/**
 * Tunergia CRM - API Module
 * All API calls, webhooks, and data fetching
 * Version: 2.0.0 (Production)
 */

(function() {
    'use strict';

    const T = window.Tunergia;
    const CONFIG = T.CONFIG;
    const state = T.state;
    const utils = T.utils;

    // ============================================
    // CORE API FUNCTIONS
    // ============================================

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
        // Case 3: Single object (fallback for old format)
        else if (result && typeof result === 'object') {
            console.log('Single object response (old format)');
            if (result.id || result.estado || result.cups || result.cliente || result.count) {
                data = [result];
            }
        }

        console.log('Final parsed data:', data.length, 'items');
        return data;
    }

    // ============================================
    // USER & AUTH
    // ============================================

    async function loadUserInfo() {
        try {
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

                // Get partner_id from res.users
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

                    // Get x_studio_persona_de_contacto from res.partner
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

                T.ui.updateUserUI();
            }
        } catch (error) {
            console.error('Error loading user info:', error);
            state.currentUser = { name: 'Demo User', email: 'demo@tunergia.es' };
            state.idComercial = null;
            T.ui.updateUserUI();
        }
    }

    // ============================================
    // DASHBOARD DATA
    // ============================================

    async function loadDashboardData() {
        console.log('Loading dashboard data for id_comercial:', state.idComercial);
        await Promise.all([
            loadStats(),
            loadContracts()
        ]);
    }

    async function loadStats() {
        try {
            const now = new Date();
            const currentStart = new Date();
            currentStart.setDate(now.getDate() - state.dateFilter);
            const currentStartStr = currentStart.toISOString().split('T')[0];
            const previousStart = new Date(currentStart);
            previousStart.setDate(previousStart.getDate() - state.dateFilter);
            const previousStartStr = previousStart.toISOString().split('T')[0];

            console.log('Date ranges:', { currentStartStr, previousStartStr });

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

                // EN TRAMITACION
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

            // Update stats UI
            document.getElementById('statTramitados').textContent = utils.formatNumber(tramitados);
            document.getElementById('statActivados').textContent = utils.formatNumber(activadosCurrent);
            document.getElementById('statBajas').textContent = utils.formatNumber(bajasCurrent);
            document.getElementById('statKwhTramitacion').textContent = utils.formatLargeNumber(kwhTramitados);
            document.getElementById('statKwhActivados').textContent = utils.formatLargeNumber(kwhActivadosCurrent);
            document.getElementById('statKwhBajas').textContent = utils.formatLargeNumber(kwhBajasCurrent);

            // Update comparison indicators
            const updateChangeEl = (id, change, invertPositivity = false) => {
                const el = document.getElementById(id);
                if (!el) return;
                const isPositive = invertPositivity ? parseFloat(change) <= 0 : parseFloat(change) >= 0;
                el.className = 'stat-change ' + (isPositive ? 'positive' : 'negative');
                el.innerHTML = '<span class="change-icon">' + (parseFloat(change) >= 0 ? '↑' : '↓') + '</span><span>' + Math.abs(change) + '% vs período anterior</span>';
            };

            updateChangeEl('changeActivados', activadosChange);
            updateChangeEl('changeKwhActivados', kwhActivadosChange);
            updateChangeEl('changeBajas', bajasChange, true);
            updateChangeEl('changeKwhBajas', kwhBajasChange, true);

        } catch (error) {
            console.error('Error loading stats:', error);
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
            // Get total count
            const countQuery = `
                SELECT COUNT(*) as total
                FROM ${CONFIG.bigQueryTable}
                WHERE (borrado = 0 OR borrado IS NULL)
                    AND id_comercial = '${state.idComercial}'
            `;

            const countData = await executeQuery(countQuery);
            const totalCount = countData[0] ? parseInt(countData[0].total) || 0 : 0;
            state.totalContracts = totalCount;

            document.getElementById('totalContracts').textContent = `${utils.formatNumber(totalCount)} Contratos`;

            // Build date filter
            let dateFilter = '';
            if (state.listDateFrom || state.listDateTo) {
                if (state.listDateFrom) {
                    dateFilter += ` AND fecha >= '${state.listDateFrom}'`;
                }
                if (state.listDateTo) {
                    dateFilter += ` AND fecha <= '${state.listDateTo}'`;
                }
            }

            // Load contracts
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
                utils.showEmptyState(true);
                return;
            }

            state.contracts = data;
            state.filteredContracts = [...data];

            T.ui.updateLoadMoreButton();
            T.ui.applyFilters();

        } catch (error) {
            console.error('Error loading contracts:', error);
            utils.showEmptyState(true);
        }
    }

    // ============================================
    // CONTRACT DETAIL
    // ============================================

    async function getContractDetail(contractId) {
        const response = await fetch(CONFIG.nodoWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: contractId })
        });

        if (!response.ok) {
            throw new Error(`Error del servidor: ${response.status}`);
        }

        return await response.json();
    }

    function parseContractData(data) {
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

        return contract;
    }

    // ============================================
    // COMERCIALIZADORAS & PRODUCTS
    // ============================================

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

    async function loadProducts() {
        const tipoCliente = document.getElementById('createTipoCliente').value;
        const comercializadora = document.getElementById('createComercializadora').value;
        const tarifa = document.getElementById('createTarifaAcceso').value;
        const productoSelect = document.getElementById('createProducto');

        if (!comercializadora || !tarifa) {
            productoSelect.disabled = true;
            productoSelect.innerHTML = '<option value="">Selecciona comercializadora y tarifa primero...</option>';
            return;
        }

        productoSelect.innerHTML = '<option value="">Cargando productos...</option>';
        productoSelect.disabled = true;

        try {
            const tipoClienteMap = {
                'PARTICULAR': 'Residencial',
                'AUTONOMO': 'Empresa;CCPP',
                'EMPRESA': 'EMPRESA',
                'CCPP': 'TODO'
            };

            const tipoClienteValue = tipoClienteMap[tipoCliente] || tipoCliente;
            const today = new Date().toISOString().split('T')[0];

            let query = `SELECT DISTINCT PRODUCTO, TARIFA, TIPO_DE_CLIENTE, INICIO_VIGENCIA, FIN_VIGENCIA FROM ${CONFIG.productosTable} WHERE COMPA____A = '${comercializadora}' AND TARIFA = '${tarifa}'`;
            query += ` AND (INICIO_VIGENCIA IS NULL OR INICIO_VIGENCIA <= '${today}')`;
            query += ` AND (FIN_VIGENCIA IS NULL OR FIN_VIGENCIA >= '${today}')`;

            if (tipoCliente) {
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

    // ============================================
    // SIPS EXTRACTION
    // ============================================

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
            const response = await fetch(CONFIG.sipsWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cups: cups })
            });

            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status}`);
            }

            const result = await response.json();
            const data = Array.isArray(result) ? result[0] : result;

            // Fill form with SIPS data
            if (data.kWhAnual) {
                document.querySelector('input[name="consumo"]').value = data.kWhAnual;
            }
            if (data.cnae_code) {
                document.querySelector('input[name="cnae_actividad"]').value = data.cnae_code;
            }
            if (data.Tarifa) {
                const tarifaSelect = document.getElementById('createTarifaAcceso');
                tarifaSelect.value = data.Tarifa;
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

    // ============================================
    // CONTRACT CREATION
    // ============================================

    async function createContract(formData) {
        const data = Object.fromEntries(formData.entries());
        const uploadedDocs = T.getUploadedDocuments();

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
            documents: uploadedDocs
        };

        const response = await fetch(CONFIG.crearContratoUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(contractData)
        });

        if (response.ok) {
            return await response.json();
        } else if (response.status === 422) {
            const errorData = await response.json();
            let errorMessage = '❌ Error de validación:\n\n';

            if (errorData.errores && Array.isArray(errorData.errores)) {
                errorMessage += errorData.errores.join('\n\n');
                const errorString = errorData.errores.join(' ');
                if (errorString.includes('Tarifa no encontrada') || errorString.includes('no encontrada')) {
                    errorMessage += '\n\n⚠️ El producto seleccionado ya no está disponible o le faltan detalles.\n\nPor favor, selecciona otro producto de la lista.';
                }
            } else if (errorData.resultado === 'error') {
                errorMessage += 'El producto o tarifa seleccionado no es válido.';
            } else {
                errorMessage += await response.text();
            }

            throw new Error(errorMessage);
        } else {
            const errorText = await response.text();
            throw new Error(`Error del servidor: ${response.status} - ${errorText}`);
        }
    }

    // ============================================
    // EXPORT TO GLOBAL NAMESPACE
    // ============================================

    T.api = {
        executeQuery,
        loadUserInfo,
        loadDashboardData,
        loadStats,
        loadContracts,
        getContractDetail,
        parseContractData,
        loadComercializadoras,
        loadProducts,
        extractSipsData,
        createContract
    };

    console.log('Tunergia API v2.0.0 loaded');
})();
