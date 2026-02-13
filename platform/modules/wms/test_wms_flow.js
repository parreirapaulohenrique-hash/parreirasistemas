
// Mock localStorage
const localStorageMock = (function () {
    let store = {};
    return {
        getItem: function (key) { return store[key] || null; },
        setItem: function (key, value) { store[key] = value.toString(); },
        clear: function () { store = {}; },
        removeItem: function (key) { delete store[key]; }
    };
})();
global.localStorage = localStorageMock;
global.window = {};

// --- 1. COPY STOCK MANAGER LOGIC (from estoque.js) ---
window.StockManager = {
    getData: () => JSON.parse(localStorage.getItem('wms_mock_data') || '{"addresses":[]}'),
    saveData: (data) => localStorage.setItem('wms_mock_data', JSON.stringify(data)),

    add: function (sku, qty, locationId, desc = '', unit = 'UN') {
        const data = this.getData();
        const addrIndex = data.addresses.findIndex(a => (a.id || a.address) === locationId);
        if (addrIndex >= 0) {
            const addr = data.addresses[addrIndex];
            if (addr.status === 'OCUPADO' && addr.sku === sku) {
                addr.qty = (addr.qty || 0) + qty;
            } else {
                addr.status = 'OCUPADO';
                addr.sku = sku;
                addr.product = desc;
                addr.qty = qty;
                addr.unit = unit;
            }
            this.saveData(data);
            return true;
        }
        return false;
    },

    getAvailable: function (sku) {
        const data = this.getData();
        return data.addresses
            .filter(a => a.sku === sku && a.status === 'OCUPADO')
            .reduce((sum, a) => sum + (a.qty - (a.reserved || 0)), 0);
    },

    reserve: function (sku, qty) {
        const data = this.getData();
        let remaining = qty;
        const candidates = data.addresses.filter(a => a.sku === sku && a.status === 'OCUPADO' && (a.qty - (a.reserved || 0)) > 0);
        for (const addr of candidates) {
            if (remaining <= 0) break;
            const available = addr.qty - (addr.reserved || 0);
            const take = Math.min(available, remaining);
            addr.reserved = (addr.reserved || 0) + take;
            remaining -= take;
        }
        this.saveData(data);
        return remaining === 0;
    },

    commit: function (sku, qty) {
        const data = this.getData();
        let remaining = qty;
        const candidates = data.addresses.filter(a => a.sku === sku && a.status === 'OCUPADO');
        for (const addr of candidates) {
            if (remaining <= 0) break;
            if (addr.reserved > 0) {
                const take = Math.min(addr.reserved, remaining);
                addr.reserved -= take;
                addr.qty -= take;
                remaining -= take;
            } else if (addr.qty > 0) {
                const take = Math.min(addr.qty, remaining);
                addr.qty -= take;
                remaining -= take;
            }
            if (addr.qty <= 0) {
                addr.status = 'LIVRE';
                delete addr.sku;
                delete addr.product;
                delete addr.qty;
                delete addr.reserved;
            }
        }
        this.saveData(data);
    }
};

// --- SETUP INITIAL DATA ---
const initialData = {
    addresses: [
        { id: 'A-01', status: 'LIVRE' },
        { id: 'A-02', status: 'LIVRE' }
    ]
};
localStorage.setItem('wms_mock_data', JSON.stringify(initialData));

console.log("=== STARTING WMS LOGIC TEST ===");

// --- TEST 1: INBOUND (Recebimento) ---
console.log("\n[TEST 1] Inbound: Adding 100 units of SKU-TEST to A-01");
const stockData = window.StockManager.getData();
const freeAddr = stockData.addresses.find(a => a.status === 'LIVRE');
if (freeAddr) {
    window.StockManager.add('SKU-TEST', 100, freeAddr.id, 'Test Product');
    console.log("Status: OK");
} else {
    console.error("Status: FAILED (No free address)");
}

// Verify Stock
const avail1 = window.StockManager.getAvailable('SKU-TEST');
if (avail1 === 100) console.log(`Verified Stock: ${avail1} (Expected 100)`);
else console.error(`Verified Stock: ${avail1} (Expected 100)`);

// --- TEST 2: WAVE RESERVATION ---
console.log("\n[TEST 2] Wave: Reserving 30 units of SKU-TEST");
const reserved = window.StockManager.reserve('SKU-TEST', 30);
if (reserved) console.log("Reservation: SUCCESS");
else console.error("Reservation: FAILED");

// Verify Available
const avail2 = window.StockManager.getAvailable('SKU-TEST');
if (avail2 === 70) console.log(`Verified Available: ${avail2} (Expected 70)`); // 100 - 30 reserved
else console.error(`Verified Available: ${avail2} (Expected 70)`);

// Verify Physical Qty (should still be 100)
const data2 = window.StockManager.getData();
const addrA01 = data2.addresses.find(a => a.id === 'A-01');
if (addrA01.qty === 100 && addrA01.reserved === 30) console.log(`Physical Check: ${addrA01.qty} Qty, ${addrA01.reserved} Rsrv (Expected 100/30)`);
else console.error(`Physical Check: ${addrA01.qty}/${addrA01.reserved}`);

// --- TEST 3: PICKING COMMIT ---
console.log("\n[TEST 3] Picking: Committing (Deducting) 30 units");
window.StockManager.commit('SKU-TEST', 30);
console.log("Commit: DONE");

// Verify Stock
const avail3 = window.StockManager.getAvailable('SKU-TEST');
const data3 = window.StockManager.getData();
const addrA01_3 = data3.addresses.find(a => a.id === 'A-01');
if (avail3 === 70 && addrA01_3.qty === 70 && addrA01_3.reserved === 0) {
    console.log(`Final Check: ${avail3} Available, ${addrA01_3.qty} Physical, ${addrA01_3.reserved} Reserved`);
    console.log("TEST PASSED ✅");
} else {
    console.error(`Final Check FAILED: ${avail3} Avail, ${addrA01_3.qty} Qty, ${addrA01_3.reserved} Rsrv`);
}
