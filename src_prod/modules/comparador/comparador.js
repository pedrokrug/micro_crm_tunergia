    (function() {
      // Configuration - Updated: 2025-12-23
      const WEBHOOK_URL = 'https://tunuevaenergia.com/webhook/comparador_tunergia';
      const COMPANIES_WEBHOOK_URL = 'https://tunuevaenergia.com/webhook/get_companies';
      const PDF_WEBHOOK_URL = 'https://tunuevaenergia.com/webhook/generate-pdf-comparador';
      const HISTORY_WEBHOOK_URL = 'https://tunuevaenergia.com/webhook/comparador_history';
      const TURBO_TUN_WEBHOOK_URL = 'https://tunuevaenergia.com/webhook/comparador_custom_calculation';
      const MAX_FILE_SIZE = 5 * 1024 * 1024;
      const REQUEST_TIMEOUT = 120000;
      const PDF_TIMEOUT = 60000;
      
      let selectedFile = null;
      let currentComparisonData = null;
      let originalComparisonData = null;
      let uploadController = null;
      let availableCompanies = [];
      let selectedCompanies = [];
      let currentUser = null;
      let selectedOffersForPDF = [true, true, true];
      let currentCups = 'N/A';
      let historyData = [];
      let activeHistoryId = null;
      let powerAnalysisEnabled = false;
      
      // Track adjusted power values
      let adjustedPowerValues = null;
      let isUsingAdjustedPower = false;

      // Turbo Tun Mode variables
      let turboTunOriginalData = null;
      let turboTunCurrentComparison = null;

      // DOM Elements
      const uploadArea = document.getElementById('uploadArea');
      const fileInput = document.getElementById('fileInput');
      const selectedFileDiv = document.getElementById('selectedFile');
      const fileName = document.getElementById('fileName');
      const fileSize = document.getElementById('fileSize');
      const removeFileBtn = document.getElementById('removeFile');
      const analyzeButton = document.getElementById('analyzeButton');
      const loading = document.getElementById('loading');
      const loadingProgress = document.getElementById('loadingProgress');
      const results = document.getElementById('results');
      const errorMessage = document.getElementById('errorMessage');
      const uploadSection = document.getElementById('upload-section');
      const companySelector = document.getElementById('companySelector');
      const companyDropdownButton = document.getElementById('companyDropdownButton');
      const companyDropdownMenu = document.getElementById('companyDropdownMenu');
      const companySelectionText = document.getElementById('companySelectionText');
      const companyError = document.getElementById('companyError');
      const userInfo = document.getElementById('userInfo');
      const userInfoText = document.getElementById('userInfoText');
      const powerAnalysisCheckbox = document.getElementById('power-analysis-checkbox');
      const powerAnalysisSection = document.getElementById('powerAnalysisSection');
      const powerAnalysisDisabledNote = document.getElementById('powerAnalysisDisabledNote');
      
      // History elements (made optional since sidebar was removed)
      const historySidebar = document.getElementById('historySidebar');
      const historyList = document.getElementById('historyList');
      const sidebarUserName = document.getElementById('sidebarUserName');
      const filterCups = document.getElementById('filterCups');
      const filterTipo = document.getElementById('filterTipo');
      const filterTarifa = document.getElementById('filterTarifa');

      console.log('📍 Comparador.js initializing...');
      console.log('📍 History elements:', { historyList, filterCups, filterTipo, filterTarifa });

      // ============================================
      // POWER VALIDATION RULES
      // ============================================
      const POWER_RULES = {
        '2.0TD': {
          maxPower: 15.0,
          minP6: null,
          periods: 2,
          ascending: true
        },
        '3.0TD': {
          maxPower: null,
          minP6: 15.10,
          periods: 6,
          ascending: true
        },
        '6.1TD': {
          maxPower: null,
          minP6: null,
          periods: 6,
          ascending: true
        }
      };

      // ============================================
      // POWER ANALYSIS TOGGLE HANDLER (SIMPLIFIED)
      // ============================================

      if (powerAnalysisCheckbox) {
        powerAnalysisCheckbox.addEventListener('change', (e) => {
          powerAnalysisEnabled = e.target.checked;
          console.log('Power Analysis Enabled:', powerAnalysisEnabled);
        });
      } else {
        console.log('⚠️  Power analysis checkbox not found');
      }

      // ============================================
      // POWER VALIDATION FUNCTIONS
      // ============================================
      
      function validatePowerValues(powerValues, tarifa, numPowerPeriods) {
        const errors = [];
        const rules = POWER_RULES[tarifa] || POWER_RULES['3.0TD'];
        
        if (rules.ascending) {
          for (let i = 1; i < numPowerPeriods; i++) {
            const prev = powerValues[`p${i}`];
            const curr = powerValues[`p${i + 1}`];
            if (curr < prev) {
              errors.push(`P${i + 1} (${curr} kW) debe ser ≥ P${i} (${prev} kW)`);
            }
          }
        }
        
        if (rules.maxPower) {
          for (let i = 1; i <= numPowerPeriods; i++) {
            const power = powerValues[`p${i}`];
            if (power > rules.maxPower) {
              errors.push(`P${i} no puede superar ${rules.maxPower} kW para tarifa ${tarifa}`);
            }
          }
        }
        
        if (rules.minP6 && powerValues.p6 !== undefined) {
          if (powerValues.p6 < rules.minP6) {
            errors.push(`P6 debe ser al menos ${rules.minP6} kW para tarifa ${tarifa}`);
          }
        }
        
        for (let i = 1; i <= numPowerPeriods; i++) {
          const power = powerValues[`p${i}`];
          if (power <= 0) {
            errors.push(`P${i} debe ser mayor que 0`);
          }
        }
        
        return {
          isValid: errors.length === 0,
          errors: errors
        };
      }

      function enforceAscendingPower(powerValues, numPowerPeriods, tarifa) {
        const adjusted = { ...powerValues };
        const rules = POWER_RULES[tarifa] || POWER_RULES['3.0TD'];
        
        for (let i = 2; i <= numPowerPeriods; i++) {
          const prev = adjusted[`p${i - 1}`];
          if (adjusted[`p${i}`] < prev) {
            adjusted[`p${i}`] = prev;
          }
        }
        
        if (rules.minP6 && adjusted.p6 !== undefined && adjusted.p6 < rules.minP6) {
          adjusted.p6 = rules.minP6;
        }
        
        if (rules.maxPower) {
          for (let i = 1; i <= numPowerPeriods; i++) {
            if (adjusted[`p${i}`] > rules.maxPower) {
              adjusted[`p${i}`] = rules.maxPower;
            }
          }
        }
        
        return adjusted;
      }

      // ============================================
      // RECALCULATE OFFERS WITH NEW POWER
      // ============================================
      
      function recalculateOffersWithPower(comparison, newPowerValues) {
        const numEnergyPeriods = comparison.num_energy_periods || 3;
        const numPowerPeriods = comparison.num_power_periods || 2;
        const avgPowerDays = 30;
        const alquiller = comparison.current_bill.alquiller || 0;
        const iva_percent = 0.21;
        const impuesto_elec_percent = 0.0511270000;
        
        const recalculatedOffers = comparison.top_3_offers.map(offer => {
          const newOffer = { ...offer };
          
          let newPowerCost = 0;
          const newPowerCosts = {};
          
          for (let i = 1; i <= numPowerPeriods; i++) {
            const power = newPowerValues[`p${i}`];
            const potPrice = offer[`pot_${i}`] || 0;
            const cost = power * avgPowerDays * potPrice;
            newPowerCosts[`power_cost_p${i}`] = parseFloat(cost.toFixed(2));
            newPowerCost += cost;
          }
          
          const energyCost = offer.total_energy_cost;
          const subtotal = energyCost + newPowerCost;
          const impuestoElec = subtotal * impuesto_elec_percent;
          const subtotalWithExtras = subtotal + impuestoElec + alquiller;
          const iva = subtotalWithExtras * iva_percent;
          const total = subtotalWithExtras + iva;
          
          const currentTotal = comparison.current_bill.total;
          const savings = currentTotal - total;
          const savingsPercent = currentTotal > 0 ? (savings / currentTotal) * 100 : 0;
          
          return {
            ...newOffer,
            ...newPowerCosts,
            total_power_cost: parseFloat(newPowerCost.toFixed(2)),
            subtotal: parseFloat(subtotal.toFixed(2)),
            impuesto_elec: parseFloat(impuestoElec.toFixed(2)),
            iva: parseFloat(iva.toFixed(2)),
            total: parseFloat(total.toFixed(2)),
            savings: parseFloat(savings.toFixed(2)),
            savings_percent: parseFloat(savingsPercent.toFixed(2)),
            annual_savings: parseFloat((savings * 12).toFixed(2)),
            monthly_savings: parseFloat(savings.toFixed(2))
          };
        });
        
        recalculatedOffers.sort((a, b) => b.savings - a.savings);
        
        return recalculatedOffers;
      }

      window.recalculateWithAdjustedPower = function() {
        if (!currentComparisonData) return;
        
        const comparison = currentComparisonData.comparison_data || currentComparisonData;
        const numPowerPeriods = comparison.num_power_periods || 2;
        const tarifa = comparison.tarifa_acceso || '2.0TD';
        
        const newPowerValues = {};
        for (let i = 1; i <= numPowerPeriods; i++) {
          const input = document.getElementById(`adjusted-power-p${i}`);
          if (input) {
            newPowerValues[`p${i}`] = parseFloat(input.value) || 0;
          }
        }
        
        const validation = validatePowerValues(newPowerValues, tarifa, numPowerPeriods);
        
        const errorContainer = document.getElementById('power-validation-errors');
        if (!validation.isValid) {
          if (errorContainer) {
            errorContainer.innerHTML = validation.errors.map(e => `<div>⚠️ ${e}</div>`).join('');
            errorContainer.classList.add('active');
          }
          return;
        } else {
          if (errorContainer) {
            errorContainer.classList.remove('active');
          }
        }
        
        adjustedPowerValues = newPowerValues;
        isUsingAdjustedPower = true;
        
        const recalculatedOffers = recalculateOffersWithPower(comparison, newPowerValues);
        
        const updatedComparison = {
          ...comparison,
          top_3_offers: recalculatedOffers,
          adjusted_power: newPowerValues,
          is_power_adjusted: true,
          analysis: {
            ...comparison.analysis,
            best_savings: recalculatedOffers[0]?.savings || 0,
            best_savings_percent: recalculatedOffers[0]?.savings_percent || 0,
            annual_savings_estimate: recalculatedOffers[0]?.annual_savings || 0
          }
        };
        
        if (currentComparisonData.comparison_data) {
          currentComparisonData = {
            ...currentComparisonData,
            comparison_data: updatedComparison
          };
        } else {
          currentComparisonData = updatedComparison;
        }
        
        displayResults(currentComparisonData);
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };

      window.resetToOriginalPower = function() {
        if (originalComparisonData) {
          currentComparisonData = JSON.parse(JSON.stringify(originalComparisonData));
          adjustedPowerValues = null;
          isUsingAdjustedPower = false;
          displayResults(currentComparisonData);
        }
      };

      // ============================================
      // MONTHLY ANALYSIS ACCORDION TOGGLE
      // ============================================
      
      window.toggleMonthlyAnalysis = function() {
        const content = document.getElementById('monthly-analysis-content');
        const arrow = document.getElementById('monthly-accordion-arrow');
        
        if (content && arrow) {
          const isVisible = content.style.display !== 'none';
          content.style.display = isVisible ? 'none' : 'block';
          arrow.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
        }
      };

      // ============================================
      // TURBO TUN MODE FUNCTIONS
      // ============================================
      
      window.openTurboTun = function() {
        if (!currentComparisonData) {
          showError('No hay datos de comparación disponibles');
          return;
        }
        
        const comparison = currentComparisonData.comparison_data || currentComparisonData;
        turboTunCurrentComparison = comparison;
        turboTunOriginalData = JSON.parse(JSON.stringify(comparison));
        
        // Set CUPS and Tarifa
        document.getElementById('turboTunCups').textContent = currentCups;
        document.getElementById('turboTunTarifa').textContent = comparison.tarifa_acceso;
        
        // Generate input fields
        generateTurboTunFields(comparison);
        
        // Populate product selector
        populateTurboTunProducts(comparison);
        
        // Show overlay
        document.getElementById('turboTunOverlay').classList.add('active');
      };
      
      window.closeTurboTun = function() {
        document.getElementById('turboTunOverlay').classList.remove('active');
        document.getElementById('turboTunResult').classList.remove('active');
      };
      
      function generateTurboTunFields(comparison) {
        const numEnergyPeriods = comparison.num_energy_periods || 3;
        const numPowerPeriods = comparison.num_power_periods || 2;
        
        // Consumption fields
        const consumptionContainer = document.getElementById('consumptionFields');
        consumptionContainer.innerHTML = '';
        for (let i = 1; i <= numEnergyPeriods; i++) {
          const value = comparison.consumption[`p${i}`] || 0;
          consumptionContainer.innerHTML += `
            <div class="turbo-tun-field">
              <label class="turbo-tun-label">Consumo P${i}</label>
              <input type="number" class="turbo-tun-input consumption" 
                     id="turboConsumption_p${i}" 
                     value="${value}" 
                     step="0.01" min="0">
            </div>
          `;
        }
        
        // Power fields
        const powerContainer = document.getElementById('powerFields');
        powerContainer.innerHTML = '';
        for (let i = 1; i <= numPowerPeriods; i++) {
          const value = comparison.contracted_power[`p${i}`] || 0;
          powerContainer.innerHTML += `
            <div class="turbo-tun-field">
              <label class="turbo-tun-label">Potencia P${i}</label>
              <input type="number" class="turbo-tun-input power" 
                     id="turboPower_p${i}" 
                     value="${value.toFixed(2)}" 
                     step="0.01" min="0">
            </div>
          `;
        }
        
        // Energy price fields
        const energyPriceContainer = document.getElementById('energyPriceFields');
        energyPriceContainer.innerHTML = '';
        
        // Get energy prices from first offer
        const firstOffer = comparison.top_3_offers[0];
        for (let i = 1; i <= numEnergyPeriods; i++) {
          const value = firstOffer[`energia_p${i}`] || 0;
          energyPriceContainer.innerHTML += `
            <div class="turbo-tun-field">
              <label class="turbo-tun-label">Precio Energía P${i}</label>
              <input type="number" class="turbo-tun-input energy-price" 
                     id="turboEnergyPrice_p${i}" 
                     value="${value.toFixed(6)}" 
                     step="0.000001" min="0">
            </div>
          `;
        }
        
        // Power price fields
        const powerPriceContainer = document.getElementById('powerPriceFields');
        powerPriceContainer.innerHTML = '';
        for (let i = 1; i <= numPowerPeriods; i++) {
          const value = firstOffer[`pot_${i}`] || 0;
          powerPriceContainer.innerHTML += `
            <div class="turbo-tun-field">
              <label class="turbo-tun-label">Precio Potencia P${i}</label>
              <input type="number" class="turbo-tun-input power-price" 
                     id="turboPowerPrice_p${i}" 
                     value="${value.toFixed(6)}" 
                     step="0.000001" min="0">
            </div>
          `;
        }
      }
      
      function populateTurboTunProducts(comparison) {
        const select = document.getElementById('turboTunProductSelect');
        select.innerHTML = '<option value="">Selecciona un producto...</option>';

        comparison.top_3_offers.forEach((offer, index) => {
          const option = document.createElement('option');
          option.value = index;
          option.textContent = `${offer.company} - ${offer.product}`;
          if (index === 0) option.selected = true; // Select first by default
          select.appendChild(option);
        });

        // Add event listener to update prices when product changes
        select.removeEventListener('change', handleTurboTunProductChange); // Remove any existing listener
        select.addEventListener('change', handleTurboTunProductChange);
      }

      function handleTurboTunProductChange() {
        const selectedIndex = document.getElementById('turboTunProductSelect').value;

        if (selectedIndex === '' || !turboTunCurrentComparison) {
          return;
        }

        const selectedOffer = turboTunCurrentComparison.top_3_offers[parseInt(selectedIndex)];
        const numEnergyPeriods = turboTunCurrentComparison.num_energy_periods || 3;
        const numPowerPeriods = turboTunCurrentComparison.num_power_periods || 2;

        // Update energy prices
        for (let i = 1; i <= numEnergyPeriods; i++) {
          const energyPriceInput = document.getElementById(`turboEnergyPrice_p${i}`);
          if (energyPriceInput && selectedOffer[`energia_p${i}`] !== undefined) {
            energyPriceInput.value = selectedOffer[`energia_p${i}`].toFixed(6);
          }
        }

        // Update power prices
        for (let i = 1; i <= numPowerPeriods; i++) {
          const powerPriceInput = document.getElementById(`turboPowerPrice_p${i}`);
          if (powerPriceInput && selectedOffer[`pot_${i}`] !== undefined) {
            powerPriceInput.value = selectedOffer[`pot_${i}`].toFixed(6);
          }
        }

        // Hide results when product changes to force recalculation
        document.getElementById('turboTunResult').classList.remove('active');
      }
      
      window.resetTurboTunFields = function() {
        if (turboTunOriginalData) {
          generateTurboTunFields(turboTunOriginalData);
          document.getElementById('turboTunResult').classList.remove('active');
        }
      };
      
      window.calculateCustomScenario = async function() {
        const comparison = turboTunCurrentComparison;
        const numEnergyPeriods = comparison.num_energy_periods || 3;
        const numPowerPeriods = comparison.num_power_periods || 2;
        const selectedProductIndex = document.getElementById('turboTunProductSelect').value;
        
        if (selectedProductIndex === '') {
          showError('Por favor selecciona un producto');
          return;
        }
        
        // Collect all values
        const customData = {
          cups: currentCups,
          tarifa_acceso: comparison.tarifa_acceso,
          num_energy_periods: numEnergyPeriods,
          num_power_periods: numPowerPeriods,
          comparison_method: comparison.comparison_method,
          consumption: {},
          power: {},
          energy_prices: {},
          power_prices: {},
          selected_product: comparison.top_3_offers[parseInt(selectedProductIndex)],
          alquiller: comparison.current_bill.alquiller,
          current_total: comparison.current_bill.total
        };
        
        // Get consumption values
        for (let i = 1; i <= numEnergyPeriods; i++) {
          customData.consumption[`p${i}`] = parseFloat(document.getElementById(`turboConsumption_p${i}`).value) || 0;
        }
        
        // Get power values
        for (let i = 1; i <= numPowerPeriods; i++) {
          customData.power[`p${i}`] = parseFloat(document.getElementById(`turboPower_p${i}`).value) || 0;
        }
        
        // Get energy prices
        for (let i = 1; i <= numEnergyPeriods; i++) {
          customData.energy_prices[`p${i}`] = parseFloat(document.getElementById(`turboEnergyPrice_p${i}`).value) || 0;
        }
        
        // Get power prices
        for (let i = 1; i <= numPowerPeriods; i++) {
          customData.power_prices[`p${i}`] = parseFloat(document.getElementById(`turboPowerPrice_p${i}`).value) || 0;
        }
        
        // Disable button and show loading
        const calculateBtn = document.getElementById('turboTunCalculateBtn');
        calculateBtn.disabled = true;
        calculateBtn.textContent = '🔄 Calculando...';
        
        try {
          const response = await fetch(TURBO_TUN_WEBHOOK_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(customData)
          });
          
          if (!response.ok) {
            throw new Error(`Error del servidor: ${response.status}`);
          }
          
          let result = await response.json();
          
          // Handle if n8n returns an array instead of object
          if (Array.isArray(result) && result.length > 0) {
            result = result[0];
          }
          
          if (result.success) {
            // Calculate other costs (alquiler + impuesto + iva)
            const otherCosts = (result.alquiller || 0) + (result.impuesto_elec || 0) + (result.iva || 0);
            
            // Update current bill
            document.getElementById('turboTunCurrentTotal').textContent = `${result.current_total.toFixed(2)} €`;
            
            // Update scenario breakdown
            document.getElementById('turboTunScenarioTotal').textContent = `${result.total.toFixed(2)} €`;
            document.getElementById('turboTunEnergyCost').textContent = `${result.total_energy_cost.toFixed(2)} €`;
            document.getElementById('turboTunPowerCost').textContent = `${result.total_power_cost.toFixed(2)} €`;
            document.getElementById('turboTunOtherCosts').textContent = `${otherCosts.toFixed(2)} €`;
            
            // Update savings
            const savingsSign = result.savings >= 0 ? '+' : '';
            const savingsCard = document.getElementById('turboTunSavingsCard');
            
            if (result.savings >= 0) {
              savingsCard.classList.remove('negative');
            } else {
              savingsCard.classList.add('negative');
            }
            
            document.getElementById('turboTunSavingsValue').textContent = `${savingsSign}${result.savings.toFixed(2)} €`;
            document.getElementById('turboTunSavingsAnnual').textContent = `${savingsSign}${result.annual_savings.toFixed(2)} €/año (${result.savings_percent.toFixed(1)}%)`;
            
            // Show result
            document.getElementById('turboTunResult').classList.add('active');
          } else {
            throw new Error(result.error || 'Error en el cálculo');
          }
          
        } catch (error) {
          console.error('Turbo Tun calculation error:', error);
          showError('Error al calcular el escenario: ' + error.message);
        } finally {
          calculateBtn.disabled = false;
          calculateBtn.textContent = '🧮 Calcular Escenario';
        }
      };

      // ============================================
      // CUPS COPY FUNCTION
      // ============================================
      window.copyCups = function() {
        if (currentCups && currentCups !== 'N/A') {
          navigator.clipboard.writeText(currentCups).then(() => {
            const btn = document.getElementById('cupsCopyBtn');
            if (btn) {
              btn.classList.add('copied');
              btn.textContent = '✓ Copiado';
              setTimeout(() => {
                btn.classList.remove('copied');
                btn.textContent = '📋 Copiar';
              }, 2000);
            }
          }).catch(err => {
            console.error('Error copying CUPS:', err);
          });
        }
      };

      // ============================================
      // SIDEBAR & HISTORY FUNCTIONS
      // ============================================

      window.toggleSidebar = function() {
        if (historySidebar) {
          historySidebar.classList.toggle('mobile-hidden');
        } else {
          console.log('Sidebar not available (removed in new design)');
        }
      };

      window.switchTab = function(tab) {
        // Toggle tab active states
        const nuevaTab = document.getElementById('nuevaTab');
        const historicoTab = document.getElementById('historicoTab');
        const uploadSection = document.getElementById('upload-section');
        const historySection = document.getElementById('history-section');
        const resultsSection = document.getElementById('results');

        if (tab === 'nueva') {
          // Activate Nueva Comparativa tab
          nuevaTab.classList.add('active');
          historicoTab.classList.remove('active');
          uploadSection.style.display = 'block';
          historySection.style.display = 'none';
          if (resultsSection) resultsSection.style.display = 'block';
        } else if (tab === 'historico') {
          // Activate Historico tab
          nuevaTab.classList.remove('active');
          historicoTab.classList.add('active');
          uploadSection.style.display = 'none';
          historySection.style.display = 'block';
          if (resultsSection) resultsSection.style.display = 'none';

          // Load history when switching to historico tab
          loadHistory();
        }
      };

      async function loadHistory() {
        if (!currentUser) {
          console.log('No user available for history');
          return;
        }

        try {
          historyList.innerHTML = `
            <div class="history-loading">
              <div class="history-spinner"></div>
              <div>Cargando historial...</div>
            </div>
          `;

          const filters = {
            limit: 20
          };

          const cupsValue = filterCups.value.trim();
          const tipoValue = filterTipo.value;
          const tarifaValue = filterTarifa.value;

          if (cupsValue) filters.cups = cupsValue;
          if (tipoValue) filters.tipo_suministro = tipoValue;
          if (tarifaValue) filters.tarifa = tarifaValue;

          const response = await fetch(HISTORY_WEBHOOK_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              user_name: currentUser.name,
              filters: filters
            })
          });

          if (!response.ok) {
            throw new Error('Error al cargar historial');
          }

          const data = await response.json();
          
          if (!data.success) {
            throw new Error(data.error || 'Error al cargar historial');
          }

          historyData = data.history || [];
          renderHistory();

        } catch (error) {
          console.error('Error loading history:', error);
          historyList.innerHTML = `
            <div class="history-empty">
              <div class="history-empty-icon">⚠️</div>
              <div>Error al cargar el historial</div>
            </div>
          `;
        }
      }

      function renderHistory() {
        if (historyData.length === 0) {
          historyList.innerHTML = `
            <div class="history-empty">
              <div class="history-empty-icon">📋</div>
              <div>No hay comparaciones previas</div>
            </div>
          `;
          return;
        }

        let html = '';

        historyData.forEach(item => {
          const isActive = activeHistoryId === item.id;
          const badgeClass = item.has_savings ? 'savings' : 'no-savings';
          const badgeText = item.has_savings ? 'Con ahorro' : 'Sin ahorro';
          
          const date = new Date(item.createdAt);
          const dateStr = date.toLocaleDateString('es-ES', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          const methodIcon = item.tipo_comparativa === 'anual' ? '📅' : '📄';
          const methodLabel = item.tipo_comparativa === 'anual' ? 'SIPS' : 'Factura';
          
          const tipoIcon = item.tipo_suministro === 'gas' ? '🔥' : '⚡';
          
          const hasPowerAnalysis = item.incluye_analisis_potencia === 'true' || item.incluye_analisis_potencia === true;

          html += `
            <div class="history-card ${isActive ? 'active' : ''}" onclick="loadHistoryComparison(${item.id})">
              <div class="history-card-header">
                <span class="history-card-id">#${item.id}</span>
                <span class="history-badge ${badgeClass}">${badgeText}</span>
              </div>
              <div class="history-card-cups">${item.CUPS}</div>
              <div class="history-card-meta">
                <span class="history-meta-item">${tipoIcon} ${item.tipo_suministro}</span>
                <span class="history-meta-item">📋 ${item.tarifa_aceso}</span>
                <span class="history-meta-item">${methodIcon} ${methodLabel}</span>
                ${hasPowerAnalysis ? '<span class="history-meta-item">🔌 Potencia</span>' : ''}
              </div>
              <div class="history-card-date">${dateStr}</div>
              ${!item.has_full_data ? '<div class="history-card-no-data">⚠️ Sin datos completos</div>' : ''}
            </div>
          `;
        });

        historyList.innerHTML = html;
      }

      window.loadHistoryComparison = function(historyId) {
        const searchId = String(historyId);
        const item = historyData.find(h => String(h.id) === searchId);
        
        if (!item) {
          console.error('History item not found:', {
            searchId: searchId,
            availableIds: historyData.map(h => ({ id: h.id, type: typeof h.id }))
          });
          showError('No se pudo encontrar la comparación en el historial');
          return;
        }

        if (!item.has_full_data || !item.comparison_data) {
          showError('Esta comparación no tiene datos completos para mostrar');
          return;
        }

        activeHistoryId = historyId;
        renderHistory();

        currentComparisonData = item.comparison_data;
        originalComparisonData = JSON.parse(JSON.stringify(item.comparison_data));
        currentCups = item.CUPS;
        adjustedPowerValues = null;
        isUsingAdjustedPower = false;

        displayResults(item.comparison_data);
        uploadSection.style.display = 'none';

        if (window.innerWidth <= 768) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          historySidebar.classList.add('mobile-hidden');
        }
      };

      filterCups.addEventListener('input', debounce(() => loadHistory(), 500));
      filterTipo.addEventListener('change', () => loadHistory());
      filterTarifa.addEventListener('change', () => loadHistory());

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

      // ============================================
      // USER & INITIALIZATION
      // ============================================

      async function getCurrentUserFromSession() {
        try {
          const sessionResponse = await fetch('/web/session/get_session_info', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'call',
              params: {}
            })
          });
          
          const sessionData = await sessionResponse.json();
          
          if (!sessionData.result || !sessionData.result.uid) {
            throw new Error('No session data available');
          }
          
          const basicUserInfo = {
            user_id: sessionData.result.uid,
            name: sessionData.result.name,
            email: sessionData.result.username,
            login: sessionData.result.username,
            phone: ''
          };
          
          try {
            const userDetailsResponse = await fetch('/web/dataset/call_kw/res.users/read', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'call',
                params: {
                  model: 'res.users',
                  method: 'read',
                  args: [[basicUserInfo.user_id], ['partner_id']],
                  kwargs: {}
                }
              })
            });
            
            const userDetailsData = await userDetailsResponse.json();
            
            if (userDetailsData.result && userDetailsData.result.length > 0) {
              const userDetails = userDetailsData.result[0];
              const partnerId = userDetails.partner_id ? userDetails.partner_id[0] : null;
              
              let partnerContacto = null;
              let partnerPhone = '';
              if (partnerId) {
                try {
                  const partnerResponse = await fetch('/web/dataset/call_kw/res.partner/read', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      jsonrpc: '2.0',
                      method: 'call',
                      params: {
                        model: 'res.partner',
                        method: 'read',
                        args: [[partnerId], ['x_studio_persona_de_contacto', 'phone', 'mobile']],
                        kwargs: {}
                      }
                    })
                  });
                  
                  const partnerData = await partnerResponse.json();
                  if (partnerData.result && partnerData.result.length > 0) {
                    partnerContacto = partnerData.result[0].x_studio_persona_de_contacto || null;
                    partnerPhone = partnerData.result[0].mobile || partnerData.result[0].phone || '';
                  }
                } catch (partnerError) {
                  console.warn('Could not fetch partner data:', partnerError);
                }
              }
              
              return {
                ...basicUserInfo,
                x_studio_persona_de_contacto: partnerContacto,
                phone: partnerPhone
              };
            }
          } catch (detailsError) {
            console.warn('Could not fetch additional user details:', detailsError);
          }
          
          return {
            ...basicUserInfo,
            x_studio_persona_de_contacto: null
          };
          
        } catch (error) {
          console.error('Error getting user from session:', error);
          return null;
        }
      }

      async function initializeUser() {
        try {
          currentUser = await getCurrentUserFromSession();
          
          if (currentUser) {
            userInfoText.textContent = `Sesión: ${currentUser.name} (${currentUser.email})`;
            userInfo.classList.add('active');
            sidebarUserName.textContent = currentUser.name;
            console.log('✓ User detected:', currentUser);
            
            loadHistory();
          } else {
            userInfoText.textContent = '⚠️ No se pudo detectar el usuario';
            userInfo.classList.add('active');
            sidebarUserName.textContent = 'Usuario desconocido';
            console.warn('⚠️ Could not detect user');
          }
        } catch (error) {
          console.error('Error initializing user:', error);
          userInfoText.textContent = '⚠️ Error al detectar usuario';
          userInfo.classList.add('active');
          sidebarUserName.textContent = 'Error';
        }
      }

      // ============================================
      // FILE UPLOAD & ANALYSIS
      // ============================================

      uploadArea.addEventListener('click', () => fileInput.click());

      uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
      });

      uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
      });

      uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          handleFileSelect(files[0]);
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          handleFileSelect(e.target.files[0]);
        }
      });

      removeFileBtn.addEventListener('click', () => {
        selectedFile = null;
        fileInput.value = '';
        selectedFileDiv.classList.remove('active');
        analyzeButton.disabled = true;
      });

      analyzeButton.addEventListener('click', analyzeInvoice);

      const productTypeRadios = document.getElementsByName('product-type');
      productTypeRadios.forEach(radio => {
        radio.addEventListener('change', handleProductTypeChange);
      });

      companyDropdownButton.addEventListener('click', toggleCompanyDropdown);
      
      document.addEventListener('click', (e) => {
        if (!companySelector.contains(e.target)) {
          closeCompanyDropdown();
        }
      });

      handleProductTypeChange();
      initializeUser();

      function handleFileSelect(file) {
        if (file.type !== 'application/pdf') {
          showError('Por favor, selecciona un archivo PDF válido.');
          return;
        }

        if (file.size > MAX_FILE_SIZE) {
          showError('El archivo es demasiado grande. El tamaño máximo es 5 MB.');
          return;
        }

        selectedFile = file;
        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);
        selectedFileDiv.classList.add('active');
        
        const productType = getSelectedProductType();
        if (productType === 'all' && selectedCompanies.length < 3) {
          analyzeButton.disabled = true;
        } else {
          analyzeButton.disabled = false;
        }
        
        hideError();
      }

      function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
      }

      function handleProductTypeChange() {
        const productType = getSelectedProductType();
        
        if (productType === 'all') {
          companySelector.classList.add('active');
          if (availableCompanies.length === 0) {
            fetchAvailableCompanies();
          }
        } else {
          companySelector.classList.remove('active');
          closeCompanyDropdown();
        }
      }

      async function fetchAvailableCompanies() {
        try {
          companyDropdownMenu.innerHTML = '<div class="select-all-option">Cargando comercializadoras...</div>';
          
          const response = await fetch(COMPANIES_WEBHOOK_URL);
          
          if (!response.ok) {
            throw new Error('Error al obtener las comercializadoras');
          }
          
          const data = await response.json();
          availableCompanies = data.companies || [];
          selectedCompanies = [...availableCompanies];
          
          renderCompanyOptions();
          updateCompanySelectionText();
          
        } catch (error) {
          console.error('Error fetching companies:', error);
          companyDropdownMenu.innerHTML = '<div class="select-all-option" style="color: #e53e3e;">Error al cargar comercializadoras</div>';
        }
      }

      function renderCompanyOptions() {
        let html = `
          <div class="select-all-option">
            <label style="cursor: pointer; display: flex; align-items: center; gap: 10px;">
              <input type="checkbox" id="selectAllCompanies" ${selectedCompanies.length === availableCompanies.length ? 'checked' : ''}>
              <span>Seleccionar todas</span>
            </label>
          </div>
        `;
        
        availableCompanies.forEach((company, index) => {
          const isChecked = selectedCompanies.includes(company);
          html += `
            <div class="company-option">
              <input type="checkbox" id="company_${index}" value="${company}" ${isChecked ? 'checked' : ''}>
              <label for="company_${index}" style="cursor: pointer; flex: 1;">${company}</label>
            </div>
          `;
        });
        
        companyDropdownMenu.innerHTML = html;
        
        setTimeout(() => {
          const selectAllCheckbox = document.getElementById('selectAllCompanies');
          if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', handleSelectAll);
          }
          
          availableCompanies.forEach((company, index) => {
            const checkbox = document.getElementById(`company_${index}`);
            if (checkbox) {
              checkbox.addEventListener('change', handleCompanySelection);
            }
          });
        }, 0);
      }

      function handleSelectAll(e) {
        const isChecked = e.target.checked;
        
        if (isChecked) {
          selectedCompanies = [...availableCompanies];
        } else {
          selectedCompanies = [];
        }
        
        availableCompanies.forEach((company, index) => {
          const checkbox = document.getElementById(`company_${index}`);
          if (checkbox) {
            checkbox.checked = isChecked;
          }
        });
        
        updateCompanySelectionText();
      }

      function handleCompanySelection() {
        selectedCompanies = [];
        
        availableCompanies.forEach((company, index) => {
          const checkbox = document.getElementById(`company_${index}`);
          if (checkbox && checkbox.checked) {
            selectedCompanies.push(company);
          }
        });
        
        const selectAllCheckbox = document.getElementById('selectAllCompanies');
        if (selectAllCheckbox) {
          selectAllCheckbox.checked = selectedCompanies.length === availableCompanies.length;
        }
        
        updateCompanySelectionText();
      }

      function updateCompanySelectionText() {
        if (selectedCompanies.length === 0) {
          companySelectionText.textContent = 'Seleccionar comercializadoras...';
          companyError.style.display = 'none';
          analyzeButton.disabled = !selectedFile;
        } else if (selectedCompanies.length < 3) {
          companySelectionText.textContent = `${selectedCompanies.length} comercializadora${selectedCompanies.length > 1 ? 's' : ''} seleccionada${selectedCompanies.length > 1 ? 's' : ''}`;
          companyError.style.display = 'block';
          analyzeButton.disabled = true;
        } else if (selectedCompanies.length === availableCompanies.length) {
          companySelectionText.textContent = 'Todas las comercializadoras';
          companyError.style.display = 'none';
          analyzeButton.disabled = !selectedFile;
        } else if (selectedCompanies.length === 1) {
          companySelectionText.textContent = selectedCompanies[0];
          companyError.style.display = 'block';
          analyzeButton.disabled = true;
        } else {
          companySelectionText.textContent = `${selectedCompanies.length} comercializadoras seleccionadas`;
          companyError.style.display = 'none';
          analyzeButton.disabled = !selectedFile;
        }
      }

      function toggleCompanyDropdown(e) {
        e.stopPropagation();
        const isOpen = companyDropdownMenu.classList.contains('open');
        
        if (isOpen) {
          closeCompanyDropdown();
        } else {
          openCompanyDropdown();
        }
      }

      function openCompanyDropdown() {
        companyDropdownButton.classList.add('open');
        companyDropdownMenu.classList.add('open');
        companyDropdownButton.querySelector('.dropdown-arrow').classList.add('rotated');
      }

      function closeCompanyDropdown() {
        companyDropdownButton.classList.remove('open');
        companyDropdownMenu.classList.remove('open');
        companyDropdownButton.querySelector('.dropdown-arrow').classList.remove('rotated');
      }

      function getSelectedProductType() {
        const radioButtons = document.getElementsByName('product-type');
        for (const radio of radioButtons) {
          if (radio.checked) {
            return radio.value;
          }
        }
        return 'all';
      }

      function getSelectedComparisonMethod() {
        const radioButtons = document.getElementsByName('comparison-method');
        for (const radio of radioButtons) {
          if (radio.checked) {
            return radio.value;
          }
        }
        return 'factura';
      }

      function fileToBase64(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadstart = () => {
            loadingProgress.textContent = 'Preparando archivo...';
          };
          reader.onprogress = (e) => {
            if (e.lengthComputable) {
              const percentComplete = Math.round((e.loaded / e.total) * 100);
              loadingProgress.textContent = `Leyendo archivo: ${percentComplete}%`;
            }
          };
          reader.onload = () => {
            loadingProgress.textContent = 'Codificando archivo...';
            const base64 = reader.result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = () => {
            reject(new Error('Error al leer el archivo'));
          };
          reader.readAsDataURL(file);
        });
      }

      function sendWithXHR(url, payload, timeoutMs) {
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          
          xhr.open('POST', url, true);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.timeout = timeoutMs;
          
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const percentComplete = Math.round((e.loaded / e.total) * 100);
              loadingProgress.textContent = `Enviando: ${percentComplete}%`;
            }
          });
          
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                loadingProgress.textContent = 'Procesando respuesta...';
                const data = JSON.parse(xhr.responseText);
                resolve(data);
              } catch (e) {
                reject(new Error('Error al procesar la respuesta del servidor'));
              }
            } else {
              reject(new Error(`Error del servidor: ${xhr.status} - ${xhr.statusText}`));
            }
          });
          
          xhr.addEventListener('error', () => {
            reject(new Error('Error de red al enviar el archivo'));
          });
          
          xhr.addEventListener('timeout', () => {
            reject(new Error('REQUEST_TIMEOUT'));
          });
          
          xhr.addEventListener('abort', () => {
            reject(new Error('REQUEST_ABORTED'));
          });
          
          loadingProgress.textContent = 'Conectando con el servidor...';
          xhr.send(JSON.stringify(payload));
          
          uploadController = { abort: () => xhr.abort() };
        });
      }

      async function analyzeInvoice() {
        if (!selectedFile) return;

        if (!currentUser) {
          showError('No se pudo identificar el usuario. Por favor, recarga la página.');
          return;
        }

        loading.classList.add('active');
        analyzeButton.disabled = true;
        hideError();
        results.classList.remove('active');
        loadingProgress.textContent = `Iniciando análisis para ${currentUser.name}...`;

        try {
          const fileData = await fileToBase64(selectedFile);
          
          const payload = {
            data: fileData,
            filename: selectedFile.name,
            product_type: getSelectedProductType(),
            comparison_method: getSelectedComparisonMethod(),
            power_analysis_enabled: powerAnalysisEnabled,
            user_id: currentUser.user_id,
            user_name: currentUser.name,
            user_email: currentUser.email,
            user_login: currentUser.login,
            x_studio_persona_de_contacto: currentUser.x_studio_persona_de_contacto
          };

          if (getSelectedProductType() === 'all' && selectedCompanies.length > 0) {
            payload.selected_companies = selectedCompanies;
          }
          
          loadingProgress.textContent = 'Enviando factura al servidor...';
          
          const data = await sendWithXHR(WEBHOOK_URL, payload, REQUEST_TIMEOUT);
          
          loadingProgress.textContent = 'Análisis completado';
          
          if (!data || !data.comparison_data) {
            throw new Error('La respuesta del servidor no contiene los datos esperados');
          }

          currentComparisonData = data.comparison_data;
          originalComparisonData = JSON.parse(JSON.stringify(data.comparison_data));
          currentCups = data.comparison_data.cups || 'N/A';
          activeHistoryId = null;
          adjustedPowerValues = null;
          isUsingAdjustedPower = false;

          // Ensure power analysis data is properly structured for display
          const displayData = {
            ...data,
            comparison_data: {
              ...data.comparison_data,
              incluye_analisis_potencia: data.incluye_analisis_potencia || data.comparison_data.incluye_analisis_potencia,
              potencia_analysis: data.potencia_analysis || data.comparison_data.potencia_analysis,
              ahorro_comparador_anual: data.ahorro_comparador_anual || data.comparison_data.ahorro_comparador_anual,
              ahorro_potencia_anual: data.ahorro_potencia_anual || data.comparison_data.ahorro_potencia_anual,
              ahorro_total_anual: data.ahorro_total_anual || data.comparison_data.ahorro_total_anual,
              ahorro_total_mensual: data.ahorro_total_mensual || data.comparison_data.ahorro_total_mensual
            }
          };

          displayResults(displayData);
          uploadSection.style.display = 'none';

          loadHistory();
          
        } catch (error) {
          console.error('Analysis error:', error);
          
          let errorMsg = 'Error al analizar la factura. ';
          
          if (error.message === 'REQUEST_TIMEOUT') {
            errorMsg += `La solicitud tardó demasiado tiempo. Por favor, intenta de nuevo.`;
          } else if (error.message === 'REQUEST_ABORTED') {
            errorMsg += 'La solicitud fue cancelada.';
          } else if (error.message.includes('Error de red')) {
            errorMsg += 'No se pudo establecer conexión con el servidor.';
          } else {
            errorMsg += error.message;
          }
          
          showError(errorMsg);
          analyzeButton.disabled = false;
        } finally {
          loading.classList.remove('active');
          loadingProgress.textContent = '';
          uploadController = null;
        }
      }

      // ============================================
      // RESULTS DISPLAY
      // ============================================

      window.toggleOfferForPDF = function(index) {
        selectedOffersForPDF[index] = !selectedOffersForPDF[index];
        updatePDFSelectionInfo();
      };

      function updatePDFSelectionInfo() {
        const selectedCount = selectedOffersForPDF.filter(Boolean).length;
        const countElement = document.getElementById('pdfSelectionCount');
        
        if (countElement) {
          countElement.textContent = selectedCount;
        }
      }

      window.resetAnalysis = function() {
        selectedFile = null;
        currentComparisonData = null;
        originalComparisonData = null;
        selectedOffersForPDF = [true, true, true];
        currentCups = 'N/A';
        activeHistoryId = null;
        adjustedPowerValues = null;
        isUsingAdjustedPower = false;
        
        powerAnalysisEnabled = false;
        powerAnalysisCheckbox.checked = false;
        powerAnalysisSection.classList.remove('disabled');
        powerAnalysisDisabledNote.style.display = 'none';
        
        fileInput.value = '';
        selectedFileDiv.classList.remove('active');
        analyzeButton.disabled = true;
        results.classList.remove('active');
        uploadSection.style.display = 'block';
        hideError();
        
        renderHistory();
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };

      window.downloadPDF = async function() {
        if (!currentComparisonData) {
          showError('No hay datos para generar el PDF');
          return;
        }

        if (!currentUser) {
          showError('No se pudo identificar el usuario para generar el PDF');
          return;
        }

        const comparison = currentComparisonData.comparison_data || currentComparisonData;
        const selectedOffers = comparison.top_3_offers.filter((_, index) => selectedOffersForPDF[index]);
        
        if (selectedOffers.length === 0) {
          showError('Debes seleccionar al menos una oferta para incluir en el PDF');
          return;
        }

        const downloadButton = document.querySelector('.download-pdf-button');
        downloadButton.disabled = true;
        downloadButton.classList.add('loading');

        try {
          const pdfComparisonData = {
            ...comparison,
            top_3_offers: selectedOffers,
            cups: currentCups
          };

          const payload = {
            comparison_data: pdfComparisonData,
            user_name: currentUser.name,
            user_email: currentUser.email,
            user_phone: currentUser.phone || '',
            cups: currentCups,
            tarifa_acceso: comparison.tarifa_acceso || '2.0TD',
            product_type: comparison.product_type || 'all',
            num_energy_periods: comparison.num_energy_periods || 3,
            num_power_periods: comparison.num_power_periods || 2,
            search_strategy: comparison.search_strategy || 'most_savings',
            comparison_method: comparison.comparison_method || 'factura'
          };

          const response = await fetch(PDF_WEBHOOK_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(PDF_TIMEOUT)
          });

          if (!response.ok) {
            throw new Error(`Error del servidor: ${response.status}`);
          }

          const data = await response.json();

          if (!data.success || !data.pdf_base64) {
            throw new Error('La respuesta del servidor no contiene el PDF');
          }

          const byteCharacters = atob(data.pdf_base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'application/pdf' });

          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = data.filename || 'comparacion_factura.pdf';
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);

        } catch (error) {
          console.error('PDF generation error:', error);
          let errorMsg = 'Error al generar el PDF: ';
          
          if (error.name === 'TimeoutError') {
            errorMsg += 'La generación del PDF tardó demasiado tiempo';
          } else {
            errorMsg += error.message;
          }
          
          showError(errorMsg);
        } finally {
          downloadButton.disabled = false;
          downloadButton.classList.remove('loading');
        }
      };

      function displayResults(data) {
        console.log('=== displayResults CALLED ===');
        
        let hasPowerAnalysis = false;
        let powerAnalysisData = null;
        let ahorroComparadorAnual = 0;
        let ahorroPotenciaAnual = 0;
        let ahorroTotalAnual = 0;
        let ahorroTotalMensual = 0;
        
        if (data.incluye_analisis_potencia === true || data.incluye_analisis_potencia === 'true') {
          hasPowerAnalysis = true;
          powerAnalysisData = data.potencia_analysis;
          ahorroComparadorAnual = data.ahorro_comparador_anual || 0;
          ahorroPotenciaAnual = data.ahorro_potencia_anual || 0;
          ahorroTotalAnual = data.ahorro_total_anual || ahorroComparadorAnual;
          ahorroTotalMensual = data.ahorro_total_mensual || (ahorroTotalAnual / 12);
        }
        
        if (data.comparison_data && (data.comparison_data.incluye_analisis_potencia === true || data.comparison_data.incluye_analisis_potencia === 'true')) {
          hasPowerAnalysis = true;
          powerAnalysisData = data.comparison_data.potencia_analysis;
          ahorroComparadorAnual = data.comparison_data.ahorro_comparador_anual || 0;
          ahorroPotenciaAnual = data.comparison_data.ahorro_potencia_anual || 0;
          ahorroTotalAnual = data.comparison_data.ahorro_total_anual || ahorroComparadorAnual;
          ahorroTotalMensual = data.comparison_data.ahorro_total_mensual || (ahorroTotalAnual / 12);
        }
        
        let rawData, comparison;
        
        if (data.comparison_data && data.comparison_data.current_bill) {
          rawData = data;
          comparison = data.comparison_data;
        } else if (data.current_bill) {
          rawData = data;
          comparison = data.comparison_data || data;
        } else {
          rawData = data.comparison_data || data;
          comparison = rawData.comparison_data || rawData;
        }
        
        currentCups = comparison.cups || data.cups || 'N/A';
        
        let numEnergyPeriods = comparison.num_energy_periods || 3;
        let numPowerPeriods = comparison.num_power_periods || 2;
        
        if (!comparison.num_energy_periods) {
          numEnergyPeriods = (comparison.consumption && comparison.consumption.p4 !== undefined) ? 6 : 3;
        }
        if (!comparison.num_power_periods) {
          numPowerPeriods = (comparison.contracted_power && comparison.contracted_power.p3 !== undefined) ? 6 : 2;
        }
        
        const tarifaAcceso = comparison.tarifa_acceso || '2.0TD';
        
        const isPowerAdjusted = comparison.is_power_adjusted || isUsingAdjustedPower;
        
        let displayMonthlySavings, displayAnnualSavings;
        
        if (hasPowerAnalysis && ahorroTotalMensual !== 0 && !isPowerAdjusted) {
          displayMonthlySavings = ahorroTotalMensual;
          displayAnnualSavings = ahorroTotalAnual;
        } else {
          displayMonthlySavings = comparison.analysis?.best_savings || 0;
          displayAnnualSavings = comparison.analysis?.annual_savings_estimate || 0;
        }
        
        const isSavings = displayMonthlySavings >= 0;
        const savingsClass = isSavings ? 'positive' : 'negative';
        const savingsLabel = isPowerAdjusted ? 'Ahorro con Potencia Ajustada' : (isSavings ? 'Ahorro Mensual Potencial' : 'Coste Adicional Mensual');
        const annualLabel = isSavings ? '🎯 Ahorro Anual' : '⚠️ Coste Adicional Anual';
        const savingsValue = Math.abs(displayMonthlySavings).toFixed(2);
        const annualValue = Math.abs(displayAnnualSavings).toFixed(2);

        const methodLabels = {
          'factura': '📄 Consumo en Factura',
          'anual': '📅 Consumo Anual (SIPS)'
        };
        const methodLabel = methodLabels[comparison.comparison_method] || '📄 Consumo en Factura';
        
        let html = `
          <div class="results-top-action">
            <button class="new-comparison-top-button" onclick="resetAnalysis()">
              <span>➕</span>
              <span>Nueva Comparación</span>
            </button>
          </div>`;
        
        // CUPS Display Banner
        html += `
          <div class="cups-display-banner">
            <div class="cups-display-icon">🔌</div>
            <div class="cups-display-content">
              <div class="cups-display-label">CUPS del Suministro</div>
              <div class="cups-display-value">${currentCups}</div>
            </div>
            <button class="cups-display-copy" id="cupsCopyBtn" onclick="copyCups()">📋 Copiar</button>
          </div>`;
        
        // Show adjusted power banner if applicable
        if (isPowerAdjusted) {
          html += `
            <div class="adjusted-savings-banner">
              <div class="banner-text">
                <span>⚡</span>
                <span>Mostrando cálculos con <strong>potencia ajustada</strong></span>
              </div>
              <span class="reset-link" onclick="resetToOriginalPower()">Volver a potencia original</span>
            </div>`;
        }

        html += `
          <div class="results-header">
            ${!isSavings ? '<div class="no-savings-message">⚠️ Ahorro no encontrado</div>' : ''}
            <div class="savings-amount ${savingsClass}">${isSavings ? '' : '-'}${savingsValue} €</div>
            <div class="savings-label">${savingsLabel}</div>
            <div class="annual-savings">
              ${annualLabel}: ${isSavings ? '' : '-'}${annualValue} €
            </div>`;
        
        if (hasPowerAnalysis && !isPowerAdjusted) {
          const ahorroComparadorValue = Math.abs(ahorroComparadorAnual).toFixed(2);
          const ahorroPotenciaValue = Math.abs(ahorroPotenciaAnual).toFixed(2);
          const comparadorSign = ahorroComparadorAnual >= 0 ? '+' : '-';
          const potenciaSign = ahorroPotenciaAnual >= 0 ? '+' : '-';
          
          html += `
            <div style="margin-top: 16px; padding: 16px; background: #f8fbff; border-radius: 8px; font-size: 14px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: #718096;">⚡ Comparativa de Energía:</span>
                <span style="font-weight: 700; color: ${ahorroComparadorAnual >= 0 ? '#27ae60' : '#e53e3e'};">${comparadorSign}${ahorroComparadorValue}€/año</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span style="color: #718096;">🔌 Ahorro en Potencia:</span>
                <span style="font-weight: 700; color: ${ahorroPotenciaAnual >= 0 ? '#27ae60' : '#e53e3e'};">${potenciaSign}${ahorroPotenciaValue}€/año</span>
              </div>
              <div style="border-top: 2px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between;">
                <span style="font-weight: 700; color: #2d3748;">AHORRO TOTAL:</span>
                <span style="font-weight: 700; font-size: 16px; color: ${isSavings ? '#27ae60' : '#e53e3e'};">${isSavings ? '' : '-'}${annualValue}€/año</span>
              </div>
            </div>`;
        }
        
        html += `
            <div class="method-badge">${methodLabel}</div>
          </div>

          <div class="info-cards-grid">
            <div class="info-card">
              <div class="info-card-title">
                <span>📊</span>
                <span>Consumo del Suministro</span>
                <span class="tarifa-badge">${tarifaAcceso}</span>
              </div>
              <div class="info-card-content">`;
        
        for (let i = 1; i <= numEnergyPeriods; i++) {
          const consumptionValue = comparison.consumption['p'+i];
          if (consumptionValue !== undefined) {
            html += `
                <div class="info-row">
                  <span class="info-label">Período P${i}</span>
                  <span class="info-value">${consumptionValue} kWh</span>
                </div>`;
          }
        }
        
        html += `
                <div class="info-row highlight">
                  <span class="info-label">Total</span>
                  <span class="info-value highlight">${comparison.consumption.total} kWh</span>
                </div>
              </div>
            </div>

            <div class="info-card">
              <div class="info-card-title">
                <span>⚡</span>
                <span>Potencia Contratada</span>
              </div>
              <div class="info-card-content">`;
        
        for (let i = 1; i <= numPowerPeriods; i++) {
          const powerValue = comparison.contracted_power['p'+i];
          if (powerValue !== undefined) {
            html += `
                <div class="info-row">
                  <span class="info-label">Potencia P${i}</span>
                  <span class="info-value">${powerValue.toFixed(2)} kW</span>
                </div>`;
          }
        }
        
        html += `
                <div class="info-row highlight">
                  <span class="info-label">Total</span>
                  <span class="info-value highlight">${comparison.contracted_power.total.toFixed(2)} kW</span>
                </div>
              </div>
            </div>

            <div class="info-card">
              <div class="info-card-title">
                <span>💰</span>
                <span>Factura Actual</span>
              </div>
              <div class="info-card-content">
                <div class="info-row">
                  <span class="info-label">Coste Energía</span>
                  <span class="info-value">${comparison.current_bill.energy_cost.toFixed(2)} €</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Coste Potencia</span>
                  <span class="info-value">${comparison.current_bill.power_cost.toFixed(2)} €</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Impuesto Eléctrico</span>
                  <span class="info-value">${comparison.current_bill.impuesto_elec.toFixed(2)} €</span>
                </div>
                <div class="info-row">
                  <span class="info-label">IVA</span>
                  <span class="info-value">${comparison.current_bill.iva.toFixed(2)} €</span>
                </div>
                <div class="info-row highlight">
                  <span class="info-label">Total</span>
                  <span class="info-value highlight">${comparison.current_bill.total.toFixed(2)} €</span>
                </div>
              </div>
            </div>
          </div>
        `;

        // Power Analysis Section with EDITABLE fields
        if (hasPowerAnalysis && powerAnalysisData) {
          const powerAnalysis = powerAnalysisData;
          
          let powerSuggested = {};
          if (data.potencia_sugerida) {
            powerSuggested = data.potencia_sugerida;
          } else if (data.comparison_data && data.comparison_data.potencia_sugerida) {
            powerSuggested = data.comparison_data.potencia_sugerida;
          }
          
          const estadoGeneral = powerAnalysis.Recomendacion_General || powerSuggested.estado_general || 'N/A';
          const costeActual = powerAnalysis.Coste_Potencia_Fija_Actual_Anual || 
                             powerAnalysis.Coste_Actual_Anual || 0;
          const costeSugerido = powerAnalysis.Coste_Total_Sugerido_Anual || 
                               powerAnalysis.Coste_Sugerido_Anual || 0;
          const penalizacionActual = powerAnalysis.Total_Penalizaciones_Anual || 0;
          const penalizacionSugerida = powerAnalysis.Total_Penalizaciones_Sugerido_Anual || 0;
          const ahorroAnual = powerAnalysis.Ahorro_Anual || ahorroPotenciaAnual;
          const ahorroMensual = powerAnalysis.Ahorro_Mensual || (ahorroAnual / 12);
          
          const isOptimal = estadoGeneral.includes('ÓPTIMO') || estadoGeneral.includes('OPTIMO');
          const statusColor = isOptimal ? '#27ae60' : '#f39c12';
          const statusBg = isOptimal ? '#d4edda' : '#fff3cd';
          
          // Parse monthly analysis data
          let monthlyAnalysis = [];
          if (powerAnalysis.Detalle_Mensual) {
            try {
              monthlyAnalysis = typeof powerAnalysis.Detalle_Mensual === 'string' 
                ? JSON.parse(powerAnalysis.Detalle_Mensual) 
                : powerAnalysis.Detalle_Mensual;
            } catch (e) {
              console.error('Error parsing monthly analysis:', e);
            }
          }
          
          html += `
            <div style="background: white; border: 2px solid #4393CE; border-radius: 12px; padding: 24px; margin-bottom: 20px;">
              <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #2d3748; display: flex; align-items: center; gap: 10px;">
                <span>🔌</span>
                <span>Análisis de Potencia Contratada</span>
              </h3>
              
              <div style="background: ${statusBg}; border-left: 4px solid ${statusColor}; padding: 12px 16px; margin-bottom: 20px; border-radius: 6px;">
                <div style="font-weight: 700; color: ${statusColor}; margin-bottom: 4px;">Estado General:</div>
                <div style="color: #2d3748; font-size: 14px;">${estadoGeneral}</div>
              </div>
              
              <div style="overflow-x: auto; margin-bottom: 20px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                  <thead>
                    <tr style="background: #f7fafc; border-bottom: 2px solid #e2e8f0;">
                      <th style="padding: 10px; text-align: left; font-weight: 700; color: #4a5568;">Período</th>
                      <th style="padding: 10px; text-align: center; font-weight: 700; color: #4a5568;">Contratada</th>
                      <th style="padding: 10px; text-align: center; font-weight: 700; color: #4a5568;">Máx. Demanda</th>
                      <th style="padding: 10px; text-align: center; font-weight: 700; color: #4a5568;">Sugerida (editable)</th>
                      <th style="padding: 10px; text-align: center; font-weight: 700; color: #4a5568;">Estado</th>
                    </tr>
                  </thead>
                  <tbody>`;
          
          for (let i = 1; i <= numPowerPeriods; i++) {
            const activo = powerAnalysis[`P${i}_Activo`];
            if (activo === 'SI') {
              const contratada = powerAnalysis[`P${i}_Contratada`] || 0;
              const maxima = powerAnalysis[`P${i}_Maxima_Global`] || 0;
              const sugerida = adjustedPowerValues ? adjustedPowerValues[`p${i}`] : (powerAnalysis[`P${i}_Sugerida`] || 0);
              const estado = powerAnalysis[`P${i}_Estado`] || 'N/A';
              
              const estadoColor = estado === 'OPTIMO' ? '#27ae60' : estado === 'MEJORABLE' ? '#f39c12' : '#666';
              const estadoBg = estado === 'OPTIMO' ? '#d4edda' : estado === 'MEJORABLE' ? '#fff3cd' : '#f8f9fa';
              
              html += `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                      <td style="padding: 10px; font-weight: 600; color: #2d3748;">P${i}</td>
                      <td style="padding: 10px; text-align: center; color: #2d3748;">${contratada.toFixed(2)} kW</td>
                      <td style="padding: 10px; text-align: center; color: #718096;">${maxima.toFixed(2)} kW</td>
                      <td style="padding: 10px; text-align: center;">
                        <input type="number" 
                               id="adjusted-power-p${i}" 
                               class="power-input-editable" 
                               value="${sugerida.toFixed(2)}" 
                               step="0.01" 
                               min="0">
                        <span style="font-size: 11px; color: #718096; margin-left: 4px;">kW</span>
                      </td>
                      <td style="padding: 10px; text-align: center;">
                        <span style="background: ${estadoBg}; color: ${estadoColor}; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                          ${estado}
                        </span>
                      </td>
                    </tr>`;
            }
          }
          
          html += `
                  </tbody>
                </table>
              </div>
              
              <!-- Validation Errors -->
              <div id="power-validation-errors" class="power-validation-error"></div>
              
              <!-- Recalculate Button -->
              <button class="recalculate-button" onclick="recalculateWithAdjustedPower()">
                <span class="button-text">🔄 Recalcular Ahorros con Potencia Ajustada</span>
                <div class="button-spinner"></div>
              </button>
              
              <div style="margin-top: 12px; font-size: 11px; color: #718096;">
                💡 Edita los valores de potencia sugerida y haz clic en recalcular para ver el ahorro actualizado en todas las ofertas.
                ${tarifaAcceso === '3.0TD' ? '<br>⚠️ Para 3.0TD, P6 debe ser al menos 15.10 kW.' : ''}
                ${tarifaAcceso === '2.0TD' ? '<br>⚠️ Para 2.0TD, la potencia máxima es 15 kW.' : ''}
              </div>
              
              ${monthlyAnalysis.length > 0 ? `
              <!-- MONTHLY ANALYSIS ACCORDION -->
              <div style="margin-top: 24px; border-top: 2px solid #e2e8f0; padding-top: 20px;">
                <button onclick="toggleMonthlyAnalysis()" 
                        style="width: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                               color: white; border: none; border-radius: 8px; padding: 14px 20px; 
                               font-size: 15px; font-weight: 700; cursor: pointer; 
                               display: flex; align-items: center; justify-content: space-between;
                               transition: all 0.2s ease;">
                  <span style="display: flex; align-items: center; gap: 8px;">
                    <span>📅</span>
                    <span>Análisis Mensual Detallado (${monthlyAnalysis.length} meses)</span>
                  </span>
                  <span id="monthly-accordion-arrow" style="transition: transform 0.3s ease;">▼</span>
                </button>
                
                <div id="monthly-analysis-content" style="display: none; margin-top: 16px;">
                  <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
                    <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                      📊 Este análisis muestra el comportamiento mensual de tu potencia contratada durante los últimos 12 meses.
                    </div>
                    <div style="display: flex; gap: 16px; font-size: 11px; margin-bottom: 8px;">
                      <div><span style="color: #27ae60; font-weight: 700;">✓ OPTIMO:</span> Potencia bien ajustada</div>
                      <div><span style="color: #f39c12; font-weight: 700;">⚠ AUMENTAR:</span> Penalizaciones detectadas</div>
                      <div><span style="color: #e53e3e; font-weight: 700;">✗ REDUCIR:</span> Potencia infrautilizada</div>
                    </div>
                    <div style="font-size: 11px; color: #667eea; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                      <span>👉</span>
                      <span>Desliza horizontalmente para ver todos los períodos</span>
                    </div>
                  </div>
                  
                  <!-- Horizontal Scroll Container with Visual Indicators -->
                  <div style="position: relative; border-radius: 8px; overflow: hidden; border: 2px solid #e2e8f0; max-width: 100%;">
                    <!-- Scroll Shadow Indicators -->
                    <div style="position: absolute; top: 0; right: 0; bottom: 0; width: 60px; 
                                background: linear-gradient(to left, rgba(255,255,255,0.95), transparent); 
                                pointer-events: none; z-index: 5;"></div>
                    
                    <div style="overflow-x: auto; overflow-y: visible; width: 100%; max-width: 100%;">
                      <table style="width: auto; min-width: 800px; max-width: max-content; border-collapse: collapse; font-size: 10px; background: white;">
                      <thead>
                        <tr style="background: #667eea; color: white;">
                          <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0; position: sticky; left: 0; background: #667eea; z-index: 10; min-width: 70px; max-width: 70px; width: 70px;">Mes</th>
                          ${(() => {
                            let periodsHtml = '';
                            for (let i = 1; i <= numPowerPeriods; i++) {
                              periodsHtml += `
                                <th colspan="4" style="padding: 6px; text-align: center; border: 1px solid #e2e8f0; width: 200px;">
                                  P${i}
                                </th>
                              `;
                            }
                            return periodsHtml;
                          })()}
                          <th colspan="2" style="padding: 6px; text-align: center; border: 1px solid #e2e8f0; width: 120px;">Total</th>
                        </tr>
                        <tr style="background: #764ba2; color: white; font-size: 9px;">
                          <th style="padding: 4px; border: 1px solid #e2e8f0; position: sticky; left: 0; background: #764ba2; z-index: 10;"></th>
                          ${(() => {
                            let subHeadersHtml = '';
                            for (let i = 1; i <= numPowerPeriods; i++) {
                              subHeadersHtml += `
                                <th style="padding: 4px; border: 1px solid #e2e8f0; width: 50px; max-width: 50px;">Cont.</th>
                                <th style="padding: 4px; border: 1px solid #e2e8f0; width: 50px; max-width: 50px;">Máx.</th>
                                <th style="padding: 4px; border: 1px solid #e2e8f0; width: 50px; max-width: 50px;">Exc.</th>
                                <th style="padding: 4px; border: 1px solid #e2e8f0; width: 50px; max-width: 50px;">Pen.</th>
                              `;
                            }
                            return subHeadersHtml;
                          })()}
                          <th style="padding: 4px; border: 1px solid #e2e8f0; width: 60px; max-width: 60px;">Fija</th>
                          <th style="padding: 4px; border: 1px solid #e2e8f0; width: 60px; max-width: 60px;">Pen.</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${monthlyAnalysis.map(month => {
                          const monthName = month.Mes || 'N/A';
                          const totalPenalty = month.Coste_Mes_Penalizacion || 0;
                          const totalFixed = month.Coste_Mes_Potencia_Fija || 0;
                          
                          let rowHtml = `
                            <tr style="border-bottom: 1px solid #e2e8f0;">
                              <td style="padding: 4px 6px; font-weight: 700; border: 1px solid #e2e8f0; position: sticky; left: 0; background: white; z-index: 5; white-space: nowrap; width: 70px; max-width: 70px;">
                                ${monthName}
                              </td>
                          `;
                          
                          // Add data for each power period
                          for (let i = 1; i <= numPowerPeriods; i++) {
                            const isActive = month[`P${i}_Activo`] === 'SI';
                            
                            if (isActive) {
                              const contratada = (month[`P${i}_Contratada`] || 0).toFixed(1);
                              const maxima = (month[`P${i}_Maxima`] || 0).toFixed(1);
                              const exceso = (month[`P${i}_Exceso`] || 0).toFixed(1);
                              const penalizacion = (month[`P${i}_Penalizacion_Euros`] || 0).toFixed(0);
                              const tienePenalizacion = month[`P${i}_Tiene_Penalizacion`] === 'SI';
                              
                              const cellBg = tienePenalizacion ? '#fff5f5' : 'white';
                              const penalizColor = tienePenalizacion ? '#e53e3e' : '#666';
                              
                              rowHtml += `
                                <td style="padding: 4px; text-align: right; border: 1px solid #e2e8f0; background: ${cellBg}; width: 50px; max-width: 50px;">${contratada}</td>
                                <td style="padding: 4px; text-align: right; border: 1px solid #e2e8f0; background: ${cellBg}; width: 50px; max-width: 50px;">${maxima}</td>
                                <td style="padding: 4px; text-align: right; border: 1px solid #e2e8f0; background: ${cellBg}; color: ${tienePenalizacion ? '#e53e3e' : '#666'}; font-weight: ${tienePenalizacion ? '700' : '400'}; width: 50px; max-width: 50px;">${exceso}</td>
                                <td style="padding: 4px; text-align: right; border: 1px solid #e2e8f0; background: ${cellBg}; color: ${penalizColor}; font-weight: ${tienePenalizacion ? '700' : '400'}; width: 50px; max-width: 50px;">${tienePenalizacion ? penalizacion : '–'}</td>
                              `;
                            } else {
                              rowHtml += `
                                <td colspan="4" style="padding: 4px; text-align: center; border: 1px solid #e2e8f0; background: #f8f9fa; color: #999; font-size: 9px;">–</td>
                              `;
                            }
                          }
                          
                          // Total costs
                          rowHtml += `
                            <td style="padding: 4px; text-align: right; border: 1px solid #e2e8f0; font-weight: 600; width: 60px; max-width: 60px;">${totalFixed.toFixed(0)}</td>
                            <td style="padding: 4px; text-align: right; border: 1px solid #e2e8f0; font-weight: 700; color: ${totalPenalty > 0 ? '#e53e3e' : '#666'}; width: 60px; max-width: 60px;">${totalPenalty > 0 ? totalPenalty.toFixed(0) : '–'}</td>
                          </tr>
                          `;
                          
                          return rowHtml;
                        }).join('')}
                      </tbody>
                      <tfoot>
                        <tr style="background: #f8f9fa; font-weight: 700; border-top: 3px solid #667eea;">
                          <td style="padding: 6px; border: 1px solid #e2e8f0; position: sticky; left: 0; background: #f8f9fa; z-index: 5; font-size: 9px; width: 70px; max-width: 70px;">ANUAL</td>
                          ${(() => {
                            let totalsHtml = '';
                            for (let i = 1; i <= numPowerPeriods; i++) {
                              const annualPenalty = powerAnalysis[`P${i}_Penalizacion_Anual`] || 0;
                              totalsHtml += `
                                <td colspan="4" style="padding: 6px; text-align: center; border: 1px solid #e2e8f0; color: ${annualPenalty > 0 ? '#e53e3e' : '#27ae60'}; font-size: 9px; width: 200px;">
                                  ${annualPenalty > 0 ? '⚠️ ' + annualPenalty.toFixed(0) : '✓'}
                                </td>
                              `;
                            }
                            return totalsHtml;
                          })()}
                          <td style="padding: 6px; text-align: right; border: 1px solid #e2e8f0; color: #4393CE; width: 60px; max-width: 60px;">${costeActual.toFixed(0)}</td>
                          <td style="padding: 6px; text-align: right; border: 1px solid #e2e8f0; color: ${penalizacionActual > 0 ? '#e53e3e' : '#27ae60'}; width: 60px; max-width: 60px;">${penalizacionActual > 0 ? penalizacionActual.toFixed(0) : '✓'}</td>
                        </tr>
                      </tfoot>
                    </table>
                    </div>
                  </div>
                </div>
              </div>
              ` : ''}
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px; margin-bottom: 16px;">
                <div style="background: #f8fbff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
                  <div style="font-size: 12px; color: #718096; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                    Con Potencia Actual
                  </div>
                  <div style="font-size: 24px; font-weight: 700; color: #2d3748; margin-bottom: 8px;">
                    ${costeActual.toFixed(2)}€
                  </div>
                  <div style="font-size: 11px; color: #718096;">
                    ${penalizacionActual > 0 ? `Incluye ${penalizacionActual.toFixed(2)}€ en penalizaciones` : 'Sin penalizaciones'}
                  </div>
                </div>
                
                <div style="background: #f0fff4; border: 1px solid #9ae6b4; border-radius: 8px; padding: 16px;">
                  <div style="font-size: 12px; color: #38a169; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                    Con Potencia Sugerida
                  </div>
                  <div style="font-size: 24px; font-weight: 700; color: #2d3748; margin-bottom: 8px;">
                    ${costeSugerido.toFixed(2)}€
                  </div>
                  <div style="font-size: 11px; color: #38a169;">
                    ${penalizacionSugerida > 0 ? `Incluye ${penalizacionSugerida.toFixed(2)}€ en penalizaciones` : 'Sin penalizaciones'}
                  </div>
                </div>
              </div>
              
              <div style="background: ${ahorroAnual >= 0 ? '#d4edda' : '#f8d7da'}; border: 2px solid ${ahorroAnual >= 0 ? '#9ae6b4' : '#f5c6cb'}; border-radius: 8px; padding: 16px; text-align: center;">
                <div style="font-size: 13px; color: #666; margin-bottom: 6px; font-weight: 600;">
                  ${ahorroAnual >= 0 ? '💰 Ahorro Potencial en Potencia' : '⚠️ Coste Adicional en Potencia'}
                </div>
                <div style="font-size: 32px; font-weight: 700; color: ${ahorroAnual >= 0 ? '#27ae60' : '#e53e3e'}; margin-bottom: 4px;">
                  ${ahorroAnual >= 0 ? '+' : ''}${ahorroAnual.toFixed(2)}€/año
                </div>
                <div style="font-size: 14px; color: #666;">
                  (${ahorroAnual >= 0 ? '+' : ''}${ahorroMensual.toFixed(2)}€/mes)
                </div>
              </div>
            </div>
          `;
        }

        selectedOffersForPDF = [true, true, true];

        html += `
          <div class="pdf-selection-info">
            <span style="font-size: 20px;">📋</span>
            <div style="flex: 1;">
              Selecciona las ofertas que deseas incluir en el PDF para enviar al cliente.
              <strong><span class="pdf-selection-count" id="pdfSelectionCount">3</span> ofertas seleccionadas</strong>
            </div>
          </div>
        `;

        html += '<div class="offers-grid">';

        const medals = ['🥇', '🥈', '🥉'];
        comparison.top_3_offers.forEach((offer, index) => {
          const offerSavings = offer.savings;
          const isOfferSavings = offerSavings >= 0;
          const offerSavingsClass = isOfferSavings ? 'positive' : 'negative';
          const offerSavingsLabel = isOfferSavings ? 'Ahorro mensual' : 'Coste adicional';
          const offerSavingsValue = Math.abs(offerSavings).toFixed(2);
          
          html += `
            <div class="offer-card">
              <div class="offer-header-container">
                <div class="offer-header-left">
                  <div class="offer-company">${offer.company}</div>
                  <div class="offer-product">${offer.product}</div>
                </div>
                <div class="offer-header-right">
                  <div class="offer-selector">
                    <input type="checkbox" id="offer-checkbox-${index}" class="offer-checkbox" 
                           ${selectedOffersForPDF[index] ? 'checked' : ''} 
                           onchange="toggleOfferForPDF(${index})">
                    <label for="offer-checkbox-${index}" style="cursor: pointer; user-select: none;">
                      PDF
                    </label>
                  </div>
                  <div class="offer-medal">${medals[index]}</div>
                </div>
              </div>

              <div class="offer-savings-box ${offerSavingsClass}">
                <div class="offer-savings-amount">${isOfferSavings ? '' : '-'}${offerSavingsValue} €</div>
                <div class="offer-savings-label">${offerSavingsLabel}</div>
              </div>

              <div class="offer-details-compact">
                <div class="offer-section-compact">
                  <div class="offer-section-title-compact">Precios Energía</div>`;
          
          for (let i = 1; i <= numEnergyPeriods; i++) {
            const energiaPrice = offer['energia_p'+i];
            if (energiaPrice !== undefined) {
              html += `
                  <div class="offer-price-row">
                    <span>P${i}</span>
                    <span>${energiaPrice.toFixed(6)} €/kWh</span>
                  </div>`;
            }
          }
          
          html += `
                </div>

                <div class="offer-section-compact">
                  <div class="offer-section-title-compact">Precios Potencia</div>`;
          
          for (let i = 1; i <= numPowerPeriods; i++) {
            const potPrice = offer['pot_'+i];
            if (potPrice !== undefined) {
              html += `
                  <div class="offer-price-row">
                    <span>P${i}</span>
                    <span>${potPrice.toFixed(6)} €/kW/d</span>
                  </div>`;
            }
          }
          
          html += `
                </div>
              </div>

              <div class="offer-total-box">
                <div class="offer-total-label">Total Mensual</div>
                <div class="offer-total-value">${offer.total.toFixed(2)} €</div>
              </div>
            </div>
          `;
        });

        html += '</div>';

        html += `
          <div class="action-buttons">
            <button class="create-contract-button" onclick="createContractFromComparison()">
              <span>✨</span> Crear Contrato desde esta Comparación
            </button>
            <button class="download-pdf-button" onclick="downloadPDF()">
              <span class="button-text">📥 Descargar PDF</span>
              <div class="button-spinner"></div>
            </button>
            <button class="new-analysis-button" onclick="resetAnalysis()">
              🔄 Analizar Otra Factura
            </button>
            <button class="open-turbo-tun-button" onclick="openTurboTun()">
              🚀 Modo Turbo Tun
            </button>
          </div>
        `;

        results.innerHTML = html;
        results.classList.add('active');
      }

      function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.add('active');
        
        setTimeout(() => {
          errorMessage.classList.remove('active');
        }, 5000);
      }

      function hideError() {
        errorMessage.classList.remove('active');
      }
      
      console.log('✓ Comparador initialized with Turbo Tun Mode (v13)');
    })();
  </script>

      // ============================================
      // CREATE CONTRACT FROM COMPARISON
      // ============================================

      window.createContractFromComparison = function() {
        if (!currentComparisonData) {
          alert('No hay datos de comparación disponibles');
          return;
        }

        const comparison = currentComparisonData.comparison_data || currentComparisonData;
        const currentBill = comparison.current_bill;
        const bestOffer = comparison.top_3_offers && comparison.top_3_offers[0];

        if (!currentBill) {
          alert('No se encontraron datos de la factura actual');
          return;
        }

        // Store comparison data for contract creation
        const contractData = {
          // Mark as created from comparison
          created_from_comparison: true,
          comparison_id: comparison.comparison_id || Date.now(),
          comparison_date: new Date().toISOString(),

          // CUPS and tariff data
          cups: currentBill.cups || '',
          tarifa_acceso: comparison.tarifa_acceso || currentBill.tarifa_acceso || '',

          // Best offer data (if available)
          comercializadora: bestOffer ? bestOffer.company : '',
          concepto: bestOffer ? bestOffer.product : '',

          // Power data
          potencia_contratada_1: currentBill.potencia_p1 || 0,
          potencia_contratada_2: currentBill.potencia_p2 || 0,
          potencia_contratada_3: currentBill.potencia_p3 || 0,
          potencia_contratada_4: currentBill.potencia_p4 || 0,
          potencia_contratada_5: currentBill.potencia_p5 || 0,
          potencia_contratada_6: currentBill.potencia_p6 || 0,

          // Consumption data
          consumo_1: currentBill.consumo_p1 || 0,
          consumo_2: currentBill.consumo_p2 || 0,
          consumo_3: currentBill.consumo_p3 || 0,
          consumo_4: currentBill.consumo_p4 || 0,
          consumo_5: currentBill.consumo_p5 || 0,
          consumo_6: currentBill.consumo_p6 || 0,
          consumo: currentBill.total_consumption || 0,

          // Savings data
          estimated_monthly_savings: bestOffer ? bestOffer.savings : 0,
          estimated_annual_savings: bestOffer ? bestOffer.annual_savings : 0,
        };

        // Store in localStorage for the contract creation form
        localStorage.setItem('tunergia_contract_from_comparison', JSON.stringify(contractData));

        // Switch to Contratos view and open create modal
        if (window.TunergiaTabs) {
          window.TunergiaTabs.switchView('contratos');

          // Wait a bit for the view to load, then open create modal
          setTimeout(() => {
            const createBtn = document.getElementById('createBtn');
            if (createBtn) {
              createBtn.click();

              // Pre-fill the form after modal opens
              setTimeout(() => {
                prefillContractForm(contractData);
              }, 300);
            } else {
              alert('No se pudo abrir el formulario de creación de contrato. Por favor, intenta manualmente.');
            }
          }, 500);
        } else {
          alert('Función de navegación no disponible. Los datos se han guardado para crear el contrato manualmente.');
          console.log('Contract data saved:', contractData);
        }
      };

      /**
       * Pre-fill contract creation form with comparison data
       */
      function prefillContractForm(data) {
        try {
          // CUPS
          const cupsInput = document.getElementById('cupsInput');
          if (cupsInput && data.cups) {
            cupsInput.value = data.cups;
          }

          // Tarifa de Acceso
          const tarifaSelect = document.getElementById('createTarifaAcceso');
          if (tarifaSelect && data.tarifa_acceso) {
            tarifaSelect.value = data.tarifa_acceso;
            // Trigger change event to load products
            tarifaSelect.dispatchEvent(new Event('change'));
          }

          // Power fields
          for (let i = 1; i <= 6; i++) {
            const powerInput = document.querySelector('input[name="potencia_contratada_' + i + '"]');
            if (powerInput && data['potencia_contratada_' + i]) {
              powerInput.value = data['potencia_contratada_' + i];
            }
          }

          // Consumption fields
          for (let i = 1; i <= 6; i++) {
            const consumoInput = document.querySelector('input[name="consumo_' + i + '"]');
            if (consumoInput && data['consumo_' + i]) {
              consumoInput.value = data['consumo_' + i];
            }
          }

          // Total consumption
          const consumoTotal = document.querySelector('input[name="consumo"]');
          if (consumoTotal && data.consumo) {
            consumoTotal.value = data.consumo;
          }

          // Add a note in observations
          const observaciones = document.querySelector('textarea[name="observaciones"]');
          if (observaciones && data.estimated_monthly_savings) {
            const savingsNote = 'Contrato creado desde comparación.\n' +
              'CUPS: ' + data.cups + '\n' +
              'Ahorro estimado: ' + data.estimated_monthly_savings.toFixed(2) + '€/mes (' + data.estimated_annual_savings.toFixed(2) + '€/año)\n' +
              'Fecha de comparación: ' + new Date(data.comparison_date).toLocaleDateString() + '\n' +
              'ID Comparación: ' + data.comparison_id;
            observaciones.value = savingsNote;
          }

          console.log('Contract form pre-filled with comparison data');
        } catch (error) {
          console.error('Error pre-filling contract form:', error);
        }
      }
