import gameModule from './kingkung.js';

let currentPlayer;
let socket;
let backgroundMusic;
let lobbyList = [];

let musicVolume = parseFloat(localStorage.getItem('musicVolume') || '1');
let soundVolume = parseFloat(localStorage.getItem('soundVolume') || '1');

function initializeSocketConnection() {
    socket = io();

    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('requestLobbyUpdate');
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
            if (response.errorType === 'colorError') {
                showColorWarning(response.message);
            } else if (response.errorType === 'privateRoomError') {
                showPrivateRoomWarning(response.message);
            } else {
                alert(`Failed to join room: ${response.message}`);
            }
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
        socket.emit('requestLobbyUpdate');
    });

    socket.on('lobbyUpdate', (updatedLobbyList) => {
        console.log("Received lobby update:", updatedLobbyList);
        lobbyList = updatedLobbyList;
        updateLobbyListDisplay();
    });

    socket.on('gameStateUpdate', (gameState) => {
        gameModule.updateGameState(gameState);
    });

    socket.on('gameWon', ({ winner, gameState }) => {
        gameModule.updateGameState(gameState);
        showWinNotification(winner);
    });

    socket.on('playerReadyForRematch', (playerRole) => {
        const playAgainButton = document.getElementById('playAgainButton');
        if (playAgainButton) {
            if (playerRole !== currentPlayer.role) {
                playAgainButton.textContent = 'Other player is ready. Click to start!';
                playAgainButton.disabled = false;
            }
        }
    });

    socket.on('gameReset', (gameState) => {
        gameModule.updateGameState(gameState);
        hideWinNotification();
        resetPlayAgainButton();
    });

    socket.on('waitingForPlayAgain', () => {
        const playAgainButton = document.getElementById('playAgainButton');
        if (playAgainButton) {
            playAgainButton.disabled = true;
            playAgainButton.textContent = 'Waiting for other player...';
        }
    });
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

function initializeMusicControls() {
    backgroundMusic = document.getElementById('backgroundMusic');
    if (backgroundMusic) {
        backgroundMusic.volume = musicVolume;
    }
}

function startBackgroundMusic() {
    if (backgroundMusic && backgroundMusic.paused) {
        backgroundMusic.play().catch(error => {
            console.error('Error playing background music:', error);
        });
    }
}

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
            if (backgroundMusic.paused) {
                startBackgroundMusic();
            }
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
            icon.className = volume === 0 ? 'fas fa-volume-mute' : 'fas fa-music';
        } else {
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

function initializeLobbySystem()
{
    const elements = {
        showLobbyButton: document.getElementById('showLobbyButton'),
        lobbyModal: document.getElementById('lobbyModal'),
        joinButton: document.getElementById('joinButton'),
        roomCodeInput: document.getElementById('roomCode'),
        playerNameInput: document.getElementById('playerName'),
        privateRoomCheckbox: document.getElementById('privateRoom')

    };

    const roomCodeInput = document.getElementById('roomCode');
    if (roomCodeInput) {
        roomCodeInput.addEventListener('input', handleRoomCodeChange);
    } else {
        console.error('Room code input not found');
    }

    // Check if all required elements exist
    const missingElements = Object.entries(elements)
        .filter(([key, element]) => !element)
        .map(([key]) => key);

    if (missingElements.length > 0) {
        console.error('Missing elements:', missingElements.join(', '));
        return; // Exit the function if any required elements are missing
    }

    // Set up lobby modal
    elements.showLobbyButton.addEventListener('click', () => {
        console.log("Show Lobby button clicked");
        socket.emit('requestLobbyUpdate');
        elements.lobbyModal.style.display = 'block';
    });

    const closeLobbyBtn = elements.lobbyModal.querySelector('.close');
    if (closeLobbyBtn) {
        closeLobbyBtn.addEventListener('click', () => {
            elements.lobbyModal.style.display = 'none';
        });
    } else {
        console.warn('Close button for lobby modal not found');
    }

    window.addEventListener('click', (event) => {
        if (event.target === elements.lobbyModal) {
            elements.lobbyModal.style.display = 'none';
        }
    });

    // Set up join button
    elements.joinButton.addEventListener('click', handleJoinGame);

    // Set up input listeners
    elements.roomCodeInput.addEventListener('input', () => {
        hideWarnings();
        updateJoinInfo();
    });

    elements.playerNameInput.addEventListener('input', updateJoinInfo);

    elements.privateRoomCheckbox.addEventListener('change', () => {
        hideWarnings();
        updateJoinInfo();
    });

    // Set up color picker listener
    if (window.gameColorPicker) {
        window.gameColorPicker.on('color:change', () => {
            hideWarnings();
            updateJoinInfo();
        });
    } else {
        console.error('Color picker not initialized');
    }

    console.log('Lobby system initialized successfully');
}

function handleRoomCodeChange(event) {
    const roomCodeInput = event.target;
    const privateRoomCheckbox = document.getElementById('privateRoom');

    if (privateRoomCheckbox) {
        if (roomCodeInput.value !== roomCodeInput.dataset.originalCode) {
            privateRoomCheckbox.disabled = false;
        } else {
            privateRoomCheckbox.disabled = true;
        }
    } else {
        console.error('Private room checkbox not found');
    }

    hideWarnings();
    updateJoinInfo();
}
function handleJoinGame() {
    const roomCode = document.getElementById('roomCode').value;
    const playerName = document.getElementById('playerName').value;
    const playerColor = window.gameColorPicker.color.hexString;
    const privateRoom = document.getElementById('privateRoom').checked;

    if (!roomCode || !playerName) {
        alert('Please enter both room code and player name.');
        return;
    }

    hideWarnings();
    socket.emit('joinRoom', { roomCode, playerName, playerColor, privateRoom });
}

function updateJoinInfo() {
    const roomCode = document.getElementById('roomCode').value;
    const playerName = document.getElementById('playerName').value;
    const playerColor = window.gameColorPicker.color.hexString;
    const privateRoom = document.getElementById('privateRoom').checked;

    if (roomCode && playerName && playerColor) {
        socket.emit('updateJoinInfo', { roomCode, playerName, playerColor, privateRoom });
    }
}

function updateLobbyListDisplay() {
    console.log("Updating lobby list display");
    console.log("Current lobbyList:", lobbyList);

    const lobbyListContainer = document.getElementById('lobbyList');

    if (!lobbyListContainer) {
        console.error("Lobby list container not found!");
        return;
    }

    console.log("Clearing lobby list container");
    lobbyListContainer.innerHTML = '';

    if (lobbyList.length === 0) {
        console.log("No rooms available, adding no-rooms-message");
        const noRoomsMessage = document.createElement('div');
        noRoomsMessage.className = 'no-rooms-message';
        noRoomsMessage.textContent = 'No public rooms available';
        lobbyListContainer.appendChild(noRoomsMessage);
        console.log("No-rooms-message added:", noRoomsMessage);
    } else {
        console.log("Rooms available, adding room elements");
        lobbyList.forEach(room => {
            const roomElement = document.createElement('div');
            roomElement.className = 'lobby-room';

            const chipElement = document.createElement('div');
            chipElement.className = 'lobby-chip';
            chipElement.style.backgroundColor = room.playerColor;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'player-name';
            nameSpan.textContent = room.playerName;

            roomElement.appendChild(chipElement);
            roomElement.appendChild(nameSpan);

            roomElement.addEventListener('click', () => selectLobbyRoom(room));

            lobbyListContainer.appendChild(roomElement);
        });
    }

    console.log("Lobby list container after update:", lobbyListContainer.innerHTML);
}

function selectLobbyRoom(room) {
    const roomCodeInput = document.getElementById('roomCode');
    const privateRoomCheckbox = document.getElementById('privateRoom');

    if (roomCodeInput && privateRoomCheckbox) {
        roomCodeInput.value = room.roomCode;
        privateRoomCheckbox.checked = false;
        privateRoomCheckbox.disabled = true;

        // Store the original room code
        roomCodeInput.dataset.originalCode = room.roomCode;
    } else {
        console.error('Room code input or private room checkbox not found');
    }

    const lobbyModal = document.getElementById('lobbyModal');
    if (lobbyModal) {
        lobbyModal.style.display = 'none';
    } else {
        console.error('Lobby modal not found');
    }

    updateJoinInfo();
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
            this.textContent = 'Waiting for other player...';
            this.disabled = true;
        });
    }
}

function resetPlayAgainButton() {
    const playAgainButton = document.getElementById('playAgainButton');
    if (playAgainButton) {
        playAgainButton.textContent = 'Play Again';
        playAgainButton.disabled = false;
    }
}

function getContrastColor(hexColor) {
    hexColor = hexColor.replace('#', '');
    const r = parseInt(hexColor.substr(0, 2), 16);
    const g = parseInt(hexColor.substr(2, 2), 16);
    const b = parseInt(hexColor.substr(4, 2), 16);
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

function showColorWarning(message) {
    const warningElement = document.getElementById('colorWarning');
    if (warningElement) {
        warningElement.textContent = message;
        warningElement.style.display = 'block';
    } else {
        console.error('Color warning element not found');
    }
}

function showPrivateRoomWarning(message) {
    const warningElement = document.getElementById('privateRoomWarning');
    if (warningElement) {
        warningElement.textContent = message;
        warningElement.style.display = 'block';
    } else {
        console.error('Private room warning element not found');
    }
}

function hideWarnings() {
    const colorWarning = document.getElementById('colorWarning');
    const privateRoomWarning = document.getElementById('privateRoomWarning');

    if (colorWarning) {
        colorWarning.style.display = 'none';
    }

    if (privateRoomWarning) {
        privateRoomWarning.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeSocketConnection();
    initializeColorPicker();
    initializeMusicControls();
    initializeVolumeControls();
    initializeRulesModal();
    initializeLobbySystem();

    if (window.gameColorPicker) {
        window.gameColorPicker.on('color:change', hideWarnings);
    }

    document.addEventListener('click', startBackgroundMusic, { once: true });
    document.addEventListener('keydown', startBackgroundMusic, { once: true });
});

export default {
    updateSoundVolume: (volume) => {
        soundVolume = volume;
        gameModule.updateSoundVolume(volume);
    }
};
