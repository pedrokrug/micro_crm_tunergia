/**
 * Tunergia Configuration
 * Webhook URLs, BigQuery tables, and app settings
 */

window.TunergiaConfig = {
    // n8n Webhook URLs
    webhookUrl: 'https://tunuevaenergia.com/webhook/59200adf-d6df-4dd2-b319-5ab57d2e5052',
    nodoWebhookUrl: 'https://tunuevaenergia.com/webhook/nodo',
    documentWebhookUrl: 'https://tunuevaenergia.com/webhook/documento-nodo',
    sipsWebhookUrl: 'https://tunuevaenergia.com/webhook/SIPS-contrato-nodo',
    crearContratoUrl: 'https://tunuevaenergia.com/webhook/crear-contrato-nodo',

    // BigQuery Tables
    bigQueryTable: '`tunergia-1722509306765.NODO.Contratos_Comisiones`',
    productosTable: '`tunergia-1722509306765.Precios_Tunergia.Tarifas Fijas Portfolio`',

    // UI Settings
    itemsPerPage: 10
};

console.log('✅ Config loaded');
