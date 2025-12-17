/**
 * Tunergia Main Application
 * Entry point and initialization
 */

(async function() {
    'use strict';

    console.log('🚀 Tunergia Interface Loading...');
    console.log('Version: Modular 1.0.0');

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        await new Promise(resolve => {
            document.addEventListener('DOMContentLoaded', resolve);
        });
    }

    /**
     * Initialize application
     */
    async function init() {
        console.log('🔧 Initializing application...');

        window.TunergiaUI.showLoading(true);

        try {
            // Step 1: Load user info from Odoo session
            console.log('👤 Loading user info...');
            await window.TunergiaAPI.loadUserInfo();

            const idComercial = window.getState('idComercial');

            if (!idComercial) {
                console.warn('⚠️ No commercial ID found');
                window.TunergiaUI.showError('No se pudo obtener el ID del comercial. Por favor, contacta con soporte.');
                return;
            }

            console.log('✅ User loaded:', window.getState('currentUser'));
            console.log('✅ Commercial ID:', idComercial);

            // Step 2: Update user UI
            window.TunergiaUI.updateUserUI();

            // Step 3: Load dashboard data in parallel
            console.log('📊 Loading dashboard data...');
            await Promise.all([
                window.TunergiaUI.updateStatistics(),
                window.TunergiaAPI.loadContracts()
            ]);

            const contractCount = window.getState('contracts').length;
            console.log(`✅ Loaded ${contractCount} contracts`);

            // Step 4: Render UI
            window.TunergiaUI.renderContractsTable();

            // Step 5: Setup event listeners
            window.TunergiaUI.setupEventListeners();

            console.log('✅ Application ready!');

        } catch (error) {
            console.error('❌ Initialization error:', error);
            window.TunergiaUI.showError('Error al inicializar la aplicación: ' + error.message);
        } finally {
            window.TunergiaUI.showLoading(false);
        }
    }

    // Check all dependencies are loaded
    const checkDependencies = () => {
        const required = [
            'TunergiaConfig',
            'TunergiaState',
            'TunergiaUtils',
            'TunergiaAPI',
            'TunergiaUI'
        ];

        const missing = required.filter(dep => !window[dep]);

        if (missing.length > 0) {
            console.error('❌ Missing dependencies:', missing);
            alert(`Error: Missing modules - ${missing.join(', ')}\n\nPlease check that all script tags are loaded correctly.`);
            return false;
        }

        return true;
    };

    // Start application
    if (checkDependencies()) {
        console.log('✅ All dependencies loaded');
        await init();
    }

})();
