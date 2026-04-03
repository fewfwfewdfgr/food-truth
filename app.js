// Food Truth Scanner Logic
// Manages strictly UI State, Open Food Facts API calls, and the Ethical/Health interpretation engine

// Setup HTML5 Barcode Reader
let html5QrcodeScanner = null;

// DOM Elements
const viewHome = document.getElementById('view-home');
const viewReport = document.getElementById('view-report');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const startScanBtn = document.getElementById('startScanBtn');
const scannerModal = document.getElementById('scanner-modal');
const closeScannerBtn = document.getElementById('closeScannerBtn');
const loadingOverlay = document.getElementById('loadingOverlay');
const reportContent = document.getElementById('report-content');
const backBtn = document.getElementById('backBtn');

// --- 1. State Management ---
function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(viewId).classList.remove('hidden');
}

function showLoading(msg) {
  document.getElementById('loadingMsg').innerText = msg;
  loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

// --- 2. Live Search (Open Food Facts) ---
let searchTimeout;
searchInput.addEventListener('input', (e) => {
  const query = e.target.value.trim();
  clearTimeout(searchTimeout);
  if (query.length < 3) {
    searchResults.innerHTML = '';
    searchResults.classList.add('hidden');
    return;
  }
  
  // Debounce API calls
  searchTimeout = setTimeout(() => {
    fetchSearchResults(query);
  }, 500);
});

async function fetchSearchResults(query) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`);
    const data = await res.json();
    renderSearchResults(data.products);
  } catch (error) {
    console.error("Search API error:", error);
  }
}

function renderSearchResults(products) {
  if (!products || products.length === 0) {
    searchResults.innerHTML = '<div class="search-result-item"><div class="search-result-info"><p>No results found</p></div></div>';
    searchResults.classList.remove('hidden');
    return;
  }

  searchResults.innerHTML = products.map(p => `
    <div class="search-result-item" onclick="fetchProductDetails('${p._id}')">
      <img src="${p.image_thumb_url || 'https://via.placeholder.com/48?text=Food'}" alt="${p.product_name}">
      <div class="search-result-info">
        <h4>${p.product_name || 'Unknown Product'}</h4>
        <p>${p.brands || 'Unknown Brand'}</p>
      </div>
    </div>
  `).join('');
  searchResults.classList.remove('hidden');
}

// --- 3. Barcode Scanner ---
startScanBtn.addEventListener('click', async () => {
  // Explicitly prompt the Android/iOS OS for camera permissions first
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    // Instantly stop the stream since we just needed to trigger the permission prompt
    stream.getTracks().forEach(track => track.stop());
  } catch (err) {
    alert("Camera permission is required to scan barcodes. Please enable it in your phone settings.");
    console.warn("Camera access denied or unavailable:", err);
    return; // Stop the scanner from opening if permission is denied
  }

  scannerModal.classList.remove('hidden');
  html5QrcodeScanner = new Html5Qrcode("reader");
  html5QrcodeScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      // On success
      html5QrcodeScanner.stop().then(() => {
        scannerModal.classList.add('hidden');
        fetchProductDetails(decodedText);
      });
    },
    (errorMessage) => {
      // Ignored to avoid cluttering console
    }
  ).catch(err => console.error("Camera error:", err));
});

closeScannerBtn.addEventListener('click', () => {
  if(html5QrcodeScanner) html5QrcodeScanner.stop();
  scannerModal.classList.add('hidden');
});

// --- 4. Deep Product Fetch & Scoring Engine ---
async function fetchProductDetails(barcode) {
  searchResults.classList.add('hidden');
  searchInput.value = '';
  showLoading('Analyzing ingredients...');
  
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await res.json();
    
    if (data.status === 1) {
      const product = data.product;
      const report = generateReport(product);
      renderReport(report);
      switchView('view-report');
    } else {
      alert("Product not found in Open Food Facts database.");
    }
  } catch (err) {
    alert("Error fetching product data.");
    console.error(err);
  } finally {
    hideLoading();
  }
}

// --- 5. Health & Ethical Interpretation Engine ---
function generateReport(product) {
  const pName = product.product_name || "Unknown Product";
  const pBrand = product.brands || "Unknown Brand";
  const pImg = product.image_url || 'https://via.placeholder.com/150';
  
  let score = 100;
  let explanations = [];
  
  // Nutri-Score Penalty
  const nutri = product.nutriscore_grade || 'unknown';
  if (nutri === 'e') { score -= 30; explanations.push({type: 'health', text: "Very poor nutritional profile (Nutri-Score E). Linked to higher metabolic risks.", icon: "ri-heart-pulse-fill", level: "bad"}); }
  else if (nutri === 'd') { score -= 20; explanations.push({type: 'health', text: "High in sugar, salt, or saturated fats.", icon: "ri-heart-pulse-line", level: "bad"}); }
  else if (nutri === 'c') { score -= 10; explanations.push({type: 'health', text: "Moderate nutritional profile.", icon: "ri-heart-pulse-line", level: "med"}); }
  else if (nutri === 'a' || nutri === 'b') { explanations.push({type: 'health', text: "Good nutritional profile (whole foods or balanced).", icon: "ri-heart-pulse-line", level: "good"}); }

  // Nova Group (Processing)
  const nova = product.nova_group;
  if (nova === 4) {
    score -= 25;
    explanations.push({type: 'health', text: "Ultra-processed product. Contains cosmetic additives. Associated with negative long-term health concerns.", icon: "ri-test-tube-line", level: "bad"});
  } else if (nova === 1) {
    score += 5; // Whole food bonus
    if(score > 100) score = 100;
    explanations.push({type: 'health', text: "Unprocessed or minimally processed whole food.", icon: "ri-leaf-line", level: "good"});
  }

  // Eco-Score & Ethical Simulation
  const eco = product.ecoscore_grade || 'unknown';
  if (eco === 'e' || eco === 'd') {
    score -= 15;
    explanations.push({type: 'ethical', text: "Higher environmental impact. Linked to intensive farming practices or high carbon footprint.", icon: "ri-earth-line", level: "bad"});
  } else if (eco === 'a' || eco === 'b') {
    explanations.push({type: 'ethical', text: "Low environmental impact.", icon: "ri-earth-line", level: "good"});
  } else {
    explanations.push({type: 'ethical', text: "Low transparency on environmental impact and animal welfare.", icon: "ri-question-mark", level: "med"});
  }

  // Microplastics Risk Simulation (based on packaging)
  const packaging = (product.packaging || "").toLowerCase();
  if (packaging.includes('plastic')) {
    score -= 10;
    explanations.push({type: 'plastic', text: "Estimated exposure risk: Medium (Packaged in plastic).", icon: "ri-drop-line", level: "med"});
  } else if (packaging.includes('glass') || packaging.includes('paper')) {
    explanations.push({type: 'plastic', text: "Lowest microplastic probability (Non-plastic packaging).", icon: "ri-drop-fill", level: "good"});
  }

  // Additives
  if (product.additives_n > 5) {
    score -= 10;
    explanations.push({type: 'health', text: `Contains ${product.additives_n} additives (High). Potential combination effects unknown.`, icon: "ri-alert-line", level: "bad"});
  }

  // Bound score
  if (score < 0) score = 0;

  return { name: pName, brand: pBrand, img: pImg, score, explanations };
}

// --- 6. Report Rendering ---
function renderReport(report) {
  let scoreClass = 'bg-good';
  let colorHex = '#4ade80';
  if (report.score < 40) { scoreClass = 'bg-bad'; colorHex = '#ef4444'; }
  else if (report.score < 70) { scoreClass = 'bg-med'; colorHex = '#facc15'; }

  let healthHTML = ''; let ethicalHTML = ''; let plasticHTML = '';
  
  report.explanations.forEach(exp => {
    const item = `
      <li class="fact-item">
        <i class="${exp.icon} text-${exp.level}"></i>
        <span>${exp.text}</span>
      </li>
    `;
    if(exp.type === 'health') healthHTML += item;
    if(exp.type === 'ethical') ethicalHTML += item;
    if(exp.type === 'plastic') plasticHTML += item;
  });

  if(!healthHTML) healthHTML = '<li class="fact-item">No significant health data available.</li>';
  if(!ethicalHTML) ethicalHTML = '<li class="fact-item">No significant corporate intelligence available.</li>';
  if(!plasticHTML) plasticHTML = '<li class="fact-item">No verified packaging data.</li>';

  reportContent.innerHTML = `
    <div class="product-hero">
      <img src="${report.img}" alt="${report.name}" class="product-image">
      <h3>${report.name}</h3>
      <p class="subtitle" style="margin-top:4px;">${report.brand}</p>
    </div>

    <div class="score-container">
      <div class="score-circle ${scoreClass}" style="box-shadow: 0 0 40px ${colorHex}40;">
        <span class="number">${report.score}</span>
        <span class="label">/ 100</span>
      </div>
    </div>

    <div class="card glass-panel ${scoreClass}" style="background-image: none;">
      <div class="card-header"><i class="ri-heart-pulse-fill"></i> Health Interpretation</div>
      <ul class="fact-list">${healthHTML}</ul>
    </div>

    <div class="card glass-panel">
      <div class="card-header"><i class="ri-eye-line text-med"></i> Corporate Intelligence</div>
      <ul class="fact-list">${ethicalHTML}</ul>
    </div>

    <div class="card glass-panel">
      <div class="card-header"><i class="ri-flask-line text-bad"></i> Microplastics Risk</div>
      <ul class="fact-list">${plasticHTML}</ul>
    </div>
  `;
}

// Controls
backBtn.addEventListener('click', () => {
  switchView('view-home');
});
