const gameModule = (function () {
    let currentPlayer;
    let players = [];
    let socket;
    let selectedChipCoords = null;
    let gameBoard;
    let myRole;
    let scores = { host: 0, opp: 0 };
    let pendingMoveRequest = false;
    let lastMoveBy = null;
    let soundVolume = 1;

    // Add sound effects
    const sounds = {
        sendMove: new Audio('/sounds/send_move.mp3'),
        enemyMove: new Audio('/sounds/enemy_move.mp3'),
        playerWin: new Audio('/sounds/player_win.mp3'),
        playerLose: new Audio('/sounds/player_lose.mp3')
    };

    function initializeSounds() {
        Object.values(sounds).forEach(sound => {
            sound.volume = soundVolume;
        });
    }

    function updateSoundVolume(volume) {
        soundVolume = volume;
        Object.values(sounds).forEach(sound => {
            sound.volume = soundVolume;
        });
    }

    function playSound(soundName) {
        if (sounds[soundName]) {
            sounds[soundName].volume = soundVolume;
            const playPromise = sounds[soundName].play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {

                });
            }
        } else {

        }
    }

    function createGameBoard() {
        const gameContainer = document.getElementById('gameContainer');
        gameContainer.innerHTML = '';

        const hostDisplay = createPlayerDisplay('left');
        const oppDisplay = createPlayerDisplay('right');

        gameBoard = document.createElement('div');
        gameBoard.id = 'gameBoard';
        gameBoard.style.display = 'grid';
        gameBoard.style.gridTemplateColumns = 'repeat(4, 1fr)';
        gameBoard.style.gap = '10px';
        gameBoard.style.backgroundColor = '#666';
        gameBoard.style.padding = '10px';

        for (let i = 0; i < 16; i++) {
            const cell = document.createElement('div');
            cell.className = 'game-cell';
            cell.dataset.row = Math.floor(i / 4);
            cell.dataset.col = i % 4;
            cell.addEventListener('click', handleCellClick);
            gameBoard.appendChild(cell);
        }

        gameContainer.appendChild(hostDisplay);
        gameContainer.appendChild(gameBoard);
        gameContainer.appendChild(oppDisplay);
    }

    function createPlayerDisplay(side) {
        const display = document.createElement('div');
        display.className = `player-display ${side}`;
        return display;
    }

    function handleCellClick(event) {
        if (!currentPlayer || currentPlayer.role !== myRole) {
            return;
        }

        const clickedCell = event.currentTarget;
        const chip = clickedCell.querySelector('.game-chip');
        const potentialMove = clickedCell.querySelector('.potential-move');

        if (chip && chip.dataset.role === currentPlayer.role) {
            handleChipSelection(clickedCell);
        } else if (potentialMove) {
            handleMove(clickedCell, potentialMove.dataset.isSwap === 'true');
        }
    }

    function handleChipSelection(cell) {
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);

        if (selectedChipCoords && selectedChipCoords.row === row && selectedChipCoords.col === col) {
            socket.emit('deselectChip');
        } else {
            socket.emit('selectChip', { row, col });
        }
    }



    function removePotentialMoves() {
        document.querySelectorAll('.potential-move').forEach(el => el.remove());
    }

    function highlightPotentialMoves(potentialMoves) {
        removePotentialMoves();

        potentialMoves.forEach(move => {
            const targetCell = document.querySelector(`.game-cell[data-row="${move.row}"][data-col="${move.col}"]`);
            if (targetCell) {
                addPotentialMoveIndicator(targetCell, move.isSwap);
            }
        });
    }

    function addPotentialMoveIndicator(cell, isSwap) {
        const indicator = document.createElement('div');
        indicator.className = 'potential-move';
        indicator.dataset.isSwap = isSwap;
        indicator.style.backgroundColor = currentPlayer.color;
        indicator.style.opacity = isSwap ? '0.7' : '0.5';
        cell.appendChild(indicator);
    }

    function handleMove(targetCell, isSwap) {
        if (!selectedChipCoords) {
            return;
        }

        const targetRow = parseInt(targetCell.dataset.row);
        const targetCol = parseInt(targetCell.dataset.col);

        if (isNaN(targetRow) || isNaN(targetCol)) {
            return;
        }

        socket.emit('makeMove', {
            sourceRow: selectedChipCoords.row,
            sourceCol: selectedChipCoords.col,
            targetRow,
            targetCol,
            isSwap
        });

        lastMoveBy = myRole;
    }

    function updateGameState(gameState) {
        if (!gameState || !gameState.board) {
            return;
        }

        const previousPlayer = currentPlayer ? currentPlayer.role : null;

        updateBoard(gameState.board);
        updateCurrentPlayer(gameState.currentPlayer);
        updatePlayerDisplays(gameState.currentPlayer.role);
        updateSelectableChips(gameState);

        if (gameState.selectedChip) {
            selectNewChip(gameState.selectedChip.row, gameState.selectedChip.col);
            if (gameState.potentialMoves) {
                highlightPotentialMoves(gameState.potentialMoves);
            }
        } else {
            deselectChip();
        }

        if (gameState.scores) {
            scores = gameState.scores;
            updateScoreDisplay();
        }

        // Play move sounds only if the game is not won
        if (!gameState.winner) {
            if (lastMoveBy === myRole) {
                playSound('sendMove');
            } else if (previousPlayer !== gameState.currentPlayer.role && lastMoveBy !== myRole) {
                playSound('enemyMove');
            }
        }

        lastMoveBy = null;
    }

    function updateSelectableChips(gameState) {
        const chips = document.querySelectorAll('.game-chip');
        chips.forEach(chip => {
            const row = parseInt(chip.closest('.game-cell').dataset.row);
            const col = parseInt(chip.closest('.game-cell').dataset.col);
            const isCurrentPlayerChip = chip.dataset.role === gameState.currentPlayer.role;
            const isSelected = gameState.selectedChip && gameState.selectedChip.row === row && gameState.selectedChip.col === col;

            if (isSelected) {
                chip.classList.add('selectable');
            } else if (isCurrentPlayerChip && !gameState.selectedChip) {
                chip.classList.add('selectable');
            } else {
                chip.classList.remove('selectable');
            }
        });
    }

    function selectNewChip(row, col) {
        if (selectedChipCoords) {
            const prevChip = document.querySelector(`.game-cell[data-row="${selectedChipCoords.row}"][data-col="${selectedChipCoords.col}"] .game-chip`);
            if (prevChip) {
                prevChip.classList.remove('selectable');
            }
        }

        selectedChipCoords = { row, col };
        const newChip = document.querySelector(`.game-cell[data-row="${row}"][data-col="${col}"] .game-chip`);
        if (newChip) {
            newChip.classList.add('selectable');
        }

        // Remove 'selectable' class from all other chips when one is selected
        document.querySelectorAll('.game-chip').forEach(chip => {
            if (chip !== newChip) {
                chip.classList.remove('selectable');
            }
        });
    }

    function deselectChip() {
        if (selectedChipCoords) {
            const chip = document.querySelector(`.game-cell[data-row="${selectedChipCoords.row}"][data-col="${selectedChipCoords.col}"] .game-chip`);
            if (chip) {
                chip.classList.remove('selectable');
            }
        }
        selectedChipCoords = null;
        removePotentialMoves();

        // Reapply 'selectable' class to current player's chips
        if (currentPlayer) {
            document.querySelectorAll(`.game-chip[data-role="${currentPlayer.role}"]`).forEach(chip => {
                chip.classList.add('selectable');
            });
        }
    }

    function updateBoard(board) {
        board.forEach((row, rowIndex) => {
            row.forEach((cell, colIndex) => {
                const cellElement = document.querySelector(`.game-cell[data-row="${rowIndex}"][data-col="${colIndex}"]`);
                if (cellElement) {
                    updateCell(cellElement, cell);
                }
            });
        });
    }

    function updateCell(cellElement, cellData) {
        cellElement.innerHTML = '';
        if (cellData) {
            const chip = createChipElement(cellData);
            cellElement.appendChild(chip);
        }
    }

    function createChipElement(cellData) {
        const chip = document.createElement('div');
        chip.className = 'game-chip';
        chip.dataset.role = cellData.role;
        const player = players.find(p => p.role === cellData.role);
        if (player) {
            chip.style.backgroundColor = player.color;
            chip.style.borderColor = player.color;
        } else {

        }
        return chip;
    }

    function updateCurrentPlayer(currentPlayerData) {
        currentPlayer = players.find(p => p.role === currentPlayerData.role);
        if (!currentPlayer) {
        }
    }

    function updatePlayerDisplays(currentPlayerRole) {
        players.forEach(player => {
            const display = document.querySelector(`.player-display.${player.role === 'host' ? 'left' : 'right'}`);
            if (display) {
                display.innerHTML = `
                <span class="player-name" style="color: ${player.color};">${player.name}</span>
                <span class="player-score" style="color: ${player.color};"> - ${scores[player.role]}</span>
            `;
                if (player.role === currentPlayerRole) {
                    display.classList.add('current-turn');
                } else {
                    display.classList.remove('current-turn');
                }
            }
        });
    }

    function updateScoreDisplay() {
        const hostDisplay = document.querySelector('.player-display.left');
        const oppDisplay = document.querySelector('.player-display.right');

        if (hostDisplay) {
            const hostScore = hostDisplay.querySelector('.player-score');
            if (hostScore) hostScore.textContent = `${scores.host}`;
        }
        if (oppDisplay) {
            const oppScore = oppDisplay.querySelector('.player-score');
            if (oppScore) oppScore.textContent = `${scores.opp}`;
        }
    }

    function highlightCurrentPlayerChips(currentPlayerRole) {
        const chips = document.querySelectorAll('.game-chip');
        chips.forEach(chip => {
            if (chip.dataset.role === currentPlayerRole) {
                chip.classList.add('selectable');
            } else {
                chip.classList.remove('selectable');
            }
        });
    }

    function highlightSelectedChip(row, col) {
        const selectedChipElement = document.querySelector(`.game-cell[data-row="${row}"][data-col="${col}"] .game-chip`);
        if (selectedChipElement) {
            selectedChipElement.classList.add('selected');
        }
    }

    function showWinNotification(winner) {
        // Play win or lose sound
        if (winner.role === myRole) {
            playSound('playerWin');
        } else {
            playSound('playerLose');
        }

        // Emit a custom event for the win notification
        const winEvent = new CustomEvent('gameWon', { detail: winner });
        document.dispatchEvent(winEvent);
    }

    function getContrastColor(hexColor) {
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }

    function init(player, allPlayers, socketConnection) {
        myRole = player.role;
        players = allPlayers;
        socket = socketConnection;

        createGameBoard();
        initializeSounds();

        socket.on('gameStateUpdate', (gameState) => {
            updateGameState(gameState);
        });

        socket.on('gameWon', ({ winner, gameState }) => {
            updateGameState(gameState);
            showWinNotification(winner);
        });

        socket.on('invalidMove', () => {
            deselectChip();
        });

        socket.on('gameReset', (gameState) => {
            updateGameState(gameState);
            const winNotification = document.querySelector('.win-notification');
            if (winNotification) {
                winNotification.remove();
            }

        });

        socket.emit('requestGameState');
    }

    function handleDisconnection() {
        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
            gameContainer.innerHTML = '';
        }
        selectedChipCoords = null;
    }

    return {
        init: init,
        handleDisconnection: handleDisconnection,
        updateSoundVolume: updateSoundVolume,
        updateGameState: updateGameState  // Add this line to expose the function
    };
})();

export default gameModule;
