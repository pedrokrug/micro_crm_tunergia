/**
 * Tunergia Tabs Module
 * Handles navigation between Contratos and Comparador views
 */

(function() {
    'use strict';

    // State
    let currentView = 'contratos';
    let comparadorMode = 'comparison';
    let contractsContentLoaded = false;
    let comparadorContentLoaded = false;

    // DOM Elements
    const mainTabs = document.querySelectorAll('.main-tab');
    const viewPanels = document.querySelectorAll('.view-panel');
    const modeRadios = document.querySelectorAll('input[name="comparador-mode"]');

    /**
     * Switch between main views (Contratos / Comparador)
     */
    function switchView(viewName) {
        if (currentView === viewName) return;

        console.log(`Switching to view: ${viewName}`);
        currentView = viewName;

        // Update tabs
        mainTabs.forEach(tab => {
            const isActive = tab.dataset.view === viewName;
            tab.classList.toggle('active', isActive);
        });

        // Update view panels
        viewPanels.forEach(panel => {
            const panelView = panel.id.replace('view-', '');
            const isActive = panelView === viewName;
            panel.classList.toggle('active', isActive);
        });

        // Load content if not already loaded
        if (viewName === 'contratos' && !contractsContentLoaded) {
            loadContractsContent();
        } else if (viewName === 'comparador' && !comparadorContentLoaded) {
            loadComparadorContent();
        }

        // Save view preference
        localStorage.setItem('tunergia_current_view', viewName);
    }

    /**
     * Load Contratos module content
     */
    async function loadContractsContent() {
        try {
            const contractsModule = document.getElementById('contractsModule');
            const response = await fetch('./modules/contracts/contracts-content.html');
            const html = await response.text();
            contractsModule.innerHTML = html;
            contractsContentLoaded = true;

            // Initialize contracts module (if the existing JS is available)
            if (window.TunergiaCRM && window.TunergiaCRM.init) {
                window.TunergiaCRM.init();
            }

            console.log('Contracts content loaded');
        } catch (error) {
            console.error('Error loading contracts content:', error);
            document.getElementById('contractsModule').innerHTML =
                '<div class="error-message">Error al cargar el módulo de contratos</div>';
        }
    }

    /**
     * Load Comparador module content based on selected mode
     */
    async function loadComparadorContent() {
        try {
            const comparadorContent = document.getElementById('comparadorContent');

            // Show loading state
            comparadorContent.innerHTML = '<div class="loading-spinner"></div><p>Cargando comparador...</p>';

            // Load the comparador HTML
            const response = await fetch('./modules/comparador/comparador.html');
            const html = await response.text();

            // Wrap in container div
            comparadorContent.innerHTML = `<div id="comparador-tunergia">${html}</div>`;

            // Load comparador CSS if not already loaded
            if (!document.getElementById('comparador-css')) {
                const link = document.createElement('link');
                link.id = 'comparador-css';
                link.rel = 'stylesheet';
                link.href = './modules/comparador/comparador.css';
                document.head.appendChild(link);
            }

            // Load comparador JS
            if (!window.ComparadorTunergia) {
                const script = document.createElement('script');
                script.src = './modules/comparador/comparador.js';
                script.onload = () => {
                    console.log('Comparador script loaded');
                    applyComparadorMode(comparadorMode);
                };
                document.head.appendChild(script);
            } else {
                applyComparadorMode(comparadorMode);
            }

            comparadorContentLoaded = true;
            console.log('Comparador content loaded');
        } catch (error) {
            console.error('Error loading comparador content:', error);
            document.getElementById('comparadorContent').innerHTML =
                '<div class="error-message">Error al cargar el comparador</div>';
        }
    }

    /**
     * Apply the selected comparador mode
     */
    function applyComparadorMode(mode) {
        comparadorMode = mode;
        console.log(`Applying comparador mode: ${mode}`);

        const comparadorContainer = document.getElementById('comparador-tunergia');
        if (!comparadorContainer) return;

        // Apply mode-specific classes and configurations
        comparadorContainer.classList.remove('mode-comparison', 'mode-power-only', 'mode-both');
        comparadorContainer.classList.add(`mode-${mode}`);

        // Mode-specific logic
        switch (mode) {
            case 'comparison':
                // Standard comparison mode (default)
                // Power analysis is optional via checkbox
                break;

            case 'power-only':
                // Only power analysis mode
                // Hide comparison options, focus on power analysis
                hideComparisonOptions();
                forcePowerAnalysis();
                break;

            case 'both':
                // Full mode: comparison + automatic power analysis
                forcePowerAnalysis();
                break;
        }

        localStorage.setItem('tunergia_comparador_mode', mode);
    }

    /**
     * Hide comparison-specific options for power-only mode
     */
    function hideComparisonOptions() {
        // Hide company selector
        const companySelector = document.getElementById('companySelector');
        if (companySelector) {
            companySelector.style.display = 'none';
        }

        // Hide product type radios
        const productTypeSection = document.querySelector('.config-section');
        if (productTypeSection) {
            productTypeSection.style.display = 'none';
        }
    }

    /**
     * Force power analysis to be enabled
     */
    function forcePowerAnalysis() {
        const powerCheckbox = document.getElementById('power-analysis-checkbox');
        if (powerCheckbox) {
            powerCheckbox.checked = true;
            powerCheckbox.disabled = true;
        }
    }

    /**
     * Initialize tabs module
     */
    function init() {
        console.log('Initializing Tunergia Tabs');

        // Add tab click listeners
        mainTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                switchView(tab.dataset.view);
            });
        });

        // Add mode radio listeners
        modeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const newMode = e.target.value;
                    if (comparadorContentLoaded) {
                        applyComparadorMode(newMode);
                    } else {
                        comparadorMode = newMode;
                    }
                }
            });
        });

        // Restore previous view if exists
        const savedView = localStorage.getItem('tunergia_current_view');
        const savedMode = localStorage.getItem('tunergia_comparador_mode');

        if (savedMode) {
            comparadorMode = savedMode;
            const modeRadio = document.querySelector(`input[name="comparador-mode"][value="${savedMode}"]`);
            if (modeRadio) modeRadio.checked = true;
        }

        if (savedView && savedView !== 'contratos') {
            switchView(savedView);
        } else {
            // Load contracts content by default
            loadContractsContent();
        }
    }

    // Export functions to global scope
    window.TunergiaTabs = {
        init,
        switchView,
        applyComparadorMode
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
