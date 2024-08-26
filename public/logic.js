import gameModule from './kingkung.js';

let currentPlayer;
let socket;
let backgroundMusic;

const VOLUME_LEVELS = [0, 0.25, 0.5, 0.75, 1];

function initializeSocketConnection() {
    socket = io();

    socket.on('connect', () => {
        console.log('Connected to server');
    });

    socket.on('joinRoomResponse', (response) => {
        if (response.success) {
            console.log('Successfully joined room:', response.message);
            currentPlayer = response.player;
            hideMainMenu();
            if (currentPlayer.role === 'host') {
                showWaitingMessage();
            }
        } else {
            console.log('Failed to join room:', response.message);
            alert(`Failed to join room: ${response.message}`);
        }
    });

    socket.on('gameStart', (data) => {
        console.log('Game is starting');
        hideWaitingMessage();
        gameModule.init(currentPlayer, data.players, socket);
    });

    socket.on('playerDisconnected', (data) => {
        console.log('Other player disconnected');
        currentPlayer = data.players[0]; // Update current player (now host)
        showWaitingMessage();
        gameModule.handleDisconnection();
    });

    socket.on('colorValidation', (data) => {
        if (data.valid) {
            joinRoom();
        } else {
            showColorWarning();
        }
    });

    socket.on('gameReset', (gameState) => {
        hideWinNotification();
        // Additional reset logic if needed
    });
}

function initializeMusicControls() {
    backgroundMusic = document.getElementById('backgroundMusic');
    if (backgroundMusic) {
        backgroundMusic.volume = musicVolume;
        backgroundMusic.play().catch(error => {
            console.error('Error playing background music:', error);
        });
    }
}

let musicVolume = parseFloat(localStorage.getItem('musicVolume') || '1');
let soundVolume = parseFloat(localStorage.getItem('soundVolume') || '1');

function initializeVolumeControls() {
    const musicVolumeSlider = document.getElementById('musicVolume');
    const soundVolumeSlider = document.getElementById('soundVolume');
    const musicIconWrapper = document.querySelector('.volume-control:first-child .volume-icon-wrapper');
    const soundIconWrapper = document.querySelector('.volume-control:last-child .volume-icon-wrapper');

    if (musicVolumeSlider) {
        musicVolumeSlider.value = musicVolume;
        musicVolumeSlider.addEventListener('input', () => updateVolume('music'));
    }

    if (soundVolumeSlider) {
        soundVolumeSlider.value = soundVolume;
        soundVolumeSlider.addEventListener('input', () => updateVolume('sound'));
    }

    if (musicIconWrapper) {
        musicIconWrapper.addEventListener('click', () => toggleVolumeControl('music'));
    }

    if (soundIconWrapper) {
        soundIconWrapper.addEventListener('click', () => toggleVolumeControl('sound'));
    }

    // Set initial volumes and update icons
    if (backgroundMusic) {
        backgroundMusic.volume = musicVolume;
    }
    gameModule.updateSoundVolume(soundVolume);
    updateVolumeIcon('music', musicVolume);
    updateVolumeIcon('sound', soundVolume);
}

function updateVolume(type) {
    const slider = document.getElementById(`${type}Volume`);
    const newVolume = parseFloat(slider.value);

    if (type === 'music') {
        musicVolume = newVolume;
        localStorage.setItem('musicVolume', newVolume);
        if (backgroundMusic) {
            backgroundMusic.volume = newVolume;
        }
    } else {
        soundVolume = newVolume;
        localStorage.setItem('soundVolume', newVolume);
        gameModule.updateSoundVolume(newVolume);
    }

    updateVolumeIcon(type, newVolume);
}

function updateVolumeIcon(type, volume) {
    const icon = document.getElementById(`${type}Icon`);
    if (icon) {
        if (type === 'music') {
            // Always use the music icon for music, just toggle the mute state
            icon.className = volume === 0 ? 'fas fa-volume-mute' : 'fas fa-music';
        } else {
            // For sound effects, use different icons based on volume
            if (volume === 0) {
                icon.className = 'fas fa-volume-mute';
            } else if (volume < 0.5) {
                icon.className = 'fas fa-volume-down';
            } else {
                icon.className = 'fas fa-volume-up';
            }
        }
    }
}

function toggleVolumeControl(type) {
    const volumeControl = document.querySelector(`.volume-control:${type === 'music' ? 'first-child' : 'last-child'}`);
    volumeControl.classList.toggle('expanded');
}

function initializeColorPicker() {
    const colorPicker = new iro.ColorPicker("#colorPicker", {
        width: 200,
        color: "hsl(0, 100%, 50%)",
        borderWidth: 1,
        borderColor: "#ccc",
        layout: [
            {
                component: iro.ui.Slider,
                options: {
                    sliderType: 'hue'
                }
            }
        ]
    });

    window.gameColorPicker = colorPicker;

    // Ensure volume icons are correct after color picker initialization
    updateVolumeIcon('music', musicVolume);
    updateVolumeIcon('sound', soundVolume);
}

function cycleVolume(type) {
    const currentVolume = type === 'music' ? musicVolume : soundVolume;
    const currentIndex = VOLUME_LEVELS.indexOf(currentVolume);
    const nextIndex = (currentIndex + 1) % VOLUME_LEVELS.length;
    const newVolume = VOLUME_LEVELS[nextIndex];

    if (type === 'music') {
        musicVolume = newVolume;
        localStorage.setItem('musicVolume', newVolume);
        if (backgroundMusic) {
            backgroundMusic.volume = newVolume;
        }
        updateVolumeIcon(document.getElementById('musicVolumeButton'), newVolume);
    } else {
        soundVolume = newVolume;
        localStorage.setItem('soundVolume', newVolume);
        gameModule.updateSoundVolume(newVolume);
        updateVolumeIcon(document.getElementById('soundVolumeButton'), newVolume);
    }
}





function initializeJoinButton() {
    const joinButton = document.getElementById('joinButton');
    if (joinButton) {
        joinButton.addEventListener('click', validateAndJoin);
    } else {
        console.error('Join button not found in the DOM');
    }
}

function validateAndJoin() {
    const roomCode = document.getElementById('roomCode').value;
    const playerName = document.getElementById('playerName').value;
    const playerColor = window.gameColorPicker.color.hexString;

    if (!roomCode || !playerName) {
        alert('Please enter both room code and player name.');
        return;
    }

    socket.emit('validateColor', { roomCode, playerColor: window.gameColorPicker.color.hsl.h });
}

function joinRoom() {
    const roomCode = document.getElementById('roomCode').value;
    const playerName = document.getElementById('playerName').value;
    const playerColor = window.gameColorPicker.color.hexString;

    socket.emit('joinRoom', { roomCode, playerName, playerColor });
}

function showColorWarning() {
    const warningElement = document.getElementById('colorWarning');
    warningElement.textContent = 'Please choose a different color. It\'s too similar to the other player\'s color.';
    warningElement.style.display = 'block';
}

function hideColorWarning() {
    const warningElement = document.getElementById('colorWarning');
    warningElement.style.display = 'none';
}

function hideMainMenu() {
    document.getElementById('mainMenu').style.display = 'none';
}

function showWaitingMessage() {
    document.getElementById('waitingMessage').style.display = 'block';
}

function hideWaitingMessage() {
    document.getElementById('waitingMessage').style.display = 'none';
}

function showWinNotification(winner) {
    const notification = document.createElement('div');
    notification.className = 'win-notification';
    notification.innerHTML = `
        <h2>${winner.name} wins!</h2>
        <button id="playAgainButton">Play Again</button>
    `;
    document.body.appendChild(notification);

    const playAgainButton = document.getElementById('playAgainButton');
    if (playAgainButton) {
        playAgainButton.style.backgroundColor = winner.color;
        playAgainButton.style.color = getContrastColor(winner.color);

        playAgainButton.addEventListener('click', function () {
            socket.emit('playAgain');
            this.disabled = true;
            this.textContent = 'Waiting for other player...';
        });
    }
}

function getContrastColor(hexColor) {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
}

function hideWinNotification() {
    const winNotification = document.querySelector('.win-notification');
    if (winNotification) {
        winNotification.remove();
    }
}

function initializeRulesModal() {
    const rulesButton = document.getElementById('rulesButton');
    const rulesModal = document.getElementById('rulesModal');
    const closeBtn = rulesModal.querySelector('.close');

    rulesButton.addEventListener('click', () => {
        rulesModal.style.display = 'block';
    });

    closeBtn.addEventListener('click', () => {
        rulesModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === rulesModal) {
            rulesModal.style.display = 'none';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initializeSocketConnection();
    initializeColorPicker();
    initializeJoinButton();
    initializeMusicControls();
    initializeVolumeControls();
    initializeRulesModal();

    // Hide color warning when color is changed
    if (window.gameColorPicker) {
        window.gameColorPicker.on('color:change', hideColorWarning);
    }

    // Listen for the custom gameWon event
    document.addEventListener('gameWon', (event) => {
        showWinNotification(event.detail);
    });

    // Start background music on first user interaction
    document.addEventListener('click', () => {
        if (backgroundMusic && backgroundMusic.paused) {
            backgroundMusic.play().catch(error => {
                console.error('Error playing background music:', error);
            });
        }
    }, { once: true });
});

export default {
    updateSoundVolume: (volume) => {
        soundVolume = volume;
        // Update game sound volume here if needed
    }
};
