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
function drawLine(x1, y1, x2, y2) {
    drawingCtx.beginPath();
    drawingCtx.strokeStyle = currentColor;
    drawingCtx.lineWidth = 4;
    drawingCtx.lineCap = 'round';
    drawingCtx.moveTo(x1, y1);
    drawingCtx.lineTo(x2, y2);
    drawingCtx.stroke();
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
    
    // Draw camera view
    canvasCtx.drawImage(
        results.image, 0, 0, canvasElement.width, canvasElement.height);
    
    // Draw hand landmarks
    if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS,
                {color: '#00FF00', lineWidth: 2});
            drawLandmarks(canvasCtx, landmarks, 
                {color: '#FF0000', lineWidth: 1});
            
            // Use index finger tip for drawing (landmark 8)
            const indexFinger = landmarks[8];
            
            // Map the coordinates from the video to the drawing canvas
            const x = indexFinger.x * drawingCanvas.width;
            const y = indexFinger.y * drawingCanvas.height;
            
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
