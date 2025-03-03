// Global variables
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output-canvas');
const drawingCanvas = document.getElementById('drawing-canvas');
const clearButton = document.getElementById('clear-btn');
const saveButton = document.getElementById('save-btn');
const colorButtons = document.querySelectorAll('.color-btn');
const drawingStatus = document.getElementById('drawing-status');
const tutorialToggle = document.getElementById('tutorial-toggle');
const tutorialPanel = document.querySelector('.tutorial-panel');
const sensitivityBtn = document.getElementById('sensitivity-btn');
const sensitivityPanel = document.getElementById('sensitivity-panel');
const sensitivityClose = document.getElementById('sensitivity-close');
const pinchThresholdSlider = document.getElementById('pinch-threshold');
const pinchValueDisplay = document.getElementById('pinch-value');
const smoothingFactorSlider = document.getElementById('smoothing-factor');
const smoothingValueDisplay = document.getElementById('smoothing-value');
const mirrorToggle = document.getElementById('mirror-toggle');
const ghostLineToggle = document.getElementById('ghost-line-toggle');

// Canvas setup
const canvasCtx = canvasElement.getContext('2d');
const drawingCtx = drawingCanvas.getContext('2d');

// Set initial drawing properties
let isDrawing = false;
let currentColor = '#000000';
let lastX = 0;
let lastY = 0;
// Add position history for smoothing
let positionHistory = [];
let SMOOTHING_FACTOR = 5; // Number of positions to average
let PINCH_THRESHOLD = 0.08; // Threshold for pinch detection
let isMirrored = false; // Mirror mode state
let showGhostLine = true; // Ghost line mode state
let lastDrawingPoint = null; // Store the last point where drawing ended
let ghostLineOpacity = 0.3; // Initial opacity for ghost line
let ghostLineTimeout = null; // Timeout for fading out ghost line
let ghostLineFadeDelay = 3000; // Delay before starting to fade out ghost line (ms)

// Set the canvas dimensions to match its container
function resizeCanvas() {
    const container = drawingCanvas.parentElement;
    drawingCanvas.width = container.clientWidth;
    drawingCanvas.height = container.clientHeight;
    
    canvasElement.width = videoElement.clientWidth;
    canvasElement.height = videoElement.clientHeight;
}

// Call immediately and add event listener for window resize
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Hand tracking setup using MediaPipe Hands
const hands = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// Helper function to draw a line
function drawLine(x1, y1, x2, y2, color = currentColor, width = 4, dash = []) {
    drawingCtx.beginPath();
    drawingCtx.strokeStyle = color;
    drawingCtx.lineWidth = width;
    drawingCtx.lineCap = 'round';
    
    // Set dash pattern if provided
    if (dash.length > 0) {
        drawingCtx.setLineDash(dash);
    } else {
        drawingCtx.setLineDash([]);
    }
    
    drawingCtx.moveTo(x1, y1);
    drawingCtx.lineTo(x2, y2);
    drawingCtx.stroke();
}

// Helper function to draw ghost line
function drawGhostLine(x, y) {
    if (lastDrawingPoint && showGhostLine && !isDrawing) {
        // Calculate distance between points
        const distance = Math.sqrt(
            Math.pow(lastDrawingPoint.x - x, 2) + 
            Math.pow(lastDrawingPoint.y - y, 2)
        );
        
        // Only show ghost line if points are within a reasonable distance
        // This prevents very long lines stretching across the canvas
        if (distance < drawingCanvas.width / 2) {
            // Draw a curved, semi-transparent line
            drawingCtx.save();
            
            // Create gradient for the line
            const gradient = drawingCtx.createLinearGradient(
                lastDrawingPoint.x, lastDrawingPoint.y, x, y);
            gradient.addColorStop(0, `rgba(100, 100, 100, ${ghostLineOpacity})`);
            gradient.addColorStop(1, `rgba(100, 100, 100, ${ghostLineOpacity * 0.5})`);
            
            // Draw the line with bezier curve for smoother appearance
            drawingCtx.beginPath();
            drawingCtx.strokeStyle = gradient;
            drawingCtx.lineWidth = 2;
            drawingCtx.lineCap = 'round';
            drawingCtx.setLineDash([3, 3]); // Smaller, more elegant dashes
            
            // Calculate control points for the curve
            const ctrlX = (lastDrawingPoint.x + x) / 2;
            const ctrlY = (lastDrawingPoint.y + y) / 2;
            
            drawingCtx.moveTo(lastDrawingPoint.x, lastDrawingPoint.y);
            drawingCtx.quadraticCurveTo(ctrlX, ctrlY, x, y);
            drawingCtx.stroke();
            
            drawingCtx.restore();
        }
    }
}

// Function to start ghost line fade out
function startGhostLineFadeOut() {
    // Clear any existing timeout
    if (ghostLineTimeout) {
        clearTimeout(ghostLineTimeout);
    }
    
    // Reset opacity
    ghostLineOpacity = 0.3;
    
    // Set timeout to start fading
    ghostLineTimeout = setTimeout(() => {
        // Gradually reduce opacity
        const fadeInterval = setInterval(() => {
            ghostLineOpacity -= 0.01;
            
            if (ghostLineOpacity <= 0) {
                clearInterval(fadeInterval);
                ghostLineOpacity = 0;
            }
        }, 50); // Update every 50ms for smooth fade
    }, ghostLineFadeDelay);
}

// Add smoothing function
function smoothPosition(x, y) {
    // Add current position to history
    positionHistory.push({ x, y });
    
    // Keep history at desired length
    if (positionHistory.length > SMOOTHING_FACTOR) {
        positionHistory.shift();
    }
    
    // If we don't have enough positions yet, return current position
    if (positionHistory.length < 2) {
        return { x, y };
    }
    
    // Calculate average position
    let avgX = 0;
    let avgY = 0;
    
    positionHistory.forEach(pos => {
        avgX += pos.x;
        avgY += pos.y;
    });
    
    avgX /= positionHistory.length;
    avgY /= positionHistory.length;
    
    return { x: avgX, y: avgY };
}

// Update drawing status display
function updateDrawingStatus(drawing) {
    if (drawing) {
        drawingStatus.textContent = "Drawing";
        drawingStatus.classList.add('active');
    } else {
        drawingStatus.textContent = "Not Drawing";
        drawingStatus.classList.remove('active');
    }
}

// Process each frame from the camera
hands.onResults(results => {
    // Clear the canvas
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Save the current state
    canvasCtx.save();
    
    // Apply mirroring if enabled
    if (isMirrored) {
        canvasCtx.translate(canvasElement.width, 0);
        canvasCtx.scale(-1, 1);
    }
    
    // Draw camera view
    canvasCtx.drawImage(
        results.image, 0, 0, canvasElement.width, canvasElement.height);
    
    // Restore the state
    canvasCtx.restore();
    
    // Draw hand landmarks
    if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
            // Save state for hand landmarks drawing
            canvasCtx.save();
            
            // Apply mirroring for landmarks if enabled
            if (isMirrored) {
                canvasCtx.translate(canvasElement.width, 0);
                canvasCtx.scale(-1, 1);
            }
            
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS,
                {color: '#00FF00', lineWidth: 2});
            drawLandmarks(canvasCtx, landmarks, 
                {color: '#FF0000', lineWidth: 1});
            
            // Restore state
            canvasCtx.restore();
            
            // Use index finger tip for drawing (landmark 8)
            const indexFinger = landmarks[8];
            
            // Map the coordinates from the video to the drawing canvas
            let x = indexFinger.x;
            let y = indexFinger.y;
            
            // Apply mirroring to coordinates if enabled
            if (isMirrored) {
                x = 1 - x;
            }
            
            // Scale to canvas dimensions
            x = x * drawingCanvas.width;
            y = y * drawingCanvas.height;
            
            // Draw ghost line if not currently drawing
            drawGhostLine(x, y);
            
            // Detect if thumb and index finger are pinched (for drawing)
            const thumb = landmarks[4];
            const distance = Math.sqrt(
                Math.pow(indexFinger.x - thumb.x, 2) + 
                Math.pow(indexFinger.y - thumb.y, 2)
            );
            
            // If fingers are close, start drawing
            if (distance < PINCH_THRESHOLD) { // Adjust this threshold as needed
                if (!isDrawing) {
                    // Start a new line
                    isDrawing = true;
                    // Reset position history when starting a new line
                    positionHistory = [];
                    lastX = x;
                    lastY = y;
                    updateDrawingStatus(true);
                } else {
                    // Apply smoothing to the current position
                    const smoothed = smoothPosition(x, y);
                    
                    // Continue the line with smoothed coordinates
                    drawLine(lastX, lastY, smoothed.x, smoothed.y);
                    lastX = smoothed.x;
                    lastY = smoothed.y;
                }
            } else {
                if (isDrawing) {
                    isDrawing = false;
                    updateDrawingStatus(false);
                    
                    // Store the last drawing point for ghost line
                    lastDrawingPoint = { x: lastX, y: lastY };
                    
                    // Start the fade-out timer for the ghost line
                    startGhostLineFadeOut();
                }
                // Clear position history when not drawing
                positionHistory = [];
            }
        }
    }
});

// Clear the canvas when clear button is clicked
clearButton.addEventListener('click', () => {
    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    // Reset last drawing point when canvas is cleared
    lastDrawingPoint = null;
});

// Save the drawing as an image
saveButton.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'airdoodle-drawing.png';
    link.href = drawingCanvas.toDataURL();
    link.click();
});

// Color selection
colorButtons.forEach(button => {
    button.addEventListener('click', () => {
        // Remove active class from all buttons
        colorButtons.forEach(btn => btn.classList.remove('active'));
        // Add active class to clicked button
        button.classList.add('active');
        // Set current color
        currentColor = button.dataset.color;
    });
});

// Tutorial toggle
tutorialToggle.addEventListener('click', () => {
    const tutorialContent = tutorialPanel.querySelectorAll('h2, .tutorial-step');
    
    if (tutorialToggle.textContent === 'Hide Tutorial') {
        tutorialContent.forEach(el => el.style.display = 'none');
        tutorialToggle.textContent = 'Show Tutorial';
    } else {
        tutorialContent.forEach(el => el.style.display = '');
        tutorialToggle.textContent = 'Hide Tutorial';
    }
});

// Mirror toggle functionality
mirrorToggle.addEventListener('click', () => {
    isMirrored = !isMirrored;
    
    // Update button text
    if (isMirrored) {
        mirrorToggle.textContent = 'Disable Mirror';
        mirrorToggle.classList.add('active');
    } else {
        mirrorToggle.textContent = 'Enable Mirror';
        mirrorToggle.classList.remove('active');
    }
});

// Ghost line toggle functionality
ghostLineToggle.addEventListener('click', () => {
    showGhostLine = !showGhostLine;
    
    // Update button text
    if (showGhostLine) {
        ghostLineToggle.textContent = 'Hide Guide Line';
        ghostLineToggle.classList.add('active');
        
        // If turning on, reset the opacity and start fade timer
        if (lastDrawingPoint) {
            ghostLineOpacity = 0.3;
            startGhostLineFadeOut();
        }
    } else {
        ghostLineToggle.textContent = 'Show Guide Line';
        ghostLineToggle.classList.remove('active');
    }
});

// Sensitivity panel controls
sensitivityBtn.addEventListener('click', () => {
    sensitivityPanel.classList.toggle('hidden');
});

sensitivityClose.addEventListener('click', () => {
    sensitivityPanel.classList.add('hidden');
});

// Pinch threshold slider
pinchThresholdSlider.addEventListener('input', () => {
    const value = pinchThresholdSlider.value / 100;
    PINCH_THRESHOLD = value;
    pinchValueDisplay.textContent = value.toFixed(2);
});

// Smoothing factor slider
smoothingFactorSlider.addEventListener('input', () => {
    SMOOTHING_FACTOR = parseInt(smoothingFactorSlider.value);
    smoothingValueDisplay.textContent = SMOOTHING_FACTOR;
});

// Setup camera
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({image: videoElement});
    },
    width: 640,
    height: 480
});

// Start the camera
camera.start()
    .then(() => {
        console.log('Camera started successfully');
    })
    .catch(error => {
        console.error('Error starting camera:', error);
        alert('Error accessing camera. Please ensure you have granted camera permissions and try again.');
    });
