import gameModule from './kingkung.js';

let currentPlayer;
let socket;
let musicVolume = 1;
let backgroundMusic;

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

    musicVolumeButton.addEventListener('click', () => toggleVolumeSlider(musicVolumeSlider));
    musicVolumeSlider.addEventListener('input', updateMusicVolume);

    // Initialize music volume based on slider position
    musicVolume = musicVolumeSlider.value / 100;
    updateVolumeIcon(musicVolumeSlider, 'musicVolumeButton');

    if (backgroundMusic) {
        backgroundMusic.volume = musicVolume;
        backgroundMusic.addEventListener('error', (e) => {
            console.error('Error loading background music:', e);
            musicVolumeButton.disabled = true;
            musicVolumeSlider.disabled = true;
        });

        // Use a promise to handle potential play() failures
        const playPromise = backgroundMusic.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.error('Error playing background music:', error);
                // You might want to inform the user or retry playing
            });
        }
    }
}

function toggleVolumeSlider(slider) {
    slider.style.opacity = slider.style.opacity === '1' ? '0' : '1';
}

function updateMusicVolume(e) {
    musicVolume = e.target.value / 100;
    updateVolumeIcon(e.target, 'musicVolumeButton');
    if (backgroundMusic) {
        backgroundMusic.volume = musicVolume;
    }
}

function updateVolumeIcon(slider, buttonId) {
    const button = document.getElementById(buttonId);
    const icon = button.querySelector('i');
    const volume = slider.value;

    if (volume == 0) {
        icon.className = 'fas fa-volume-mute';
        button.classList.add('muted');
    } else if (volume < 50) {
        icon.className = 'fas fa-music';
        button.classList.remove('muted');
    } else {
        icon.className = 'fas fa-music';
        button.classList.remove('muted');
    }
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
    joinButton.addEventListener('click', validateAndJoin);
}

function validateAndJoin() {
    const roomCode = document.getElementById('roomCode').value;
    const playerName = document.getElementById('playerName').value;
    const playerColor = window.gameColorPicker.color.hsl;

    if (!roomCode || !playerName) {
        alert('Please enter both room code and player name.');
        return;
    }

    socket.emit('validateColor', { roomCode, playerColor: playerColor.h });
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

        playAgainButton.addEventListener('click', () => {
            socket.emit('playAgain');
            playAgainButton.disabled = true;
            playAgainButton.textContent = 'Waiting for other player...';
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

document.addEventListener('DOMContentLoaded', () => {
    initializeSocketConnection();
    initializeColorPicker();
    initializeJoinButton();
    initializeMusicControls();

    // Set up sound volume control for game sounds
    const soundVolumeSlider = document.getElementById('soundVolumeSlider');
    const soundVolumeButton = document.getElementById('soundVolumeButton');

    soundVolumeButton.addEventListener('click', () => toggleVolumeSlider(soundVolumeSlider));

    soundVolumeSlider.addEventListener('input', (e) => {
        const volume = e.target.value / 100;
        gameModule.updateSoundVolume(volume);
        updateVolumeIcon(soundVolumeSlider, 'soundVolumeButton');
    });

    // Hide color warning when color is changed
    window.gameColorPicker.on('color:change', hideColorWarning);

    // Listen for the custom gameWon event
    document.addEventListener('gameWon', (event) => {
        showWinNotification(event.detail);
    });
});