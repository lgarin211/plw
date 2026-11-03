/**
 * Dashboard Pengadaan & Pengeluaran - Client-Side Google Sheet Scraper
 * Framework-free, pure vanilla JavaScript ES6+
 */

// Global Configuration & State
const CONFIG = {
  defaultSheetUrl: 'https://docs.google.com/spreadsheets/d/1VIDlPLHbL79ctmFlMxxvxn_FDlrXtQWNh7lexT02tC8/edit?usp=sharing',
  defaultGid: '0',
  storageKey: 'procurement_dashboard_config',
  cacheKey: 'procurement_dashboard_data_cache',
  autoRefreshIntervalMs: 30000, // 30 detik
};

const state = {
  sheetUrl: '',
  sheetId: '',
  gid: '0',
  rawData: [],
  filteredData: [],
  sortColumn: 'no',
  sortDirection: 'asc', // 'asc' or 'desc'
  searchTerm: '',
  selectedProject: 'ALL',
  selectedStatus: 'ALL',
  hideEmptyRows: true,
  autoRefreshTimer: null,
  chartInstances: {
    projectSpending: null,
    itemSpending: null,
  }
};

// ==========================================
// 1. Initializer & Configuration Management
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  loadSavedConfig();
  bindEvents();
  fetchAndRenderData();
});

function loadSavedConfig() {
  const saved = localStorage.getItem(CONFIG.storageKey);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state.sheetUrl = parsed.sheetUrl || CONFIG.defaultSheetUrl;
      state.gid = parsed.gid || CONFIG.defaultGid;
    } catch (e) {
      state.sheetUrl = CONFIG.defaultSheetUrl;
      state.gid = CONFIG.defaultGid;
    }
  } else {
    state.sheetUrl = CONFIG.defaultSheetUrl;
    state.gid = CONFIG.defaultGid;
  }

  state.sheetId = extractSheetId(state.sheetUrl);

  // Update URL link on header
  const openSheetBtn = document.getElementById('btnOpenSheet');
  if (openSheetBtn) openSheetBtn.href = state.sheetUrl;

  // Set modal input values
  const inputUrl = document.getElementById('inputSheetUrl');
  const inputGid = document.getElementById('inputSheetGid');
  if (inputUrl) inputUrl.value = state.sheetUrl;
  if (inputGid) inputGid.value = state.gid;
}

function extractSheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return '1VIDlPLHbL79ctmFlMxxvxn_FDlrXtQWNh7lexT02tC8';
}

function extractGid(url) {
  const match = url.match(/[#&]gid=([0-9]+)/);
  return match && match[1] ? match[1] : '0';
}

// ==========================================
// 2. Client-Side Google Sheets Scraper
// ==========================================
/**
 * Scrapes Google Sheet data directly on the client side.
 * Uses JSONP for file:// URLs to avoid origin restrictions,
 * and standard fetch for web server origins with JSONP fallback.
 */
async function scrapeGoogleSheet(sheetId, gid = '0') {
  // If running locally via file:// protocol, use JSONP directly
  if (window.location.protocol === 'file:') {
    return await scrapeViaJSONP(sheetId, gid);
  }

  // Try standard fetch first
  try {
    const endpoint = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?gid=${gid}&tqx=out:json`;
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    const rawText = await response.text();
    const jsonStr = rawText.substring(rawText.indexOf('{'), rawText.lastIndexOf('}') + 1);
    return JSON.parse(jsonStr);
  } catch (fetchErr) {
    console.warn('Direct fetch failed (possible CORS or network), falling back to JSONP...', fetchErr);
    return await scrapeViaJSONP(sheetId, gid);
  }
}

/**
 * Scrapes Google Sheet using JSONP via dynamic <script> tag.
 * Completely immune to browser CORS 'null' origin policy on file://.
 */
function scrapeViaJSONP(sheetId, gid = '0') {
  return new Promise((resolve, reject) => {
    const callbackName = 'gviz_callback_' + Math.floor(Math.random() * 1000000);
    const timeoutDuration = 12000;

    let timeoutTimer = setTimeout(() => {
      cleanup();
      reject(new Error('Koneksi timeout saat mengambil data dari Google Sheet. Periksa koneksi internet Anda.'));
    }, timeoutDuration);

    const script = document.createElement('script');

    function cleanup() {
      clearTimeout(timeoutTimer);
      if (window[callbackName]) {
        delete window[callbackName];
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    window[callbackName] = function (data) {
      cleanup();
      resolve(data);
    };

    script.onerror = function () {
      cleanup();
      reject(new Error('Gagal memuat Google Sheet via JSONP. Pastikan link Google Sheet disetel "Anyone with the link can view".'));
    };

    script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?gid=${gid}&tqx=responseHandler:${callbackName}`;
    document.head.appendChild(script);
  });
}

// ==========================================
// 3. Data Cleaning & Normalization
// ==========================================
function parseSheetResponse(gvizData) {
  if (!gvizData || !gvizData.table || !gvizData.table.rows) {
    throw new Error('Format data Google Sheet tidak valid atau kosong.');
  }

  const rows = gvizData.table.rows;
  const parsedItems = [];

  rows.forEach((rowObj, index) => {
    const cells = rowObj.c || [];

    // Extract cell values safely
    const project = getCellValue(cells[0]) || '';
    const noRaw = getCellValue(cells[1]);
    const nama = getCellValue(cells[2]) || '';
    const qtyRaw = getCellValue(cells[3]);
    const hargaQtyRaw = getCellValue(cells[4]);
    const totalHargaRaw = getCellValue(cells[5]);
    const approve = parseBoolean(getCellValue(cells[6]));
    const processed = parseBoolean(getCellValue(cells[7]));
    const lokasi = getCellValue(cells[8]) || '';
    const note = getCellValue(cells[9]) || '';

    // Numerical parsing
    const no = parseNumber(noRaw) || (index + 1);
    const qty = parseNumber(qtyRaw) || 0;
    const hargaQty = parseCurrencyOrNumber(hargaQtyRaw);
    let totalHarga = parseCurrencyOrNumber(totalHargaRaw);

    // If totalHarga is 0 but qty and hargaQty exist, calculate it
    if (totalHarga === 0 && qty > 0 && hargaQty > 0) {
      totalHarga = qty * hargaQty;
    }

    // Check if row has meaningful data or is just an empty template row
    const hasContent = Boolean(
      (nama && nama.trim() !== '') ||
      (project && project.trim() !== '') ||
      (totalHarga > 0) ||
      (qty > 0 && (nama || project))
    );

    parsedItems.push({
      index: index + 1,
      no: no,
      project: project.trim(),
      nama: nama.trim(),
      qty: qty,
      hargaQty: hargaQty,
      totalHarga: totalHarga,
      approve: approve,
      processed: processed,
      lokasi: lokasi.trim(),
      note: note.trim(),
      isEmptyRow: !hasContent
    });
  });

  return parsedItems;
}

function getCellValue(cell) {
  if (!cell) return null;
  return cell.v !== undefined ? cell.v : (cell.f !== undefined ? cell.f : null);
}

function parseBoolean(val) {
  if (typeof val === 'boolean') return val;
  if (!val) return false;
  const s = String(val).trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'YES' || s === 'YA';
}

function parseNumber(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function parseCurrencyOrNumber(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  // Handle formats like " Rp 22,500.00 " or " Rp -   "
  const str = String(val);
  if (str.includes('-') && !str.match(/[0-9]/)) {
    return 0;
  }
  const cleaned = str.replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

// ==========================================
// 4. Fetch Orchestrator & UI Render
// ==========================================
async function fetchAndRenderData() {
  setLoadingState(true);

  try {
    const rawGviz = await scrapeGoogleSheet(state.sheetId, state.gid);
    const parsedRows = parseSheetResponse(rawGviz);

    state.rawData = parsedRows;

    // Cache locally for instant loading next time
    localStorage.setItem(CONFIG.cacheKey, JSON.stringify({
      timestamp: Date.now(),
      data: parsedRows
    }));

    updateConnectionStatus(true);
    populateProjectDropdown();
    applyFiltersAndSort();
    showToast('Data berhasil diperbarui secara live!', 'success');
  } catch (error) {
    console.error('Scraping error:', error);
    updateConnectionStatus(false, error.message);

    // Try fallback to local cache
    const cached = localStorage.getItem(CONFIG.cacheKey);
    if (cached) {
      try {
        const { timestamp, data } = JSON.parse(cached);
        state.rawData = data;
        populateProjectDropdown();
        applyFiltersAndSort();
        const dateStr = new Date(timestamp).toLocaleTimeString('id-ID');
        showToast(`Gagal sync live. Menampilkan data cache (${dateStr})`, 'error');
      } catch (e) {
        showEmptyTable('Gagal mengambil data dari Google Sheet dan tidak ada cache.');
      }
    } else {
      showEmptyTable('Gagal memuat data dari Google Sheet. Pastikan akses spreadsheet bersifat publik.');
    }
  } finally {
    setLoadingState(false);
  }
}

function updateConnectionStatus(isOnline, errorMsg = '') {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  const time = document.getElementById('lastUpdatedTime');

  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  if (isOnline) {
    if (dot) {
      dot.className = 'inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
    }
    if (text) text.textContent = 'Terhubung ke Google Sheet';
    if (time) time.textContent = `Update: ${timeStr} WIB`;
    hideBanner();
  } else {
    if (dot) {
      dot.className = 'inline-block w-2 h-2 rounded-full bg-red-500';
    }
    if (text) text.textContent = 'Gagal Sinkronisasi';
    if (time) time.textContent = `Terakhir coba: ${timeStr}`;
    showBanner('Koneksi Terganggu', errorMsg || 'Tidak dapat terhubung ke link Google Sheet. Menampilkan data lokal jika tersedia.', 'error');
  }
}

function setLoadingState(isLoading) {
  const refreshIcon = document.getElementById('refreshIcon');
  const btnRefresh = document.getElementById('btnRefresh');

  if (isLoading) {
    if (refreshIcon) refreshIcon.classList.add('fa-spin');
    if (btnRefresh) btnRefresh.classList.add('opacity-70', 'pointer-events-none');
  } else {
    if (refreshIcon) refreshIcon.classList.remove('fa-spin');
    if (btnRefresh) btnRefresh.classList.remove('opacity-70', 'pointer-events-none');
  }
}

// ==========================================
// 5. Filtering, Searching, & Sorting
// ==========================================
function populateProjectDropdown() {
  const select = document.getElementById('filterProject');
  if (!select) return;

  const currentVal = select.value;
  const projects = new Set();

  state.rawData.forEach(item => {
    if (item.project && item.project.trim() !== '') {
      projects.add(item.project.trim());
    }
  });

  // Preserve options
  select.innerHTML = '<option value="ALL">Semua Project</option>';
  Array.from(projects).sort().forEach(proj => {
    const opt = document.createElement('option');
    opt.value = proj;
    opt.textContent = proj;
    select.appendChild(opt);
  });

  if (projects.has(currentVal)) {
    select.value = currentVal;
  }
}

function applyFiltersAndSort() {
  let items = [...state.rawData];

  // 1. Hide empty template rows if enabled
  if (state.hideEmptyRows) {
    items = items.filter(item => !item.isEmptyRow);
  }

  // 2. Filter by project
  if (state.selectedProject !== 'ALL') {
    items = items.filter(item => item.project.toLowerCase() === state.selectedProject.toLowerCase());
  }

  // 3. Filter by status
  if (state.selectedStatus === 'APPROVED') {
    items = items.filter(item => item.approve === true);
  } else if (state.selectedStatus === 'NOT_APPROVED') {
    items = items.filter(item => item.approve === false);
  } else if (state.selectedStatus === 'PROCESSED') {
    items = items.filter(item => item.processed === true);
  }

  // 4. Filter by search query
  if (state.searchTerm) {
    const q = state.searchTerm.toLowerCase();
    items = items.filter(item =>
      item.nama.toLowerCase().includes(q) ||
      item.project.toLowerCase().includes(q) ||
      item.lokasi.toLowerCase().includes(q) ||
      item.note.toLowerCase().includes(q)
    );
  }

  // 5. Sort items
  items.sort((a, b) => {
    let valA = a[state.sortColumn];
    let valB = b[state.sortColumn];

    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();

    if (valA < valB) return state.sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return state.sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  state.filteredData = items;

  // Render components
  renderKPICards(items);
  renderCharts(items);
  renderTable(items);
}

// ==========================================
// 6. KPI Metrics Calculation & Rendering
// ==========================================
function renderKPICards(items) {
  // Summing metrics
  const totalHarga = items.reduce((acc, curr) => acc + (curr.totalHarga || 0), 0);
  const totalQty = items.reduce((acc, curr) => acc + (curr.qty || 0), 0);
  const totalRows = items.filter(i => !i.isEmptyRow).length;

  // Average price per item
  const validPriceItems = items.filter(i => i.hargaQty > 0);
  console.log(validPriceItems)
  const avgHarga = (validPriceItems.length)
    ? funnyang(validPriceItems)
    : 0;


  function funnyang(validPriceItems) {
    var total = 0
    for (let index = 0; index < validPriceItems.length; index++) {
      console.log(validPriceItems[index])
      var newdata = validPriceItems[index]
      if (newdata.approve != true) {
        total = total + newdata.hargaQty * newdata.qty
      }
    }
    console.log(total)
    return total;
  }

  // Status counts
  const approveCount = items.filter(i => i.approve === true).length;
  const processedCount = items.filter(i => i.processed === true).length;
  const pendingCount = items.filter(i => !i.approve && !i.isEmptyRow).length;

  const approvePct = totalRows > 0 ? Math.round((approveCount / totalRows) * 100) : 0;

  // Update DOM elements
  updateText('kpiTotalHarga', formatRupiah(totalHarga));
  updateText('kpiTotalQty', `${formatNumber(totalQty)} <span class="text-sm font-normal text-slate-500">pcs</span>`, true);
  updateText('kpiTotalRows', totalRows);
  updateText('kpiAvgHarga', formatRupiah(avgHarga));
  updateText('kpiApproveCount', approveCount);
  updateText('kpiProcessedCount', processedCount);
  updateText('kpiPendingCount', pendingCount);
  updateText('kpiApprovePercentage', `${approvePct}% barang telah di-approve`);

  // Footer totals
  updateText('footTotalQty', `${formatNumber(totalQty)} pcs`);
  updateText('footTotalHarga', formatRupiah(totalHarga));
  updateText('filteredBadge', `${items.length} data`);
}

function updateText(elementId, content, isHtml = false) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (isHtml) {
    el.innerHTML = content;
  } else {
    el.textContent = content;
  }
}

// ==========================================
// 7. Visual Charts (Chart.js)
// ==========================================
function renderCharts(items) {
  renderProjectSpendingChart(items);
  renderItemSpendingChart(items);
}

function renderProjectSpendingChart(items) {
  const canvas = document.getElementById('chartProjectSpending');
  if (!canvas || typeof Chart === 'undefined') return;

  // Aggregate spending by project
  const projectMap = {};
  items.forEach(item => {
    const projName = item.project || (item.isEmptyRow ? 'Baris Kosong' : 'Lainnya');
    projectMap[projName] = (projectMap[projName] || 0) + item.totalHarga;
  });

  const labels = Object.keys(projectMap);
  const data = Object.values(projectMap);

  if (state.chartInstances.projectSpending) {
    state.chartInstances.projectSpending.destroy();
  }

  const palette = [
    '#2563eb', // blue-600
    '#10b981', // emerald-500
    '#f59e0b', // amber-500
    '#8b5cf6', // violet-500
    '#ec4899', // pink-500
    '#06b6d4', // cyan-500
    '#64748b'  // slate-500
  ];

  state.chartInstances.projectSpending = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels.length > 0 ? labels : ['Tidak Ada Data'],
      datasets: [{
        data: data.length > 0 ? data : [1],
        backgroundColor: palette.slice(0, Math.max(labels.length, 1)),
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 12,
            font: { size: 11, family: 'Inter' },
            padding: 12
          }
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const val = context.raw || 0;
              return ` ${context.label}: ${formatRupiah(val)}`;
            }
          }
        }
      },
      cutout: '65%'
    }
  });
}

function renderItemSpendingChart(items) {
  const canvas = document.getElementById('chartItemSpending');
  if (!canvas || typeof Chart === 'undefined') return;

  // Filter meaningful items and sort by totalHarga descending (top 7)
  const validItems = items.filter(i => i.totalHarga > 0);
  validItems.sort((a, b) => b.totalHarga - a.totalHarga);
  const topItems = validItems.slice(0, 7);

  const labels = topItems.map(i => {
    // Shorten long product names
    let name = i.nama || `Barang #${i.no}`;
    if (name.length > 28) {
      name = name.substring(0, 26) + '...';
    }
    return name;
  });
  const values = topItems.map(i => i.totalHarga);

  if (state.chartInstances.itemSpending) {
    state.chartInstances.itemSpending.destroy();
  }

  state.chartInstances.itemSpending = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels.length > 0 ? labels : ['Tidak Ada Data'],
      datasets: [{
        label: 'Total Harga',
        data: values.length > 0 ? values : [0],
        backgroundColor: '#3b82f6',
        borderRadius: 6,
        hoverBackgroundColor: '#1d4ed8'
      }]
    },
    options: {
      indexAxis: 'y', // Horizontal Bar Chart
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: '#f1f5f9' },
          ticks: {
            font: { size: 10, family: 'Inter' },
            callback: function (val) {
              if (val >= 1000000) return 'Rp ' + (val / 1000000) + ' Jt';
              if (val >= 1000) return 'Rp ' + (val / 1000) + ' Rb';
              return 'Rp ' + val;
            }
          }
        },
        y: {
          grid: { display: false },
          ticks: {
            font: { size: 11, family: 'Inter' }
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (context) {
              return ` Total: ${formatRupiah(context.raw)}`;
            }
          }
        }
      }
    }
  });
}

// ==========================================
// 8. Table View & Interactive Rows
// ==========================================
function renderTable(items) {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="py-12 text-center text-slate-400">
          <i class="fa-solid fa-folder-open text-2xl mb-2 text-slate-300"></i>
          <p class="font-medium text-slate-500">Tidak ada data yang sesuai filter / pencarian.</p>
          <p class="text-xs text-slate-400 mt-1">Coba sesuaikan kata kunci pencarian atau ubah filter status.</p>
        </td>
      </tr>
    `;
    return;
  }

  const rowsHtml = items.map((item, idx) => {
    // Project badge style
    const projectBadge = item.project
      ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-200">${escapeHtml(item.project)}</span>`
      : `<span class="text-slate-400 italic text-[11px]">-</span>`;

    // Nama item & link detection
    let namaDisplay = escapeHtml(item.nama) || `<span class="text-slate-400 italic">Baris kosong #${item.no}</span>`;
    if (item.nama && item.nama.toLowerCase().includes('tokopedia')) {
      namaDisplay = `
        <div class="flex items-start gap-1.5">
          <i class="fa-solid fa-bag-shopping text-emerald-500 mt-0.5 text-xs"></i>
          <span>${namaDisplay}</span>
        </div>
      `;
    }

    // Status badges
    const approveBadge = item.approve
      ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700"><i class="fa-solid fa-check text-[9px]"></i> Approved</span>`
      : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500"><i class="fa-solid fa-clock text-[9px]"></i> Pending</span>`;

    const processedBadge = item.processed
      ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700"><i class="fa-solid fa-truck-fast text-[9px]"></i> Selesai</span>`
      : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500"><i class="fa-solid fa-minus text-[9px]"></i> Belum</span>`;

    const trClass = item.isEmptyRow
      ? 'bg-slate-50/50 hover:bg-slate-100/60 opacity-60'
      : 'hover:bg-blue-50/40 transition-colors';

    return `
      <tr class="${trClass}">
        <td class="py-3 px-4 text-center font-semibold text-slate-500">${item.no}</td>
        <td class="py-3 px-4">${projectBadge}</td>
        <td class="py-3 px-4 font-medium text-slate-800">${namaDisplay}</td>
        <td class="py-3 px-4 text-right font-semibold text-slate-700">${formatNumber(item.qty)}</td>
        <td class="py-3 px-4 text-right text-slate-600">${formatRupiah(item.hargaQty)}</td>
        <td class="py-3 px-4 text-right font-bold text-slate-900">${formatRupiah(item.totalHarga)}</td>
        <td class="py-3 px-4 text-center">${approveBadge}</td>
        <td class="py-3 px-4 text-center">${processedBadge}</td>
        <td class="py-3 px-4 text-slate-600">${escapeHtml(item.lokasi) || '-'}</td>
        <td class="py-3 px-4 text-slate-500 text-[11px]">${escapeHtml(item.note) || '-'}</td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml;
}

function showEmptyTable(message) {
  const tbody = document.getElementById('tableBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="py-12 text-center text-red-500">
          <i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
          <p class="font-medium">${message}</p>
        </td>
      </tr>
    `;
  }
}

// ==========================================
// 9. Event Listeners & User Interactions
// ==========================================
function bindEvents() {
  // Refresh button
  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      fetchAndRenderData();
    });
  }

  // Auto-refresh toggle
  const autoRefreshToggle = document.getElementById('autoRefreshToggle');
  if (autoRefreshToggle) {
    autoRefreshToggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        state.autoRefreshTimer = setInterval(() => {
          fetchAndRenderData();
        }, CONFIG.autoRefreshIntervalMs);
        showToast('Auto-sync diaktifkan (tiap 30 detik)', 'info');
      } else {
        if (state.autoRefreshTimer) {
          clearInterval(state.autoRefreshTimer);
          state.autoRefreshTimer = null;
        }
        showToast('Auto-sync dinonaktifkan', 'info');
      }
    });
  }

  // Search input
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchTerm = e.target.value.trim();
      applyFiltersAndSort();
    });
  }

  // Project Filter
  const filterProject = document.getElementById('filterProject');
  if (filterProject) {
    filterProject.addEventListener('change', (e) => {
      state.selectedProject = e.target.value;
      applyFiltersAndSort();
    });
  }

  // Status Filter
  const filterStatus = document.getElementById('filterStatus');
  if (filterStatus) {
    filterStatus.addEventListener('change', (e) => {
      state.selectedStatus = e.target.value;
      applyFiltersAndSort();
    });
  }

  // Hide Empty Rows Toggle
  const hideEmptyToggle = document.getElementById('hideEmptyRowsToggle');
  if (hideEmptyToggle) {
    hideEmptyToggle.addEventListener('change', (e) => {
      state.hideEmptyRows = e.target.checked;
      applyFiltersAndSort();
    });
  }

  // Table Column Headers Sort
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort');
      if (state.sortColumn === col) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortColumn = col;
        state.sortDirection = 'asc';
      }

      // Update table header indicators
      document.querySelectorAll('th[data-sort]').forEach(header => {
        header.classList.remove('sorted-asc', 'sorted-desc');
      });
      th.classList.add(state.sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');

      applyFiltersAndSort();
    });
  });

  // Export CSV
  const btnExport = document.getElementById('btnExportCSV');
  if (btnExport) {
    btnExport.addEventListener('click', exportToCSV);
  }

  // Config Modal
  const btnOpenConfig = document.getElementById('btnOpenConfig');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const configModal = document.getElementById('configModal');
  const btnSaveConfig = document.getElementById('btnSaveConfig');
  const btnResetDefault = document.getElementById('btnResetDefault');

  if (btnOpenConfig && configModal) {
    btnOpenConfig.addEventListener('click', () => {
      configModal.classList.remove('hidden');
    });
  }

  if (btnCloseModal && configModal) {
    btnCloseModal.addEventListener('click', () => {
      configModal.classList.add('hidden');
    });
  }

  if (btnSaveConfig) {
    btnSaveConfig.addEventListener('click', () => {
      const inputUrl = document.getElementById('inputSheetUrl').value.trim();
      const inputGid = document.getElementById('inputSheetGid').value.trim() || '0';

      if (!inputUrl) {
        showToast('Mohon masukkan URL Google Sheet yang valid', 'error');
        return;
      }

      state.sheetUrl = inputUrl;
      state.sheetId = extractSheetId(inputUrl);
      state.gid = inputGid;

      // Save to localStorage
      localStorage.setItem(CONFIG.storageKey, JSON.stringify({
        sheetUrl: state.sheetUrl,
        gid: state.gid
      }));

      // Update external link
      const openSheetBtn = document.getElementById('btnOpenSheet');
      if (openSheetBtn) openSheetBtn.href = state.sheetUrl;

      configModal.classList.add('hidden');
      showToast('Konfigurasi disimpan. Memuat ulang data...', 'info');
      fetchAndRenderData();
    });
  }

  if (btnResetDefault) {
    btnResetDefault.addEventListener('click', () => {
      document.getElementById('inputSheetUrl').value = CONFIG.defaultSheetUrl;
      document.getElementById('inputSheetGid').value = CONFIG.defaultGid;
    });
  }

  // Dismiss status banner
  const bannerDismiss = document.getElementById('bannerDismiss');
  if (bannerDismiss) {
    bannerDismiss.addEventListener('click', hideBanner);
  }
}

// ==========================================
// 10. Utilities & Export
// ==========================================
function formatRupiah(num) {
  if (isNaN(num) || num === null || num === undefined) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num);
}

function formatNumber(num) {
  if (isNaN(num) || num === null || num === undefined) return '0';
  return new Intl.NumberFormat('id-ID').format(num);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMessage');
  const toastIcon = document.getElementById('toastIcon');

  if (!toast || !toastMsg) return;

  toastMsg.textContent = message;
  toast.className = 'toast-notification';

  if (type === 'success') {
    toast.classList.add('toast-success');
    if (toastIcon) toastIcon.className = 'fa-solid fa-circle-check mr-2';
  } else if (type === 'error') {
    toast.classList.add('toast-error');
    if (toastIcon) toastIcon.className = 'fa-solid fa-triangle-exclamation mr-2';
  } else {
    toast.classList.add('toast-info');
    if (toastIcon) toastIcon.className = 'fa-solid fa-circle-info mr-2';
  }

  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

function showBanner(title, desc, type = 'error') {
  const banner = document.getElementById('statusBanner');
  const bannerTitle = document.getElementById('bannerTitle');
  const bannerDesc = document.getElementById('bannerDesc');
  const bannerIcon = document.getElementById('bannerIcon');

  if (!banner) return;

  bannerTitle.textContent = title;
  bannerDesc.textContent = desc;

  if (type === 'error') {
    banner.className = 'mb-6 p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 flex items-center justify-between';
    bannerIcon.className = 'fa-solid fa-triangle-exclamation text-red-500 text-lg';
  }

  banner.classList.remove('hidden');
}

function hideBanner() {
  const banner = document.getElementById('statusBanner');
  if (banner) banner.classList.add('hidden');
}

function exportToCSV() {
  if (!state.filteredData || state.filteredData.length === 0) {
    showToast('Tidak ada data untuk diekspor', 'error');
    return;
  }

  const headers = ['No', 'Project', 'Nama Barang', 'Qty', 'Harga Satuan', 'Total Harga', 'Approve', 'Processed', 'Lokasi Pengiriman', 'Note'];
  const csvRows = [headers.join(',')];

  state.filteredData.forEach(item => {
    const row = [
      item.no,
      `"${(item.project || '').replace(/"/g, '""')}"`,
      `"${(item.nama || '').replace(/"/g, '""')}"`,
      item.qty,
      item.hargaQty,
      item.totalHarga,
      item.approve ? 'TRUE' : 'FALSE',
      item.processed ? 'TRUE' : 'FALSE',
      `"${(item.lokasi || '').replace(/"/g, '""')}"`,
      `"${(item.note || '').replace(/"/g, '""')}"`,
    ];
    csvRows.push(row.join(','));
  });

  const csvString = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `pengadaan_sheet_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('File CSV berhasil diunduh!', 'success');
}
