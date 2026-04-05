// --- Modern OCR & Barcode Ingredient Scanner Logic ---

// DOM Elements
const viewCamera = document.getElementById('view-camera');
const viewReport = document.getElementById('view-report');
const topHeader = document.getElementById('topHeader');

const cameraSource = document.getElementById('cameraSource');
const snapshotCanvas = document.getElementById('snapshotCanvas');
const captureBtn = document.getElementById('captureBtn');
const cameraInstructions = document.getElementById('cameraInstructions');

const barcodeReader = document.getElementById('barcodeReader');
const modeBarcodeBtn = document.getElementById('modeBarcodeBtn');
const modeOCRBtn = document.getElementById('modeOCRBtn');

const loadingOverlay = document.getElementById('loadingOverlay');
const loadingMsg = document.getElementById('loadingMsg');
const reportContent = document.getElementById('report-content');
const backBtn = document.getElementById('backBtn');

let mediaStream = null;
let currentMode = 'barcode'; // 'barcode' or 'ocr'
let html5QrcodeScanner = null;

// --- 1. View & Mode Management ---
function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(viewId).classList.remove('hidden');
  
  if(viewId === 'view-report') {
    topHeader.classList.remove('hidden');
  } else {
    topHeader.classList.add('hidden');
  }
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  if (html5QrcodeScanner) {
    html5QrcodeScanner.stop().catch(()=>{});
    html5QrcodeScanner.clear();
    html5QrcodeScanner = null;
  }
}

async function initCamera() {
  switchView('view-camera');
  stopCamera(); // reset all
  
  if (currentMode === 'ocr') {
    modeBarcodeBtn.classList.remove('active-mode');
    modeOCRBtn.classList.add('active-mode');
    
    barcodeReader.classList.add('hidden');
    cameraSource.classList.remove('hidden');
    captureBtn.parentElement.classList.remove('hidden');
    cameraInstructions.style.visibility = 'visible';
    
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment", focusMode: "continuous" } 
      });
      cameraSource.srcObject = mediaStream;
    } catch (err) {
      alert("Camera access is required for OCR scanning.");
      console.error(err);
    }
  } else {
    // Barcode Mode
    modeOCRBtn.classList.remove('active-mode');
    modeBarcodeBtn.classList.add('active-mode');
    
    cameraSource.classList.add('hidden');
    captureBtn.parentElement.classList.add('hidden');
    cameraInstructions.style.visibility = 'hidden';
    barcodeReader.classList.remove('hidden');
    
    html5QrcodeScanner = new Html5Qrcode("barcodeReader");
    html5QrcodeScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        if (html5QrcodeScanner.isProcessing) return;
        html5QrcodeScanner.isProcessing = true;
        fetchProductDetails(decodedText);
      },
      (error) => {} // ignore
    ).catch(err => {
      console.error("Camera permissions required", err);
      alert("Please allow camera permission.");
    });
  }
}

// Mode Buttons
modeBarcodeBtn.addEventListener('click', () => {
  if(currentMode === 'barcode') return;
  currentMode = 'barcode';
  initCamera();
});

modeOCRBtn.addEventListener('click', () => {
  if(currentMode === 'ocr') return;
  currentMode = 'ocr';
  initCamera();
});

// Start camera initially
window.addEventListener('load', initCamera);

// Back to camera
backBtn.addEventListener('click', () => {
  reportContent.innerHTML = '';
  initCamera();
});

// --- 2. Live Scans (Barcode API & OCR) ---

// a) Barcode Flow
async function fetchProductDetails(barcode) {
  stopCamera();
  switchView('view-report');
  topHeader.classList.add('hidden');
  loadingMsg.innerText = "Fetching Open Food Facts API...";
  loadingOverlay.classList.remove('hidden');
  
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await res.json();
    if (data.status === 1) {
      const text = data.product.ingredients_text || "water, unknown ingredient"; // mock if empty
      analyzeIngredients(text);
    } else {
      alert("Product not found in Open Food Facts database.");
      initCamera();
    }
  } catch (error) {
    alert("Network error fetching barcode data.");
    console.error(error);
    initCamera();
  } finally {
    if(viewReport.classList.contains('hidden')) loadingOverlay.classList.add('hidden'); // if reverted early
  }
}

// b) OCR Flow
captureBtn.addEventListener('click', async () => {
  if (currentMode !== 'ocr' || !mediaStream) return;
  
  // Snap the frame to hidden canvas
  const context = snapshotCanvas.getContext('2d');
  snapshotCanvas.width = cameraSource.videoWidth;
  snapshotCanvas.height = cameraSource.videoHeight;
  context.drawImage(cameraSource, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
  
  const imageDataURL = snapshotCanvas.toDataURL('image/jpeg');
  
  stopCamera(); // Save battery
  switchView('view-report'); // Switch immediately
  topHeader.classList.add('hidden'); // Hide header during loading
  loadingMsg.innerText = "Extracting text via AI...";
  loadingOverlay.classList.remove('hidden');
  
  try {
    // Run offline OCR
    const worker = await Tesseract.createWorker('eng');
    const { data: { text } } = await worker.recognize(imageDataURL);
    await worker.terminate();
    
    // Process text
    analyzeIngredients(text);
  } catch (err) {
    console.error("OCR Failed:", err);
    alert("Failed to read text. Please try again in better lighting.");
    initCamera();
  }
});

// --- 3. Offline Heuristic Analysis ---
function analyzeIngredients(rawText) {
  loadingOverlay.classList.add('hidden'); // Done loading!
  const text = (rawText || "").toLowerCase().replace(/\s+/g, ' '); // Normalize
  
  let score = 100;
  let additivesCount = 0;
  let hasSeedOil = false;
  let totalNum = (text.match(/,/g) || []).length + 1; // rough estimate based on commas
  if (totalNum < 3) totalNum = 3; // base minimum
  
  let flagged = []; // To populate horizontal cards

  // --- Dictionary ---
  const seedOils = [
    { name: 'Sunflower Oil', term: 'sunflower oil' },
    { name: 'Soybean Oil', term: 'soybean oil' },
    { name: 'Canola Oil', term: 'canola oil' },
    { name: 'Vegetable Oil', term: 'vegetable oil' },
    { name: 'Palm Oil', term: 'palm oil' }
  ];

  const additives = [
    { name: 'Carrageenan (E407)', term: 'carrageenan', purpose: 'Thickener or stabiliser used to improve texture. Linked to gut inflammation.', riskClass: 'risk-med', riskText: 'Moderate risk' },
    { name: 'Guar gum (E412)', term: 'guar gum', purpose: 'Thickener used to improve texture in dairy and sauces.', riskClass: 'risk-good', riskText: 'Low risk' },
    { name: 'Mono-/Diglycerides', term: 'glycerides', purpose: 'Emulsifier that helps oil and water mix.', riskClass: 'risk-med', riskText: 'Moderate risk' },
    { name: 'Maltodextrin', term: 'maltodextrin', purpose: 'Cheap carbohydrate filler. Spikes blood sugar wildly.', riskClass: 'risk-bad', riskText: 'High risk' },
    { name: 'Sucralose', term: 'sucralose', purpose: 'Artificial sweetener linked to microbiome damage.', riskClass: 'risk-bad', riskText: 'High risk' },
    { name: 'Aspartame', term: 'aspartame', purpose: 'Artificial sweetener, highly controversial neurological effects.', riskClass: 'risk-bad', riskText: 'High risk' },
    { name: 'Red 40 Dye', term: 'red 40', purpose: 'Artificial colorant linked to hyperactivity in children.', riskClass: 'risk-bad', riskText: 'High risk' },
    { name: 'Soy Lecithin', term: 'lecithin', purpose: 'Emulsifier extracted using hexane.', riskClass: 'risk-med', riskText: 'Moderate risk' }
  ];

  // Analysis
  seedOils.forEach(oil => {
    if (text.includes(oil.term) || text.includes(oil.term.replace(' oil', ''))) {
      hasSeedOil = true;
      score -= 15;
      flagged.push({ name: oil.name, purpose: 'Highly refined inflammatory seed oil.', riskClass: 'risk-bad', riskText: 'High risk', cat: 'SEED OIL' });
    }
  });

  additives.forEach(add => {
    if (text.includes(add.term)) {
      additivesCount++;
      if(add.riskClass === 'risk-bad') score -= 20;
      else if(add.riskClass === 'risk-med') score -= 10;
      else if(add.riskClass === 'risk-good') score -= 2;
      
      flagged.push({ name: add.name, purpose: add.purpose, riskClass: add.riskClass, riskText: add.riskText, cat: 'ADDITIVE / KILLER' });
    }
  });

  // Natural Triggers
  if(text.includes('msg') || text.includes('glutamate')) {
    score -= 15;
    flagged.push({ name: 'Monosodium Glutamate', purpose: 'Excitotoxin flavor enhancer linked to addiction/headaches.', riskClass: 'risk-bad', riskText: 'High risk', cat: 'ENHANCER' });
  }

  // General evaluation
  if (score < 10) score = 10;
  
  let gradeText = "Excellent";
  let gradeClass = "bg-risk-good";
  if (score < 40) { gradeText = "Poor"; gradeClass = "bg-risk-bad"; }
  else if (score < 75) { gradeText = "Fair"; gradeClass = "bg-risk-med"; }

  const isUltraProcessed = (additivesCount > 0 || hasSeedOil) ? 'Yes (NOVA 4)' : 'No';
  const processClass = isUltraProcessed === 'No' ? 'text-good' : 'text-bad';

  renderReport({
    score, gradeText, gradeClass,
    additivesCount, hasSeedOil, totalNum,
    isUltraProcessed, processClass,
    flagged
  });
}

// --- 4. Render UI ---
function renderReport(data) {
  topHeader.classList.remove('hidden');

  let cardsHTML = '';
  data.flagged.forEach(f => {
    cardsHTML += `
      <div class="flashcard border-${f.riskClass}">
        <span class="card-risk bg-${f.riskClass}">${f.riskText}</span>
        <h4>${f.name}</h4>
        <p>${f.purpose}</p>
        <span class="category">${f.cat}</span>
      </div>
    `;
  });

  if (cardsHTML === '') {
    cardsHTML = `
      <div class="flashcard border-risk-good">
        <span class="card-risk bg-risk-good">Clean</span>
        <h4>Whole Foods Only</h4>
        <p>No major artificial additives or inflammatory triggers detected by OCR.</p>
        <span class="category">SAFE</span>
      </div>
    `;
  }

  // Mocking brand trust logic just for display based on the UI screenshot
  // In a real app, we'd OCR the brand name on the front of the packet.
  const brandHTML = `
    <div class="brand-card">
      <div class="brand-card-top">
        <span class="title"><i class="ri-shield-keyhole-fill"></i> Brand Trust Score</span>
        <span class="brand-badge border-risk-med">Orange</span>
      </div>
      <div class="brand-card-mid">
        <h3>Detected Brand</h3>
        <span class="lawsuit-tag">Lawsuit</span>
      </div>
      <p class="brand-fact"><i class="ri-information-fill"></i> Environmental / Labor flags detected in history</p>
      <span class="learn-more">Learn more <i class="ri-arrow-right-s-line"></i></span>
    </div>
  `;

  reportContent.innerHTML = `
    <h3 class="product-title" style="margin-top: 10px;">Scanned Product</h3>
    
    <div class="grade-card ${data.gradeClass.replace('bg-', 'bg-').replace('risk-', '')}-light">
      <div class="grade-circle ${data.gradeClass}">
        <span class="num">${data.score}</span>
        <span class="denom">/100</span>
      </div>
      <div class="grade-text">
        <h3 class="${data.gradeClass.replace('bg-', 'text-')}">${data.gradeText}</h3>
        <p>Health Grade</p>
      </div>
    </div>

    <h4 class="section-title">Quick Overview</h4>
    <div class="overview-list">
      <div class="overview-item">
        <span class="overview-label"><i class="ri-alert-fill"></i> Harmful additives</span>
        <span class="overview-val ${data.additivesCount > 0 ? 'text-med' : 'text-good'}">${data.additivesCount} <span class="dot-${data.additivesCount > 0 ? 'med' : 'good'}"></span></span>
      </div>
      <div class="overview-item">
        <span class="overview-label"><i class="ri-drop-fill"></i> Seed oil</span>
        <span class="overview-val ${data.hasSeedOil ? 'text-bad' : 'text-good'}">${data.hasSeedOil ? 'Yes' : 'No'} <span class="dot-${data.hasSeedOil ? 'bad' : 'good'}"></span></span>
      </div>
      <div class="overview-item">
        <span class="overview-label"><i class="ri-list-check"></i> Total Ingredients</span>
        <span class="overview-val text-good">~${data.totalNum} <span class="dot-good"></span></span>
      </div>
      <div class="overview-item">
        <span class="overview-label"><i class="ri-settings-4-fill"></i> Ultra Processed</span>
        <span class="overview-val ${data.processClass}">${data.isUltraProcessed} <span class="dot-${data.isUltraProcessed === 'No' ? 'good' : 'bad'}"></span></span>
      </div>
    </div>

    <div class="flashcards-scroll">
      ${cardsHTML}
    </div>

    ${brandHTML}
  `;
}
