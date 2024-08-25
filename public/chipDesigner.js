window.chipDesigner = (function () {
    let canvas, ctx;
    const pixelSize = 10; // Each pixel in the 32x32 grid will be 10x10 canvas pixels
    let currentColor = '#000000';
    let isDrawing = false;
    let currentTool = 'pencil';
    let backgroundColor = '#FF0000'; // Default red background

    function init() {
        canvas = document.getElementById('drawingPad');
        if (!canvas) {
            console.error('Drawing pad canvas not found');
            return;
        }
        ctx = canvas.getContext('2d');
        canvas.width = 320;
        canvas.height = 320;
        clearCanvas();
        addEventListeners();
        updateColorToggleButton();
    }

    function clearCanvas() {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawGrid();
    }

    function drawGrid() {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;

        for (let i = 0; i <= 32; i++) {
            ctx.beginPath();
            ctx.moveTo(i * pixelSize, 0);
            ctx.lineTo(i * pixelSize, canvas.height);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, i * pixelSize);
            ctx.lineTo(canvas.width, i * pixelSize);
            ctx.stroke();
        }
    }

    function addEventListeners() {
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseleave', stopDrawing);

        document.getElementById('pencilButton').addEventListener('click', () => setTool('pencil'));
        document.getElementById('eraserButton').addEventListener('click', () => setTool('eraser'));
        document.getElementById('colorToggleButton').addEventListener('click', toggleColor);
    }

    function startDrawing(e) {
        isDrawing = true;
        draw(e);
    }

    function draw(e) {
        if (!isDrawing) return;

        const rect = canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / pixelSize);
        const y = Math.floor((e.clientY - rect.top) / pixelSize);

        ctx.fillStyle = currentTool === 'pencil' ? currentColor : backgroundColor;
        ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
    }

    function stopDrawing() {
        isDrawing = false;
    }

    function setTool(tool) {
        currentTool = tool;
        document.querySelectorAll('.tool-button').forEach(button => {
            button.classList.remove('active');
        });
        document.getElementById(`${tool}Button`).classList.add('active');
    }

    function toggleColor() {
        currentColor = currentColor === '#000000' ? '#FFFFFF' : '#000000';
        updateColorToggleButton();
    }

    function updateColorToggleButton() {
        const indicator = document.querySelector('.color-toggle-indicator');
        indicator.style.backgroundColor = currentColor;
    }

    function setBackgroundColor(color) {
        backgroundColor = color;
        clearCanvas();
    }

    function getDesign() {
        const designData = [];
        for (let y = 0; y < 32; y++) {
            for (let x = 0; x < 32; x++) {
                const imageData = ctx.getImageData(x * pixelSize, y * pixelSize, 1, 1);
                const [r, g, b] = imageData.data;
                designData.push(r === 0 && g === 0 && b === 0 ? 1 : 0);
            }
        }
        return designData;
    }

    return {
        init,
        getDesign,
        setBackgroundColor
    };
})();

// Initialize the chip designer when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', window.chipDesigner.init);