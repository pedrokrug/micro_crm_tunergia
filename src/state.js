/**
 * Tunergia State Management
 * Application state and state management functions
 */

window.TunergiaState = {
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

// State management functions
window.setState = function(updates) {
    Object.assign(window.TunergiaState, updates);
};

window.getState = function(key) {
    return key ? window.TunergiaState[key] : window.TunergiaState;
};

console.log('✅ State loaded');
