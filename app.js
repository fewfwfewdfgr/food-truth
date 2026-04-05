// Food Truth Scanner Logic
// Manages strictly UI State, Open Food Facts API calls, and the Ethical/Health interpretation engine

// Setup HTML5 Barcode Reader
let html5QrcodeScanner = null;

// DOM Elements
const viewHome = document.getElementById('view-home');
const viewReport = document.getElementById('view-report');

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
      if (html5QrcodeScanner.isProcessing) return;
      html5QrcodeScanner.isProcessing = true;
      
      // Add a 500ms delay so scanning isn't jarringly instant and freezing
      setTimeout(() => {
        html5QrcodeScanner.stop().then(() => {
          html5QrcodeScanner.isProcessing = false;
          scannerModal.classList.add('hidden');
          fetchProductDetails(decodedText);
        });
      }, 500);
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
// --- 5. Custom Health & Ingredient Engine ---
function generateReport(product) {
  const pName = product.product_name || "Unknown Product";
  const pBrand = product.brands || "Unknown Brand";
  const pImg = product.image_url || 'https://via.placeholder.com/150';
  
  let healthScore = 100;
  let ecoScore = 100;
  let plasticScore = 100;
  let explanations = [];
  
  const ingredients = (product.ingredients_text || "").toLowerCase();
  
  // --- Deep Ingredient Check (Gut Health, Acne, Bloating, Mental, Addiction) ---

  // 1. Gut Health Modulators (Emulsifiers, Artificial Sweeteners, Gums)
  const gutKillers = ['emulsifier', 'lecithin', 'maltodextrin', 'sucralose', 'aspartame', 'carrageenan', 'polysorbate'];
  let foundGutKillers = gutKillers.filter(i => ingredients.includes(i));
  if (foundGutKillers.length > 0) {
    healthScore -= (foundGutKillers.length * 10);
    explanations.push({type: 'health', text: `Gut Health Warning: Contains ${foundGutKillers.join(', ')} which may disrupt the gut microbiome and cause inflammation.`, icon: "ri-virus-line", level: "bad"});
  }

  // 2. Acne Triggers (Dairy, Whey, Cocoa butter, high sugar)
  const acneTriggers = ['milk', 'whey', 'dairy', 'cocoa butter', 'butterfat', 'sugar', 'syrup'];
  let foundAcne = acneTriggers.filter(i => ingredients.includes(i));
  if (foundAcne.length >= 2) {
    healthScore -= 15;
    explanations.push({type: 'health', text: `Acne Risk: High combination of dairy/fats/sugars (${foundAcne.slice(0,3).join(', ')}) strongly linked to sebum overproduction and skin breakouts.`, icon: "ri-star-smile-line", level: "bad"});
  }

  // 3. Face Bloating (High sodium, refined carbs, starches)
  const bloatTriggers = ['salt', 'sodium', 'flour', 'starch', 'wheat', 'syrup'];
  let foundBloat = bloatTriggers.filter(i => ingredients.includes(i));
  if (foundBloat.length >= 2) {
    healthScore -= 10;
    explanations.push({type: 'health', text: `Face Bloating Risk: Contains water-retaining ingredients (${foundBloat.slice(0,3).join(', ')}). Leads to facial puffiness.`, icon: "ri-bubble-chart-line", level: "med"});
  }

  // 4. Mental Effects (Brain fog, crashes, artificial dyes, seed oils)
  const mentalToxins = ['color', 'dye', 'red 40', 'yellow 5', 'sunflower oil', 'soybean oil', 'canola oil', 'preservative'];
  let foundMental = mentalToxins.filter(i => ingredients.includes(i));
  if (foundMental.length > 0) {
    healthScore -= 15;
    explanations.push({type: 'health', text: `Mental Fog / Lethargy: Contains ${foundMental.join(', ')}. Linked to energy crashes, brain fog, and neuro-inflammation.`, icon: "ri-brain-line", level: "bad"});
  }

  // 5. Addictiveness (Hyper-palatability combo: Sugar + Fat + Salt + MSG/Caffeine)
  const isSugary = ingredients.includes('sugar') || ingredients.includes('syrup');
  const isFatty = ingredients.includes('oil') || ingredients.includes('fat') || ingredients.includes('butter');
  const isSalty = ingredients.includes('salt') || ingredients.includes('sodium');
  const hasMsg = ingredients.includes('glutamate') || ingredients.includes('msg') || ingredients.includes('caffeine');
  
  if ((isSugary && isFatty) || hasMsg) {
    healthScore -= 20;
    explanations.push({type: 'health', text: `Highly Addictive Formula: Engineered combination of ${hasMsg ? 'stimulants/excitotoxins' : 'sugar and fat'} designed to hijack dopamine receptors and induce cravings.`, icon: "ri-dossier-line", level: "bad"});
  }
  
  // Good ingredient checking
  if (!ingredients.includes('sugar') && !ingredients.includes('syrup') && !ingredients.includes('oil') && !foundGutKillers.length && ingredients.length > 5) {
    explanations.push({type: 'health', text: "Clean profile: No major systemic inflammatory triggers detected.", icon: "ri-shield-check-line", level: "good"});
  }

  // Additives general count penalty
  if (product.additives_n > 3) {
    healthScore -= 15;
    explanations.push({type: 'health', text: `Contains ${product.additives_n} chemical additives.`, icon: "ri-alert-line", level: "bad"});
  }

  // Eco-Score & Ethical Simulation
  const eco = product.ecoscore_grade || 'unknown';
  if (eco === 'e' || eco === 'd') {
    ecoScore -= 40;
    explanations.push({type: 'ethical', text: "High environmental footprint and intensive resource extraction.", icon: "ri-earth-line", level: "bad"});
  } else if (eco === 'a' || eco === 'b') {
    explanations.push({type: 'ethical', text: "Lower environmental footprint.", icon: "ri-earth-line", level: "good"});
  } else {
    ecoScore -= 20;
    explanations.push({type: 'ethical', text: "Low corporate transparency.", icon: "ri-question-mark", level: "med"});
  }

  // Microplastics Risk Simulation
  const packaging = (product.packaging || "").toLowerCase();
  if (packaging.includes('plastic')) {
    plasticScore -= 40;
    explanations.push({type: 'plastic', text: "Medium exposure risk to micro/nano-plastics (Packaged in plastic).", icon: "ri-drop-line", level: "med"});
  } else if (packaging.includes('glass') || packaging.includes('paper')) {
    explanations.push({type: 'plastic', text: "Negligible microplastic leaching probability.", icon: "ri-drop-fill", level: "good"});
  } else {
    plasticScore -= 10;
  }

  // Bound scores
  if (healthScore < 0) healthScore = 0;
  if (ecoScore < 0) ecoScore = 0;
  if (plasticScore < 0) plasticScore = 0;

  // Calculate overall average
  let score = Math.round((healthScore + ecoScore + plasticScore) / 3);

  return { name: pName, brand: pBrand, img: pImg, score, healthScore, ecoScore, plasticScore, explanations };
}

function getScoreClass(s) {
  if (s < 40) return 'text-bad';
  if (s < 70) return 'text-med';
  return 'text-good';
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
        <span class="label">OVERALL</span>
      </div>
    </div>

    <div class="sub-scores">
      <div class="sub-score-item">
        <span class="sub-val ${getScoreClass(report.healthScore)}">${report.healthScore}</span>
        <span class="sub-label">Health</span>
      </div>
      <div class="sub-score-item">
        <span class="sub-val ${getScoreClass(report.ecoScore)}">${report.ecoScore}</span>
        <span class="sub-label">Environment</span>
      </div>
      <div class="sub-score-item">
        <span class="sub-val ${getScoreClass(report.plasticScore)}">${report.plasticScore}</span>
        <span class="sub-label">Packaging</span>
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
