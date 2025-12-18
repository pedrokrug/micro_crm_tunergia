/**
 * Tunergia Utility Functions
 * Helper functions for formatting, parsing, and string manipulation
 */

window.TunergiaUtils = {

    /**
     * Get user initials from full name
     */
    getInitials(name) {
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    },

    /**
     * Format number with Spanish locale
     */
    formatNumber(num) {
        return new Intl.NumberFormat('es-ES').format(num);
    },

    /**
     * Format large numbers with K/M suffix
     */
    formatLargeNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1).replace('.', ',') + 'M';
        } else if (num >= 1000) {
            return this.formatNumber(Math.round(num));
        }
        return this.formatNumber(num);
    },

    /**
     * Format date to Spanish format DD/MM/YYYY
     */
    formatDate(dateStr) {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch {
            return '-';
        }
    },

    /**
     * Parse date from various formats
     */
    parseDate(dateStr) {
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
    },

    /**
     * Smart comercializadora name matching
     * Handles variations like CONTIGO_ENERGIA vs CONTIGO_ENERGIA_GAIAG
     */
    matchComercializadora(name1, name2) {
        if (!name1 || !name2) return false;

        // Normalize names: remove underscores, _GAIAG suffix, convert to uppercase, remove extra spaces
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
    },

    /**
     * Extract tarifa de acceso from concepto string
     * e.g., "2.0TD - FIXED - BRISA - S42" -> "2.0TD"
     */
    extractTarifaAcceso(concepto) {
        if (!concepto) return '';
        const tarifas = ['2.0TD', '3.0TD', '6.1TD', 'RL.1', 'RL.2', 'RL.3'];
        for (let tarifa of tarifas) {
            if (concepto.includes(tarifa)) {
                return tarifa;
            }
        }
        return '';
    },

    /**
     * Safe numeric parsing for contract data
     */
    parseNumeric(value) {
        if (value === null || value === undefined || value === '') return 0;
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0 : parsed;
    },

    /**
     * Map UI customer type to BigQuery filter value
     */
    mapTipoCliente(tipoEmpresa) {
        const typeMapping = {
            'PARTICULAR': 'Residencial',
            'AUTONOMO': ['Empresa', 'CCPP'],
            'EMPRESA': 'EMPRESA',
            'CCPP': 'TODO'
        };
        return typeMapping[tipoEmpresa] || typeMapping['PARTICULAR'];
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Get CSS class for contract status badge
     */
    getStatusClass(estado) {
        if (!estado) return 'default';
        const estadoUpper = estado.toUpperCase();

        // Oportunidad takes priority
        if (estadoUpper === 'NO RENOVADO' || estadoUpper === 'INTERESADO' ||
            estadoUpper === 'LISTO GESTION' || estadoUpper.includes('OPORTUNIDAD')) {
            return 'oportunidad';
        }

        if (estadoUpper.includes('ACTIVADO')) return 'activado';
        if (estadoUpper.includes('BAJA') || estadoUpper.includes('CANCELADO')) return 'baja';
        if (estadoUpper.includes('INCIDENCIA')) return 'incidencia';
        if (estadoUpper.includes('TEMPORAL')) return 'temporal';
        if (estadoUpper.includes('PDTE') || estadoUpper.includes('FIRMA')) return 'pdte-firma';
        if (estadoUpper.includes('KO')) return 'ko';
        if (estadoUpper.includes('TRAMITADO') || estadoUpper.includes('PENDIENTE') ||
            estadoUpper.includes('VALIDADO') || estadoUpper.includes('LISTO')) return 'tramitado';

        return 'default';
    }
};

console.log('✅ Utils loaded');
