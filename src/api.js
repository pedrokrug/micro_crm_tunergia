/**
 * Tunergia API Module
 * All API calls to BigQuery, NODO, SIPS, and Odoo
 */

window.TunergiaAPI = {

    /**
     * Execute BigQuery query via webhook
     * Handles multiple n8n response formats
     */
    async executeQuery(query) {
        console.log('Executing query:', query);

        const response = await fetch(window.TunergiaConfig.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        if (!response.ok) {
            throw new Error(`Query failed: ${response.status}`);
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
            // Check if items have .json property (n8n format)
            if (result.length > 0 && result[0] && result[0].json) {
                data = result.map(item => item.json);
            } else {
                data = result;
            }
        }
        // Case 3: Single object (fallback for old format)
        else if (result && typeof result === 'object') {
            console.log('Single object response (old format)');
            if (result.id || result.estado || result.cups || result.cliente || result.total) {
                data = [result];
            }
        }

        console.log('Final parsed data:', data.length, 'items');
        return data;
    },

    /**
     * Load user info from Odoo session
     */
    async loadUserInfo() {
        try {
            // Get Odoo session
            const sessionResponse = await fetch('/web/session/get_session_info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {} })
            });

            const sessionData = await sessionResponse.json();

            if (sessionData.result && sessionData.result.uid) {
                window.setState({
                    currentUser: {
                        uid: sessionData.result.uid,
                        name: sessionData.result.name || 'Usuario',
                        email: sessionData.result.username || ''
                    }
                });

                // Get partner ID
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

                    // Get ID Comercial
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
                        window.setState({
                            idComercial: contactData.result[0].x_studio_persona_de_contacto
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error loading user info:', error);
            // Demo mode for testing
            window.setState({
                currentUser: { name: 'Demo User', email: 'demo@tunergia.es' },
                idComercial: null
            });
        }
    },

    /**
     * Load contracts from BigQuery
     */
    async loadContracts() {
        const countQuery = `
            SELECT COUNT(*) as total
            FROM ${window.TunergiaConfig.bigQueryTable}
            WHERE (borrado = 0 OR borrado IS NULL)
                AND id_comercial = '${window.getState('idComercial')}'
        `;

        const countData = await this.executeQuery(countQuery);
        const totalCount = countData[0] ? parseInt(countData[0].total) || 0 : 0;
        window.setState({ totalContracts: totalCount });

        // Load contracts
        const query = `
            SELECT
                id, tipo, estado, fecha, cups, cliente, poblacion, provincia,
                consumo, fecha_activacion, fecha_cancelacion, tarifa, tarifa_acceso, observaciones
            FROM ${window.TunergiaConfig.bigQueryTable}
            WHERE (borrado = 0 OR borrado IS NULL)
                AND id_comercial = '${window.getState('idComercial')}'
            ORDER BY fecha DESC
            LIMIT ${window.getState('contractsLimit')}
        `;

        const data = await this.executeQuery(query);
        window.setState({
            contracts: data,
            filteredContracts: [...data]
        });

        return data;
    },

    /**
     * Get contract detail from NODO
     */
    async getContractDetail(contractId) {
        const response = await fetch(window.TunergiaConfig.nodoWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: contractId })
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.status}`);
        }

        return await response.json();
    },

    /**
     * Create new contract in NODO
     */
    async createContract(contractData) {
        const response = await fetch(window.TunergiaConfig.crearContratoUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(contractData)
        });

        if (response.status === 422) {
            const errorData = await response.json();
            let errorMessage = 'Error de validación en el contrato:\n\n';

            if (errorData.errors && Array.isArray(errorData.errors)) {
                errorMessage += errorData.errors.map(err => `• ${err.message || err}`).join('\n');
            } else if (errorData.message) {
                errorMessage += errorData.message;
            } else {
                errorMessage += 'Por favor, verifica que todos los campos requeridos estén correctos.';
            }

            throw new Error(errorMessage);
        }

        if (!response.ok) {
            throw new Error('Error al crear el contrato');
        }

        return await response.json();
    },

    /**
     * Extract SIPS data for CUPS
     */
    async extractSipsData(cups) {
        const response = await fetch(window.TunergiaConfig.sipsWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cups })
        });

        if (!response.ok) {
            throw new Error('Error al extraer datos SIPS');
        }

        return await response.json();
    },

    /**
     * Load comercializadoras from BigQuery
     */
    async loadComercializadoras() {
        const query = `
            SELECT DISTINCT COMPA____A
            FROM ${window.TunergiaConfig.productosTable}
            WHERE COMPA____A IS NOT NULL
            ORDER BY COMPA____A
        `;

        const result = await this.executeQuery(query);
        return result.map(item => item.COMPA____A).filter(Boolean);
    },

    /**
     * Load products with vigency date filtering
     */
    async loadProducts(tipoCliente, comercializadora, tarifa) {
        const today = new Date().toISOString().split('T')[0];

        // Map tipo_cliente
        const mappedTypes = window.TunergiaUtils.mapTipoCliente(tipoCliente);
        let typeFilter = '';

        if (Array.isArray(mappedTypes)) {
            typeFilter = mappedTypes.map(t => `TIPO_DE_CLIENTE = '${t}'`).join(' OR ');
        } else {
            typeFilter = `TIPO_DE_CLIENTE = '${mappedTypes}'`;
        }

        const query = `
            SELECT DISTINCT PRODUCTO, TARIFA, TIPO_DE_CLIENTE, INICIO_VIGENCIA, FIN_VIGENCIA
            FROM ${window.TunergiaConfig.productosTable}
            WHERE COMPA____A = '${comercializadora}'
                AND TARIFA = '${tarifa}'
                AND (${typeFilter})
                AND (INICIO_VIGENCIA IS NULL OR INICIO_VIGENCIA <= '${today}')
                AND (FIN_VIGENCIA IS NULL OR FIN_VIGENCIA >= '${today}')
            ORDER BY PRODUCTO
        `;

        const result = await this.executeQuery(query);
        return result;
    }
};

console.log('✅ API loaded');
