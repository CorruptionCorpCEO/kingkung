import gameModule from './kingkung.js';

let currentPlayer;
let socket;
let backgroundMusic;
let musicVolume = localStorage.getItem('musicVolume') !== null
    ? parseFloat(localStorage.getItem('musicVolume'))
    : 1;
let soundVolume = localStorage.getItem('soundVolume') !== null
    ? parseFloat(localStorage.getItem('soundVolume'))
    : 1;

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
    const musicVolumeButton = document.getElementById('musicVolumeButton');
    const musicVolumeSlider = document.getElementById('musicVolumeSlider');

    if (backgroundMusic) {
        backgroundMusic.volume = musicVolume;
        musicVolumeSlider.value = musicVolume * 100;
        updateVolumeIcon(musicVolumeSlider, 'musicVolumeButton', true);

        musicVolumeButton.addEventListener('click', () => toggleVolumeSlider(musicVolumeSlider));
        musicVolumeSlider.addEventListener('input', updateMusicVolume);

        backgroundMusic.play().catch(error => {
            console.error('Error playing background music:', error);
        });
    }
}

function updateMusicVolume(e) {
    musicVolume = e.target.value / 100;
    localStorage.setItem('musicVolume', musicVolume);
    updateVolumeIcon(e.target, 'musicVolumeButton', true);
    if (backgroundMusic) {
        backgroundMusic.volume = musicVolume;
    }
}

function updateVolumeIcon(slider, buttonId, isMusic = false) {
    const button = document.getElementById(buttonId);
    const icon = button.querySelector('i');
    const volume = slider.value;

    if (volume == 0) {
        icon.className = isMusic ? 'fas fa-music-slash' : 'fas fa-volume-mute';
        button.classList.add('muted');
    } else if (volume < 50) {
        icon.className = isMusic ? 'fas fa-music' : 'fas fa-volume-down';
        button.classList.remove('muted');
    } else {
        icon.className = isMusic ? 'fas fa-music' : 'fas fa-volume-up';
        button.classList.remove('muted');
    }
}

function startBackgroundMusic() {
    if (backgroundMusic && backgroundMusic.paused) {
        backgroundMusic.play().catch(error => {
            console.error('Error playing background music:', error);
        });
    }
}

function toggleVolumeSlider(slider) {
    slider.style.opacity = slider.style.opacity === '1' ? '0' : '1';
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

    // Force a reflow to ensure styles are applied
    notification.offsetHeight;
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
    initializeRulesModal();

    // Set up sound volume control for game sounds
    const soundVolumeSlider = document.getElementById('soundVolumeSlider');
    const soundVolumeButton = document.getElementById('soundVolumeButton');
    document.addEventListener('click', startBackgroundMusic, { once: true });

    if (soundVolumeSlider && soundVolumeButton) {
        soundVolumeSlider.value = soundVolume * 100;
        updateVolumeIcon(soundVolumeSlider, 'soundVolumeButton', false);

        soundVolumeButton.addEventListener('click', () => toggleVolumeSlider(soundVolumeSlider));

        soundVolumeSlider.addEventListener('input', (e) => {
            const volume = e.target.value / 100;
            localStorage.setItem('soundVolume', volume);
            gameModule.updateSoundVolume(volume);
            updateVolumeIcon(soundVolumeSlider, 'soundVolumeButton', false);
        });
    }

    // Hide color warning when color is changed
    if (window.gameColorPicker) {
        window.gameColorPicker.on('color:change', hideColorWarning);
    }

    // Listen for the custom gameWon event
    document.addEventListener('gameWon', (event) => {
        showWinNotification(event.detail);
    });
});

export default {
    updateSoundVolume: (volume) => {
        soundVolume = volume;
        // Update game sound volume here if needed
    }
};
