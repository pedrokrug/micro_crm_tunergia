/**
 * Tunergia CRM - Core Module
 * Configuration, State Management, and Utility Functions
 * Version: 2.0.0 (Production)
 */

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        webhookUrl: 'https://tunuevaenergia.com/webhook/59200adf-d6df-4dd2-b319-5ab57d2e5052',
        nodoWebhookUrl: 'https://tunuevaenergia.com/webhook/nodo',
        documentWebhookUrl: 'https://tunuevaenergia.com/webhook/documento-nodo',
        sipsWebhookUrl: 'https://tunuevaenergia.com/webhook/SIPS-contrato-nodo',
        crearContratoUrl: 'https://tunuevaenergia.com/webhook/crear-contrato-nodo',
        bigQueryTable: '`tunergia-1722509306765.NODO.Contratos_Comisiones`',
        productosTable: '`tunergia-1722509306765.Precios_Tunergia.Tarifas Fijas Portfolio`',
        itemsPerPage: 10
    };

    // ============================================
    // STATE
    // ============================================
    const state = {
        currentUser: null,
        idComercial: null,
        contracts: [],
        filteredContracts: [],
        currentPage: 1,
        currentFilter: 'all',
        searchTerm: '',
        sortColumn: 'fecha',
        sortDirection: 'desc',
        dateFilter: 30,
        listDateFrom: null,
        listDateTo: null,
        contractsLimit: 500,
        totalContracts: 0,
        currentContractId: null,
        selectAllMode: false
    };

    // Document upload state
    let uploadedDocuments = [];
    let isRenewalMode = false;
    let originalComercializadora = '';

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

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
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    return new Date(parts[2], parseInt(parts[1]) - 1, parts[0]);
                }
            }
            return new Date(dateStr);
        } catch {
            return null;
        }
    }

    function formatDecimal(value) {
        if (value === null || value === undefined || value === '') return '0.00';
        const num = parseFloat(value);
        return isNaN(num) ? '0.00' : num.toFixed(2);
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

    function getInitials(name) {
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }

    function setText(elementId, value) {
        const el = document.getElementById(elementId);
        if (el) {
            el.textContent = value || '-';
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

    function matchComercializadora(name1, name2) {
        if (!name1 || !name2) return false;
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
        return norm1 === norm2 || norm1.includes(norm2) || norm2.includes(norm1);
    }

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

    // ============================================
    // EXPORT TO GLOBAL NAMESPACE
    // ============================================
    window.Tunergia = window.Tunergia || {};

    // Export CONFIG (read-only copy for other modules)
    window.Tunergia.CONFIG = CONFIG;

    // Export state with getter/setter
    window.Tunergia.state = state;
    window.Tunergia.getState = function(key) {
        return key ? state[key] : state;
    };
    window.Tunergia.setState = function(updates) {
        Object.assign(state, updates);
    };

    // Export document state
    window.Tunergia.getUploadedDocuments = function() { return uploadedDocuments; };
    window.Tunergia.setUploadedDocuments = function(docs) { uploadedDocuments = docs; };
    window.Tunergia.addUploadedDocument = function(doc) { uploadedDocuments.push(doc); };
    window.Tunergia.removeUploadedDocument = function(docId) {
        uploadedDocuments = uploadedDocuments.filter(d => d.id !== docId);
    };
    window.Tunergia.clearUploadedDocuments = function() { uploadedDocuments = []; };

    window.Tunergia.isRenewalMode = function() { return isRenewalMode; };
    window.Tunergia.setRenewalMode = function(mode) { isRenewalMode = mode; };
    window.Tunergia.getOriginalComercializadora = function() { return originalComercializadora; };
    window.Tunergia.setOriginalComercializadora = function(com) { originalComercializadora = com; };

    // Export utility functions
    window.Tunergia.utils = {
        formatNumber,
        formatLargeNumber,
        formatDate,
        parseDate,
        formatDecimal,
        escapeHtml,
        debounce,
        getInitials,
        setText,
        getStatusClass,
        showLoading,
        showError,
        showEmptyState,
        matchComercializadora,
        extractTarifaAcceso
    };

    console.log('Tunergia Core v2.0.0 loaded');
})();
