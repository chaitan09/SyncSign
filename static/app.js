const ws = new WebSocket(`ws://${window.location.host}/ws/laptop/${SESSION_ID}`);

const statusText = document.getElementById("statusText");
const signatureBox = document.getElementById("signatureBox");
const signatureImage = document.getElementById("signatureImage");
// All 8 resize handles inside signatureBox
const resizeHandles = signatureBox.querySelectorAll(".resize-handle");

// WebSocket handlers
ws.onopen = () => {
  console.log("Laptop WebSocket connected");
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "status") {
    statusText.textContent = data.message;
  }

  if (data.type === "signature") {
    signatureImage.src = data.image;
    signatureBox.classList.remove("hidden");
    signatureBox.dataset.rotation = "0";
    currentRotation = 0;
  }

  if (data.type === "clear_signature") {
    signatureImage.src = "";
    signatureBox.classList.add("hidden");
  }
};

// Drag functionality
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let currentRotation = 0;
let activeSignature = null;

// Multi-page PDF support
let currentPage = 1;
let totalPages = 1;
let signaturesByPage = {};  // { 1: [signature1, signature2, ...], 2: [...], ... }

// Get page navigation elements
const pageNavigation = document.getElementById("pageNavigation");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageIndicator = document.getElementById("pageIndicator");

// Context Menu
const contextMenu = document.getElementById("contextMenu");

// Right-click handler - Professional smooth behavior like MS Word/Google Docs
signatureBox.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  e.stopPropagation();
  activeSignature = signatureBox;
  console.log("✅ Right-click detected on signature at:", e.clientX, e.clientY);
  console.log("  - Signature position:", signatureBox.style.left, signatureBox.style.top);
  console.log("  - Signature z-index:", window.getComputedStyle(signatureBox).zIndex);
  showContextMenu(e);
});

function showContextMenu(e) {
  // STEP 1: Get mouse position on screen (not document)
  // clientX/clientY = position relative to viewport (your screen)
  let mouseX = e.clientX;
  let mouseY = e.clientY;
  
  // STEP 2: Show menu temporarily to measure its size
  contextMenu.style.display = "block";
  contextMenu.classList.add("active");
  
  // STEP 3: Get menu dimensions and viewport (screen) size
  const menuWidth = contextMenu.offsetWidth;
  const menuHeight = contextMenu.offsetHeight;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // STEP 4: Smart positioning - flip menu if it would go off-screen
  // This is how professional apps work!
  
  let left = mouseX;
  let top = mouseY;
  
  // If menu would go off RIGHT edge, flip it to the LEFT of cursor
  if (mouseX + menuWidth > viewportWidth - 10) {
    left = Math.max(5, viewportWidth - menuWidth - 10);  // 10px margin from edge
  }
  
  // If menu would go off BOTTOM edge, show it above cursor or at top with scroll
  if (mouseY + menuHeight > viewportHeight - 10) {
    // Try to show above cursor first
    if (mouseY - menuHeight > 10) {
      top = mouseY - menuHeight;  // Show above cursor
    } else {
      // If not enough space above, position at top of screen and let it scroll
      top = 10;
      contextMenu.style.maxHeight = (viewportHeight - 20) + "px";
    }
  } else {
    // Reset max-height if there's enough space
    contextMenu.style.maxHeight = "80vh";
  }
  
  // Ensure menu never goes off left or top edge
  left = Math.max(5, left);
  top = Math.max(5, top);
  
  // STEP 5: Apply position (simple and clean!)
  contextMenu.style.left = left + "px";
  contextMenu.style.top = top + "px";
}

// Hide context menu on click elsewhere or scroll
function hideContextMenu() {
  contextMenu.classList.remove("active");
  contextMenu.style.display = "none";
}

document.addEventListener("click", (e) => {
  if (!contextMenu.contains(e.target)) {
    hideContextMenu();
  }
});

// Hide on ANY scroll (window or container)
window.addEventListener("scroll", hideContextMenu, true);
document.addEventListener("scroll", hideContextMenu, true);

// Context menu actions
contextMenu.addEventListener("click", (e) => {
  const item = e.target.closest(".context-menu-item");
  const colorOption = e.target.closest(".color-option");
  
  // Handle color options
  if (colorOption) {
    const action = colorOption.dataset.action;
    contextMenu.classList.remove("active");
    contextMenu.style.display = "none";
    
    if (activeSignature) {
      const img = activeSignature.querySelector("img");
      console.log("🎨 Changing color to:", action);
      
      // Apply color change using proper DOM manipulation
      let filterValue = "none";
      let colorName = "black";
      
      switch(action) {
        case "color-black":
          activeSignature.dataset.color = "#000000";
          filterValue = "none";
          colorName = "black";
          break;
        case "color-blue":
          activeSignature.dataset.color = "#0000FF";
          filterValue = "brightness(0) saturate(100%) invert(27%) sepia(98%) saturate(7463%) hue-rotate(244deg) brightness(92%) contrast(138%)";
          colorName = "blue";
          break;
        case "color-red":
          activeSignature.dataset.color = "#FF0000";
          filterValue = "brightness(0) saturate(100%) invert(17%) sepia(100%) saturate(7426%) hue-rotate(2deg) brightness(99%) contrast(118%)";
          colorName = "red";
          break;
        case "color-green":
          activeSignature.dataset.color = "#00AA00";
          filterValue = "brightness(0) saturate(100%) invert(42%) sepia(93%) saturate(1352%) hue-rotate(87deg) brightness(119%) contrast(119%)";
          colorName = "green";
          break;
        case "color-orange":
          activeSignature.dataset.color = "#FF8800";
          filterValue = "brightness(0) saturate(100%) invert(58%) sepia(93%) saturate(5746%) hue-rotate(360deg) brightness(102%) contrast(105%)";
          colorName = "orange";
          break;
      }
      
      // Apply filter directly to DOM element with !important
      img.style.setProperty("filter", filterValue, "important");
      console.log("✅ Applied", colorName, "color filter to signature");
      console.log("   Filter value:", filterValue);
      
      // Force immediate visual update
      void img.offsetWidth; // Trigger reflow
    }
    return;
  }
  
  // Handle regular menu items
  if (!item || item.classList.contains("disabled")) return;
  
  const action = item.dataset.action;
  contextMenu.classList.remove("active");
  contextMenu.style.display = "none";
  switch(action) {
    case "rotate90":
      if (activeSignature) {
        let rotation = parseInt(activeSignature.dataset.rotation || "0");
        rotation = (rotation + 90) % 360;
        activeSignature.dataset.rotation = rotation;
        activeSignature.style.transform = `rotate(${rotation}deg)`;
        if (activeSignature === signatureBox) currentRotation = rotation;
      }
      break;
    case "rotateleft":
      if (activeSignature) {
        let rotation = parseInt(activeSignature.dataset.rotation || "0");
        rotation = rotation - 2;
        activeSignature.dataset.rotation = rotation;
        activeSignature.style.transform = `rotate(${rotation}deg)`;
        if (activeSignature === signatureBox) currentRotation = rotation;
      }
      break;
    case "rotateright":
      if (activeSignature) {
        let rotation = parseInt(activeSignature.dataset.rotation || "0");
        rotation = rotation + 2;
        activeSignature.dataset.rotation = rotation;
        activeSignature.style.transform = `rotate(${rotation}deg)`;
        if (activeSignature === signatureBox) currentRotation = rotation;
      }
      break;
    case "rotatecustom":
      if (activeSignature) {
        let current = parseInt(activeSignature.dataset.rotation || "0");
        let angle = prompt("Enter rotation angle (degrees, can be negative):", current);
        if (angle !== null && !isNaN(angle)) {
          angle = parseInt(angle);
          activeSignature.dataset.rotation = angle;
          activeSignature.style.transform = `rotate(${angle}deg)`;
          if (activeSignature === signatureBox) currentRotation = angle;
        }
      }
      break;
    case "copy":
      if (activeSignature) {
        copiedSignatureData = {
          image: activeSignature.querySelector("img").src,
          width: activeSignature.style.width,
          height: activeSignature.style.height,
          rotation: parseInt(activeSignature.dataset.rotation || "0"),
          color: activeSignature.dataset.color || "#000000",
          top: activeSignature.style.top,
          left: activeSignature.style.left
        };
        console.log("Copied signature data:", copiedSignatureData);
        activeSignature.style.opacity = "0.5";
        setTimeout(() => { activeSignature.style.opacity = "1"; }, 200);
      }
      break;
    case "paste":
      if (copiedSignatureData && copiedSignatureData.image) {
        pasteSignature();
      } else {
        alert("No signature copied. Right-click a signature and select Copy first.");
      }
      break;
    case "copytopage":
      if (activeSignature && totalPages > 1) {
        const targetPageStr = prompt(`Copy signature to which page? (1-${totalPages}):`, "");
        if (targetPageStr !== null && targetPageStr.trim() !== "") {
          const targetPage = parseInt(targetPageStr);
          if (targetPage >= 1 && targetPage <= totalPages) {
            if (targetPage === currentPage) {
              alert(`Already on page ${currentPage}. Use Copy/Paste instead.`);
              return;
            }
            
            // Get signature data
            const sigData = {
              image: activeSignature.querySelector("img").src,
              width: parseFloat(activeSignature.style.width) || 220,
              height: parseFloat(activeSignature.style.height) || 100,
              rotation: parseInt(activeSignature.dataset.rotation || "0"),
              color: activeSignature.dataset.color || "#000000",
              // Use default position on target page
              x: 80,
              y: 80
            };
            
            // Add signature to target page's signature array
            if (!signaturesByPage[targetPage]) {
              signaturesByPage[targetPage] = [];
            }
            signaturesByPage[targetPage].push(sigData);
            
            console.log(`✅ Signature added to page ${targetPage} signature array`);
            
            // Navigate to target page (this will load all signatures including the one we just added)
            navigateToPage(targetPage);
          } else {
            alert(`Invalid page number. Please enter a number between 1 and ${totalPages}.`);
          }
        }
      } else if (totalPages <= 1) {
        alert("This document only has one page.");
      }
      break;
    case "delete":
      if (activeSignature && activeSignature.id !== "signatureBox") {
        activeSignature.remove();
        activeSignature = null;
      } else {
        alert("Cannot delete the original signature. Use Clear on mobile instead.");
      }
      break;
  }
});

// ============================================================
// DRAG LOGIC — explained step by step
// ============================================================

// STEP 1: mousedown — User presses mouse on signature
//   → Record WHERE inside the box they clicked (the "offset")
//   → Set isDragging = true so mousemove knows to track
signatureBox.addEventListener("mousedown", (e) => {
  // Ignore if user clicked ANY resize handle (that's a different action)
  if (e.target.classList.contains("resize-handle")) return;
  // Ignore right-click (button 0 = left click only)
  if (e.button !== 0) return;
  // Ignore if signature is locked
  if (signatureBox.classList.contains("locked")) {
    alert("Signature is locked. Right-click and select Lock to unlock it.");
    return;
  }

  isDragging = true;
  activeSignature = signatureBox; // Track WHICH box is being dragged

  // getBoundingClientRect() → gives the box's position on screen
  const rect = signatureBox.getBoundingClientRect();

  // Offset = distance from mouse click to box's top-left corner
  // WHY: Without this, the box would "jump" so its corner is at mouse position
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;
});

// ============================================================
// RESIZE LOGIC — 8 directions (any edge or corner)
// ============================================================
//
// How 8-direction resize works:
//
//   [nw]----[n]----[ne]      Each handle controls different properties:
//    |               |       
//   [w]   [image]   [e]      se → width + height (grow right & down)
//    |               |       e  → width only
//   [sw]----[s]----[se]      n  → top + height (shrink from top)
//                             nw → left + top + width + height
//
// "Direction rules" tell us: when mouse moves by (deltaX, deltaY),
// which properties get adjusted and in which direction?
//
// Format: [leftMultiplier, topMultiplier, widthMultiplier, heightMultiplier]
//
//   Positive width multiplier  = deltaX increases width  (right side moves)
//   Negative left multiplier   = deltaX moves left edge  (and increases width)
//   Same idea for top/height

let isResizing = false;
let resizeDir = null;        // which direction: "se", "n", "w", etc.
let resizeStartX = 0;        // mouse X when resize started
let resizeStartY = 0;        // mouse Y when resize started
let resizeStartLeft = 0;     // box left when resize started
let resizeStartTop = 0;      // box top when resize started
let resizeStartWidth = 0;    // box width when resize started  
let resizeStartHeight = 0;   // box height when resize started
let resizeTarget = null;     // which signature box is being resized

const MIN_WIDTH = 40;        // minimum allowed width (pixels)
const MIN_HEIGHT = 20;       // minimum allowed height (pixels)

// Attach mousedown to ALL 8 resize handles on the original signatureBox
resizeHandles.forEach(handle => {
  handle.addEventListener("mousedown", (e) => {
    e.stopPropagation();   // don't trigger drag
    e.preventDefault();    // don't select text
    
    isResizing = true;
    resizeTarget = signatureBox;
    resizeDir = handle.dataset.dir;  // "se", "n", "nw", etc.
    
    // Add classes to lock handles visible and prevent text selection
    signatureBox.classList.add("resizing");
    document.body.classList.add("resizing-active");
    
    // Record starting mouse position
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    
    // Record starting box geometry
    resizeStartLeft = parseInt(signatureBox.style.left) || 0;
    resizeStartTop = parseInt(signatureBox.style.top) || 0;
    resizeStartWidth = signatureBox.offsetWidth;
    resizeStartHeight = signatureBox.offsetHeight;
  });
});

// ============================================================
// SINGLE mousemove handler for BOTH drag and resize
// ============================================================
// WHY one handler? Multiple mousemove listeners ALL fire on every
// pixel of movement. One handler with if/else = faster, smoother.

document.addEventListener("mousemove", (e) => {
  // --- RESIZE BRANCH ---
  if (isResizing && resizeTarget && resizeDir) {
    // How far did mouse move since resize started?
    const deltaX = e.clientX - resizeStartX;
    const deltaY = e.clientY - resizeStartY;
    
    // Which edges does this handle affect?
    // "nw" contains "w" → affects left.  "nw" contains "n" → affects top.
    // "se" contains "e" → affects right. "se" contains "s" → affects bottom.
    const affectsLeft   = resizeDir.includes("w");
    const affectsRight  = resizeDir.includes("e");
    const affectsTop    = resizeDir.includes("n");
    const affectsBottom = resizeDir.includes("s");
    
    // Start from original values
    let newLeft = resizeStartLeft;
    let newTop  = resizeStartTop;
    let newW    = resizeStartWidth;
    let newH    = resizeStartHeight;
    
    // Left edge: moves with mouse, width changes opposite
    if (affectsLeft) {
      newLeft = resizeStartLeft + deltaX;
      newW    = resizeStartWidth - deltaX;
    }
    // Right edge: width grows with mouse
    if (affectsRight) {
      newW = resizeStartWidth + deltaX;
    }
    // Top edge: moves with mouse, height changes opposite
    if (affectsTop) {
      newTop = resizeStartTop + deltaY;
      newH   = resizeStartHeight - deltaY;
    }
    // Bottom edge: height grows with mouse
    if (affectsBottom) {
      newH = resizeStartHeight + deltaY;
    }
    
    // Enforce minimum size (prevent signature from becoming invisible)
    if (newW < MIN_WIDTH) {
      if (affectsLeft) newLeft = resizeStartLeft + resizeStartWidth - MIN_WIDTH;
      newW = MIN_WIDTH;
    }
    if (newH < MIN_HEIGHT) {
      if (affectsTop) newTop = resizeStartTop + resizeStartHeight - MIN_HEIGHT;
      newH = MIN_HEIGHT;
    }
    
    // Apply to DOM
    resizeTarget.style.left   = newLeft + "px";
    resizeTarget.style.top    = newTop + "px";
    resizeTarget.style.width  = newW + "px";
    resizeTarget.style.height = newH + "px";
    
    return; // don't also run drag logic
  }
  
  // --- DRAG BRANCH ---
  if (!isDragging || !activeSignature) return;
  
  // Parent = documentStage (the white area with the PDF)
  const parentRect = activeSignature.parentElement.getBoundingClientRect();
  
  // New position = mouse position - parent's edge - offset
  let newLeft = e.clientX - parentRect.left - dragOffsetX;
  let newTop = e.clientY - parentRect.top - dragOffsetY;
  
  // CONSTRAIN within parent boundaries
  const boxW = activeSignature.offsetWidth;
  const boxH = activeSignature.offsetHeight;
  const maxLeft = parentRect.width - boxW;
  const maxTop = parentRect.height - boxH;
  
  newLeft = Math.max(0, Math.min(newLeft, maxLeft));
  newTop = Math.max(0, Math.min(newTop, maxTop));
  
  // Apply position — these values get sent to backend on Save
  activeSignature.style.left = `${newLeft}px`;
  activeSignature.style.top = `${newTop}px`;
});

// STEP 3: mouseup — User releases mouse button
//   → Stop both dragging AND resizing
document.addEventListener("mouseup", () => {
  // Clean up resize state
  if (isResizing && resizeTarget) {
    resizeTarget.classList.remove("resizing");
    document.body.classList.remove("resizing-active");
  }
  isDragging = false;
  isResizing = false;
  resizeDir = null;
  resizeTarget = null;
});

// Copy/Paste signature functionality
let copiedSignatureData = null;

function pasteSignature() {
  if (!copiedSignatureData || !copiedSignatureData.image) {
    alert("No signature data to paste");
    return;
  }
  
  console.log("Pasting signature with data:", copiedSignatureData);
  
  const newSignatureBox = signatureBox.cloneNode(true);
  newSignatureBox.id = "signatureBox" + Date.now();
  newSignatureBox.classList.remove("hidden");
  newSignatureBox.querySelector("img").src = copiedSignatureData.image;
  newSignatureBox.style.width = copiedSignatureData.width || "220px";
  newSignatureBox.style.height = copiedSignatureData.height || "100px";
  newSignatureBox.dataset.rotation = copiedSignatureData.rotation || 0;
  newSignatureBox.dataset.color = copiedSignatureData.color || "#000000";
  newSignatureBox.style.transform = `rotate(${copiedSignatureData.rotation || 0}deg)`;
  
  // Apply color filter if not black
  if (copiedSignatureData.color && copiedSignatureData.color !== "#000000") {
    const img = newSignatureBox.querySelector("img");
    // Apply the same filter based on color
    if (copiedSignatureData.color === "#0000FF") img.style.filter = "brightness(0.5) sepia(1) hue-rotate(190deg) saturate(500%)";
    else if (copiedSignatureData.color === "#FF0000") img.style.filter = "brightness(0.5) sepia(1) hue-rotate(-50deg) saturate(600%)";
    else if (copiedSignatureData.color === "#00AA00") img.style.filter = "brightness(0.6) sepia(1) hue-rotate(60deg) saturate(400%)";
    else if (copiedSignatureData.color === "#FF8800") img.style.filter = "brightness(0.7) sepia(1) hue-rotate(10deg) saturate(500%)";
  }
  
  const currentTop = parseInt(copiedSignatureData.top) || 80;
  const currentLeft = parseInt(copiedSignatureData.left) || 80;
  newSignatureBox.style.top = (currentTop + 30) + "px";
  newSignatureBox.style.left = (currentLeft + 30) + "px";
  
  document.getElementById("documentStage").appendChild(newSignatureBox);
  makeDraggableAndResizable(newSignatureBox, copiedSignatureData.rotation || 0);
  
  console.log("Signature pasted successfully");
}

// Helper function to create a new signature box element
function createSignatureBox(imageSrc, x, y, width, height, rotation, color) {
  const newSignatureBox = signatureBox.cloneNode(true);
  newSignatureBox.id = "signatureBox" + Date.now() + Math.random();  // Unique ID
  newSignatureBox.classList.remove("hidden");
  newSignatureBox.querySelector("img").src = imageSrc;
  newSignatureBox.style.width = width + "px";
  newSignatureBox.style.height = height + "px";
  newSignatureBox.style.left = x + "px";
  newSignatureBox.style.top = y + "px";
  newSignatureBox.dataset.rotation = rotation || 0;
  newSignatureBox.dataset.color = color || "#000000";
  newSignatureBox.style.transform = `rotate(${rotation || 0}deg)`;
  
  // Apply color filter if not black
  if (color && color !== "#000000") {
    const img = newSignatureBox.querySelector("img");
    let filterValue = "none";
    
    switch(color) {
      case "#0000FF":
        filterValue = "brightness(0) saturate(100%) invert(27%) sepia(98%) saturate(7463%) hue-rotate(244deg) brightness(92%) contrast(138%)";
        break;
      case "#FF0000":
        filterValue = "brightness(0) saturate(100%) invert(17%) sepia(100%) saturate(7426%) hue-rotate(2deg) brightness(99%) contrast(118%)";
        break;
      case "#00AA00":
        filterValue = "brightness(0) saturate(100%) invert(42%) sepia(93%) saturate(1352%) hue-rotate(87deg) brightness(119%) contrast(119%)";
        break;
      case "#FF8800":
        filterValue = "brightness(0) saturate(100%) invert(58%) sepia(93%) saturate(5746%) hue-rotate(360deg) brightness(102%) contrast(105%)";
        break;
    }
    
    img.style.setProperty("filter", filterValue, "important");
  }
  
  return newSignatureBox;
}

document.addEventListener("keydown", (e) => {
  // Rotation with R key
  if (e.key === "r" && activeSignature) {
    e.preventDefault();
    let rotation = parseInt(activeSignature.dataset.rotation || "0");
    rotation = (rotation + 90) % 360;
    activeSignature.dataset.rotation = rotation;
    activeSignature.style.transform = `rotate(${rotation}deg)`;
    if (activeSignature === signatureBox) currentRotation = rotation;
  }
  
  // Copy signature (Ctrl+C or Cmd+C)
  if ((e.ctrlKey || e.metaKey) && e.key === "c" && activeSignature) {
    e.preventDefault();
    copiedSignatureData = {
      image: activeSignature.querySelector("img").src,
      width: activeSignature.style.width,
      height: activeSignature.style.height,
      rotation: parseInt(activeSignature.dataset.rotation || "0"),
      color: activeSignature.dataset.color || "#000000",
      top: activeSignature.style.top,
      left: activeSignature.style.left
    };
    console.log("Signature copied:", copiedSignatureData);
    activeSignature.style.opacity = "0.5";
    setTimeout(() => { activeSignature.style.opacity = "1"; }, 200);
  }
  
  // Paste signature (Ctrl+V or Cmd+V)
  if ((e.ctrlKey || e.metaKey) && e.key === "v" && copiedSignatureData && copiedSignatureData.image) {
    e.preventDefault();
    console.log("Paste shortcut triggered");
    pasteSignature();
  }
});

// ============================================================
// MULTI-PAGE PDF NAVIGATION
// ============================================================

// Save current page's signatures before navigating away
function saveCurrentPageSignatures() {
  const signatures = [];
  const allSignatures = document.querySelectorAll(".signature-box:not(.hidden)");
  
  allSignatures.forEach(sig => {
    const img = sig.querySelector("img");
    if (!img || !img.src) return;
    
    signatures.push({
      image: img.src,
      x: parseFloat(sig.style.left) || 0,
      y: parseFloat(sig.style.top) || 0,
      width: parseFloat(sig.style.width) || 220,
      height: parseFloat(sig.style.height) || 100,
      rotation: parseInt(sig.dataset.rotation || "0"),
      color: sig.dataset.color || "#000000"
    });
  });
  
  if (signatures.length > 0) {
    signaturesByPage[currentPage] = signatures;
    console.log(`💾 Saved ${signatures.length} signature(s) for page ${currentPage}`);
  } else {
    // Remove page from signaturesByPage if no signatures
    delete signaturesByPage[currentPage];
  }
  
  // Update page indicator to show ✓ if page has signatures
  updatePageIndicator();
}

// Load signatures for a specific page
function loadPageSignatures(pageNum) {
  // Clear all existing signatures except the main signatureBox
  document.querySelectorAll(".signature-box").forEach(sig => {
    if (sig.id !== "signatureBox") {
      sig.remove();
    }
  });
  
  // Hide main signature box
  signatureBox.classList.add("hidden");
  
  const signatures = signaturesByPage[pageNum] || [];
  console.log(`📄 Loading ${signatures.length} signature(s) for page ${pageNum}`);
  
  // Restore signatures for this page
  signatures.forEach(sig => {
    const newSig = createSignatureBox(
      sig.image,
      sig.x,
      sig.y,
      sig.width,
      sig.height,
      sig.rotation,
      sig.color
    );
    document.getElementById("documentStage").appendChild(newSig);
    makeDraggableAndResizable(newSig, sig.rotation);
  });
}

// Navigate to a specific page
function navigateToPage(pageNum) {
  if (pageNum < 1 || pageNum > totalPages) return;
  
  // Save current page's signatures
  saveCurrentPageSignatures();
  
  // Update current page
  currentPage = pageNum;
  
  // Load new page
  const previewContainer = document.getElementById("previewContainer");
  const isPDF = FILE_EXT === '.pdf';
  
  if (isPDF) {
    // Remove old PDF image
    const oldPdfImage = document.getElementById("pdfImage");
    if (oldPdfImage) {
      oldPdfImage.remove();
    }
    
    // Load new page image
    const pdfImageHTML = document.createElement('img');
    pdfImageHTML.id = 'pdfImage';
    pdfImageHTML.src = `/preview/${SESSION_ID}?page=${currentPage - 1}&dpi=150`;
    pdfImageHTML.alt = `PDF Page ${currentPage}`;
    
    // CRITICAL styles
    pdfImageHTML.style.width = 'auto';
    pdfImageHTML.style.maxWidth = '100%';
    pdfImageHTML.style.height = 'auto';
    pdfImageHTML.style.display = 'block';
    pdfImageHTML.style.border = 'none';
    pdfImageHTML.style.padding = '0';
    pdfImageHTML.style.margin = '0';
    pdfImageHTML.style.pointerEvents = 'none';
    pdfImageHTML.style.userSelect = 'none';
    pdfImageHTML.draggable = false;
    
    previewContainer.insertBefore(pdfImageHTML, previewContainer.firstChild);
    
    pdfImageHTML.addEventListener("load", () => {
      previewContainer.style.minHeight = pdfImageHTML.offsetHeight + "px";
      previewContainer.style.height = pdfImageHTML.offsetHeight + "px";
      console.log(`✅ Page ${currentPage} loaded: ${pdfImageHTML.offsetWidth} x ${pdfImageHTML.offsetHeight}px`);
    });
  }
  
  // Load signatures for new page
  loadPageSignatures(currentPage);
  
  // Update navigation buttons and indicator
  updatePageIndicator();
  prevPageBtn.disabled = (currentPage === 1);
  nextPageBtn.disabled = (currentPage === totalPages);
  
  console.log(`📄 Navigated to page ${currentPage}/${totalPages}`);
}

// Update page indicator text
function updatePageIndicator() {
  const hasSignatures = signaturesByPage[currentPage] && signaturesByPage[currentPage].length > 0;
  const checkmark = hasSignatures ? " ✓" : "";
  pageIndicator.textContent = `Page ${currentPage}/${totalPages}${checkmark}`;
}

// Initialize page navigation
async function initializePageNavigation() {
  const isPDF = FILE_EXT === '.pdf';
  
  if (!isPDF) {
    // Hide page navigation for non-PDF files
    pageNavigation.classList.add("hidden");
    return;
  }
  
  try {
    // Fetch PDF info to get page count
    const response = await fetch(`/pdf-info/${SESSION_ID}`);
    const info = await response.json();
    
    totalPages = info.pageCount || 1;
    console.log(`📚 PDF has ${totalPages} page(s)`);
    
    if (totalPages > 1) {
      // Show page navigation
      pageNavigation.classList.remove("hidden");
      updatePageIndicator();
      prevPageBtn.disabled = true;  // Start on page 1
      nextPageBtn.disabled = (totalPages === 1);
      
      // Add event listeners
      prevPageBtn.addEventListener("click", () => {
        if (currentPage > 1) {
          navigateToPage(currentPage - 1);
        }
      });
      
      nextPageBtn.addEventListener("click", () => {
        if (currentPage < totalPages) {
          navigateToPage(currentPage + 1);
        }
      });
    } else {
      // Single page PDF - hide navigation
      pageNavigation.classList.add("hidden");
    }
  } catch (error) {
    console.error("Error fetching PDF info:", error);
    pageNavigation.classList.add("hidden");
  }
}

// Save PDF with signatures - PART 2: SEND TO BACKEND
const savePdfBtn = document.getElementById("savePdfBtn");

// ============================================================
// UPDATE SAVE BUTTON TEXT BASED ON FILE TYPE
// ============================================================
function updateSaveButtonText() {
  const fileTypeTextSpan = document.getElementById("fileTypeText");
  if (!fileTypeTextSpan) {
    console.error("❌ fileTypeText span not found!");
    return;
  }
  
  console.log("🔍 Checking FILE_EXT:", FILE_EXT, "Type:", typeof FILE_EXT);
  
  let displayType = "Document";
  
  if (FILE_EXT === '.pdf') {
    displayType = "PDF";
  } else if (FILE_EXT === '.png') {
    displayType = "PNG";  } else if (FILE_EXT === '.jpg') {
    displayType = "JPG";
  }
  
  fileTypeTextSpan.textContent = displayType;
  console.log("✅ Save button updated to: 'Save " + displayType + " with Signatures'");
}

// Call immediately on load
updateSaveButtonText();

if (savePdfBtn) {
  savePdfBtn.addEventListener("click", async () => {
    // Save current page's signatures before processing
    saveCurrentPageSignatures();
    
    // PART 1: Get position from UI (frontend)
    const signatures = [];
    const allSignatures = document.querySelectorAll(".signature-box:not(.hidden)");
    
    // Get the document stage dimensions (the positioning context for signatures)
    const documentStage = document.getElementById("documentStage");
    const previewContainer = document.getElementById("previewContainer");
    
    // ============================================================
    // FIND THE ACTUAL PDF/IMAGE ELEMENT for accurate dimensions
    // ============================================================
    // The PDF iframe or image is what we need to measure against.
    // previewContainer might be bigger (min-height: 900px) than
    // the actual document. We need the EXACT document dimensions.
    
    let docElement = null;  // the actual PDF iframe or image element
    let displayedWidth, displayedHeight;
    
    if (FILE_EXT === '.pdf') {
      // For PDF rendered as image, use the image element
      docElement = previewContainer.querySelector("#pdfImage");
    } else if (['.jpg', '.png'].includes(FILE_EXT)) {
      docElement = previewContainer.querySelector("img");
    }
    
    if (docElement) {
      displayedWidth = docElement.offsetWidth;
      displayedHeight = docElement.offsetHeight;
    } else {
      displayedWidth = previewContainer.offsetWidth;
      displayedHeight = previewContainer.offsetHeight;
    }
    
    console.log("Document display dimensions:", displayedWidth, "x", displayedHeight);
    
    // ============================================================
    // CAPTURE POSITION relative to the ACTUAL document element
    // ============================================================
    // The signature's style.left/top is relative to previewContainer
    // (its CSS parent). The document (iframe/img) is also inside
    // previewContainer. We use getBoundingClientRect() on both to
    // get the EXACT pixel difference between them.
    
    // Get the document element's position on screen
    const docRect = docElement
      ? docElement.getBoundingClientRect()
      : previewContainer.getBoundingClientRect();
    
    allSignatures.forEach(sig => {
      const img = sig.querySelector("img");
      if (img && img.src) {
        // Get signature's actual screen position
        const sigRect = sig.getBoundingClientRect();
        
        // Position relative to the document (iframe/image), not the container
        // This is the KEY to accuracy:
        //   sigRect.left  = signature's left edge on screen
        //   docRect.left  = document's left edge on screen
        //   difference    = exact offset within the document
        const relativeX = sigRect.left - docRect.left;
        const relativeY = sigRect.top - docRect.top;
        
        signatures.push({
          image: img.src,
          x: relativeX,
          y: relativeY,
          width: sigRect.width,
          height: sigRect.height,
          rotation: parseInt(sig.dataset.rotation || "0"),
          color: sig.dataset.color || "#000000"  // Save color (default black)
        });
        
        console.log(`Signature: x=${relativeX.toFixed(1)}, y=${relativeY.toFixed(1)}, w=${sigRect.width.toFixed(1)}, h=${sigRect.height.toFixed(1)}, color=${sig.dataset.color || "black"}`);
      }
    });
    
    if (signatures.length === 0 && Object.keys(signaturesByPage).length === 0) {
      alert("No signatures to save");
      return;
    }
    
    console.log("📍 Signatures by page:", signaturesByPage);
    console.log("📐 Document display size:", displayedWidth, "x", displayedHeight);
    console.log("📊 These dimensions will be used to calculate scaling ratio for accurate positioning");
    
    try {
      // PART 2: Send data to backend
      // Use signaturesByPage for multi-page PDFs, or create it from current signatures for single page
      let dataToSend = {};
      if (Object.keys(signaturesByPage).length > 0) {
        // Multi-page: send all pages' signatures
        dataToSend = {
          signaturesByPage: signaturesByPage,
          pdfDisplayWidth: displayedWidth,
          pdfDisplayHeight: displayedHeight
        };
      } else {
        // Single page or image: send current signatures as page 1
        dataToSend = {
          signaturesByPage: { "1": signatures },
          pdfDisplayWidth: displayedWidth,
          pdfDisplayHeight: displayedHeight
        };
      }
      
      const response = await fetch(`/embed/${SESSION_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataToSend)
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        
        // Use correct file extension
        let downloadExt = FILE_EXT;
        
        const fileBaseName = FILENAME.replace(/\.[^/.]+$/, ""); // Remove extension
        const downloadName = `signed_${fileBaseName}${downloadExt}`;
        a.download = downloadName;
        
        console.log("💾 Downloading file:", downloadName);
        console.log("   Original FILE_EXT:", FILE_EXT);
        console.log("   Download extension:", downloadExt);
        console.log("   Original filename:", FILENAME);
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        alert(`✅ File saved successfully as ${downloadName}`);
      } else {
        const errorText = await response.text();
        console.error("Save file failed:", errorText);
        alert("❌ Failed to save file: " + errorText);
      }
    } catch (error) {
      console.error("Save file error:", error);
      alert("❌ Error saving file: " + error.message);
    }
  });
}

// ============================================================
// Helper: make any signature box draggable + 8-dir resizable
// ============================================================
// Used for PASTED/COPIED signatures (the original uses the
// global handlers above; pasted clones need their own)
function makeDraggableAndResizable(box, initialRotation = 0) {
  const handles = box.querySelectorAll(".resize-handle");
  let dragging = false;
  let localOffsetX = 0;
  let localOffsetY = 0;
  let rotation = initialRotation;
  box.dataset.rotation = rotation;

  // Right-click context menu - use same smooth function as main signature
  box.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    activeSignature = box;
    showContextMenu(e);  // Reuse the professional smooth function
  });

  // Drag
  box.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("resize-handle")) return;
    if (e.button !== 0) return;
    if (box.classList.contains("locked")) {
      alert("Signature is locked. Right-click and select Lock to unlock it.");
      return;
    }
    isDragging = true;
    activeSignature = box;
    const rect = box.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
  });

  // 8-direction resize for this pasted box
  handles.forEach(handle => {
    handle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      isResizing = true;
      resizeTarget = box;
      resizeDir = handle.dataset.dir;
      box.classList.add("resizing");
      document.body.classList.add("resizing-active");
      resizeStartX = e.clientX;
      resizeStartY = e.clientY;
      resizeStartLeft = parseInt(box.style.left) || 0;
      resizeStartTop = parseInt(box.style.top) || 0;
      resizeStartWidth = box.offsetWidth;
      resizeStartHeight = box.offsetHeight;
    });
  });
}

// ===== Reset Button - Initialize First =====
const resetBtn = document.getElementById("resetBtn");
console.log("Reset button element:", resetBtn);

if (resetBtn) {
  resetBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    console.log("Reset button clicked");
    
    if (!confirm("Are you sure you want to reset and remove the uploaded file?")) {
      return;
    }

    try {
      console.log("Sending reset request for session:", SESSION_ID);
      const response = await fetch(`/reset/${SESSION_ID}`, { method: "POST" });
      console.log("Reset response:", response);
      
      if (response.ok) {
        // Redirect without showing another alert
        window.location.href = "/";
      } else {
        const errorText = await response.text();
        console.error("Reset failed:", errorText);
        alert("Failed to reset session: " + errorText);
      }
    } catch (error) {
      console.error("Reset error:", error);
      alert("Error resetting session: " + error.message);
    }
  });
  console.log("Reset button event listener attached");
} else {
  console.error("Reset button not found in DOM");
}

// Document Preview - Universal for all file types
console.log("=== Initializing document preview ===");
console.log("FILE_URL:", FILE_URL);
console.log("FILENAME:", FILENAME);
console.log("FILE_EXT:", FILE_EXT);

const previewContainer = document.getElementById("previewContainer");
console.log("Preview container found:", !!previewContainer);

if (!previewContainer) {
  console.error("❌ Preview container not found in DOM!");
} else {
  const isPDF = FILE_EXT === '.pdf';
  const isImage = ['.jpg', '.png'].includes(FILE_EXT);
  const isWord = false;  // Word document support removed
  
  console.log("Is PDF?", isPDF);
  console.log("Is Image?", isImage);
  
  if (isPDF) {
    // Render PDF as an IMAGE (not iframe!)
    console.log("📄 Rendering PDF as image via /preview/ endpoint");
    
    // Create PDF image element
    const pdfImageHTML = document.createElement('img');
    pdfImageHTML.id = 'pdfImage';
    pdfImageHTML.src = `/preview/${SESSION_ID}`;
    pdfImageHTML.alt = 'PDF Preview';
    
    // CRITICAL: Set styles to ensure PDF doesn't block signature
    // Images MUST display at natural size for coordinate accuracy
    pdfImageHTML.style.width = 'auto';  // CRITICAL: Natural size
    pdfImageHTML.style.maxWidth = '100%';  // Don't overflow
    pdfImageHTML.style.height = 'auto';
    pdfImageHTML.style.display = 'block';
    pdfImageHTML.style.border = 'none';  // CRITICAL: No border - affects coordinates
    pdfImageHTML.style.padding = '0';  // CRITICAL: No padding
    pdfImageHTML.style.margin = '0';  // CRITICAL: No margin
    pdfImageHTML.style.pointerEvents = 'none';  // CRITICAL - allow clicks to pass through
    pdfImageHTML.style.userSelect = 'none';
    pdfImageHTML.draggable = false;
    
    // Insert as FIRST child (before signatureBox)
    previewContainer.insertBefore(pdfImageHTML, previewContainer.firstChild);
    
    console.log("✅ PDF image created");
    console.log("  - pointer-events:", pdfImageHTML.style.pointerEvents);
    console.log("  - computed pointer-events:", window.getComputedStyle(pdfImageHTML).pointerEvents);
    
    //Once image loads, shrink container to match image size
    pdfImageHTML.addEventListener("load", () => {
      previewContainer.style.minHeight = pdfImageHTML.offsetHeight + "px";
      previewContainer.style.height = pdfImageHTML.offsetHeight + "px";
      console.log(`✅ PDF image loaded: ${pdfImageHTML.offsetWidth} x ${pdfImageHTML.offsetHeight}px`);
      
      // VERIFY pointer-events is still "none" after load
      const pointerEvents = window.getComputedStyle(pdfImageHTML).pointerEvents;
      console.log(`  - pointer-events after load: ${pointerEvents}`);
      if (pointerEvents !== 'none') {
        console.error("⚠️ WARNING: PDF pointer-events is NOT 'none'! Forcing...");
        pdfImageHTML.style.setProperty('pointer-events', 'none', 'important');
      }
      
      // Initialize multi-page navigation AFTER first page loads
      initializePageNavigation();
    });
    
  } else if (isImage) {
    // Display image
    console.log("🖼️ Rendering image");
    
    const docImageHTML = document.createElement('img');
    docImageHTML.id = 'documentImage';
    docImageHTML.src = FILE_URL;
    docImageHTML.alt = 'Uploaded file';
    
    // CRITICAL: Set styles to ensure image doesn't block signature
    // Images MUST display at natural size for coordinate accuracy
    docImageHTML.style.width = 'auto';  // CRITICAL: Natural size
    docImageHTML.style.maxWidth = '100%';  // Don't overflow
    docImageHTML.style.height = 'auto';
    docImageHTML.style.display = 'block';
    docImageHTML.style.border = 'none';  // CRITICAL: No border - affects coordinates
    docImageHTML.style.padding = '0';  // CRITICAL: No padding
    docImageHTML.style.margin = '0';  // CRITICAL: No margin
    docImageHTML.style.pointerEvents = 'none';  // CRITICAL - allow clicks to pass through
    docImageHTML.style.userSelect = 'none';
    docImageHTML.draggable = false;
    
    // Insert as FIRST child (before signatureBox)
    previewContainer.insertBefore(docImageHTML, previewContainer.firstChild);
    
    console.log("✅ Image created");
    console.log("  - pointer-events:", docImageHTML.style.pointerEvents);
    console.log("  - computed pointer-events:", window.getComputedStyle(docImageHTML).pointerEvents);
    
    // Once image loads, shrink container to match image size (remove whitespace)
    docImageHTML.addEventListener("load", () => {
      previewContainer.style.minHeight = docImageHTML.offsetHeight + "px";
      previewContainer.style.height = docImageHTML.offsetHeight + "px";
      console.log(`✅ Image loaded: ${docImageHTML.offsetWidth} x ${docImageHTML.offsetHeight}px`);
      console.log("   Preview container adjusted to remove whitespace");
      
      // VERIFY pointer-events is still "none" after load
      const pointerEvents = window.getComputedStyle(docImageHTML).pointerEvents;
      console.log(`  - pointer-events after load: ${pointerEvents}`);
      if (pointerEvents !== 'none') {
        console.error("⚠️ WARNING: Image pointer-events is NOT 'none'! Forcing...");
        docImageHTML.style.setProperty('pointer-events', 'none', 'important');
      }
    });
    
  } else {
    // Unsupported file type
    console.log("⚠️ Unsupported file type:", FILE_EXT);
    previewContainer.insertAdjacentHTML("afterbegin", `
      <div style="padding: 40px; text-align: center; border: 2px dashed #ef4444; border-radius: 12px; background: #fef2f2;">
        <p style="font-size: 18px; font-weight: 600; color: #dc2626; margin:0;">⚠️ Unsupported File Type</p>
        <p style="color: #991b1b; margin: 12px 0;">Only PDF, PNG, and JPG files are supported.</p>
        <p style="color: #7f1d1d; font-size: 14px;">Please upload a valid file.</p>
      </div>
    `);
  }
  
  console.log("✅ Preview rendered successfully");
  console.log("Preview container HTML:", previewContainer.innerHTML.substring(0, 200));
  
  // DEBUG: Add global contextmenu listener to see ALL right-clicks
  document.addEventListener("contextmenu", (e) => {
    const target = e.target;
    console.log("🖱️ RIGHT-CLICK detected:");
    console.log("  - Target element:", target.tagName, target.id || "(no id)", target.className || "(no class)");
    console.log("  - Click position:", e.clientX, e.clientY);
    console.log("  - Target computed z-index:", window.getComputedStyle(target).zIndex);
    console.log("  - Target pointer-events:", window.getComputedStyle(target).pointerEvents);
    
    // Check if click is on or inside signatureBox
    if (target === signatureBox || signatureBox.contains(target)) {
      console.log("  ✅ Click IS on signature box!");
    } else {
      console.log("  ❌ Click is NOT on signature box (it's on:", target.tagName, ")");
      console.log("     Signature box position:", {
        top: signatureBox.style.top,
        left: signatureBox.style.left,
        width: signatureBox.offsetWidth + "px",
        height: signatureBox.offsetHeight + "px",
        hidden: signatureBox.classList.contains("hidden")
      });
    }
  });
  
  // Verify signature box is ready
  console.log("📋 Signature box info:");
  console.log("  - Exists:", !!signatureBox);
  console.log("  - Display:", window.getComputedStyle(signatureBox).display);
  console.log("  - Position:", window.getComputedStyle(signatureBox).position);
  console.log("  - z-index:", window.getComputedStyle(signatureBox).zIndex);
  console.log("  - pointer-events:", window.getComputedStyle(signatureBox).pointerEvents);
  
  // Ensure signatureBox is always interactive
  signatureBox.style.pointerEvents = "auto";
  console.log("  - pointer-events set to: auto");
  
  // FINAL CHECK: Verify PDF/images have pointer-events: none
  setTimeout(() => {
    const pdfImg = document.getElementById('pdfImage');
    const docImg = document.getElementById('documentImage');
    
    console.log("\n🔍 FINAL VERIFICATION (after 1 second):");
    if (pdfImg) {
      console.log("  PDF image pointer-events:", window.getComputedStyle(pdfImg).pointerEvents);
      if (window.getComputedStyle(pdfImg).pointerEvents !== 'none') {
        console.error("  ❌ ERROR: PDF still blocking clicks!");
      } else {
        console.log("  ✅ PDF pointer-events is 'none' - clicks will pass through");
      }
    }
    if (docImg) {
      console.log("  Doc image pointer-events:", window.getComputedStyle(docImg).pointerEvents);
    }
    console.log("  Signature box pointer-events:", window.getComputedStyle(signatureBox).pointerEvents);
    console.log("✅ Right-click should now work everywhere on the signature!\n");
  }, 1000);
}
