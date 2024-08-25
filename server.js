const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const COLOR_HUE_THRESHOLD = 25;

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

io.on('connection', (socket) => {

    socket.on('validateColor', ({ roomCode, playerColor }) => {
        const room = rooms.get(roomCode);
        if (room && room.players.length > 0) {
            const otherPlayer = room.players[0];
            const otherPlayerHue = hexToHsl(otherPlayer.color).h;
            const hueDifference = Math.abs(playerColor - otherPlayerHue);
            const isValid = hueDifference > COLOR_HUE_THRESHOLD && hueDifference < (360 - COLOR_HUE_THRESHOLD);
            socket.emit('colorValidation', { valid: isValid });
        } else {
            socket.emit('colorValidation', { valid: true });
        }
    });

    socket.on('joinRoom', ({ roomCode, playerName, playerColor }) => {
        let room = rooms.get(roomCode);

        if (!room) {
            room = {
                roomCode,
                players: [],
                gameState: createInitialGameState(),
                lastWinner: null
            };
            rooms.set(roomCode, room);
            console.log(`Room ${roomCode} created`);
        }

        if (room.players.length >= 2) {
            socket.emit('joinRoomResponse', { success: false, message: 'Room is full' });
            return;
        }

        const role = room.players.length === 0 ? 'host' : 'opp';

        const player = { id: socket.id, name: playerName, color: playerColor, role, score: 0 };
        room.players.push(player);
        socket.join(roomCode);

        console.log(`Player ${playerName} joined room ${roomCode} as ${role}`);
        socket.emit('joinRoomResponse', { success: true, message: 'Joined room successfully', player });

        if (room.players.length === 2) {
            determineStartingPlayer(room);
            io.to(roomCode).emit('gameStart', { players: room.players, gameState: room.gameState });
        }
    });

    socket.on('requestGameState', () => {
        const room = getRoomForSocket(socket);
        if (room) {
            socket.emit('gameStateUpdate', room.gameState);
        }
    });

    socket.on('selectChip', ({ row, col }) => {
        const room = getRoomForSocket(socket);
        if (room && room.gameState.currentPlayer.role === getPlayerRole(socket)) {
            room.gameState.selectedChip = { row, col };
            room.gameState.potentialMoves = calculatePotentialMoves(room.gameState, row, col);
            io.to(room.roomCode).emit('gameStateUpdate', room.gameState);
        }
    });

    socket.on('deselectChip', () => {
        const room = getRoomForSocket(socket);
        if (room && room.gameState.currentPlayer.role === getPlayerRole(socket)) {
            room.gameState.selectedChip = null;
            room.gameState.potentialMoves = null;
            io.to(room.roomCode).emit('gameStateUpdate', room.gameState);
        }
    });

    socket.on('makeMove', ({ sourceRow, sourceCol, targetRow, targetCol, isSwap }) => {
        const room = getRoomForSocket(socket);
        if (room && room.gameState.currentPlayer.role === getPlayerRole(socket)) {
            const gameState = room.gameState;

            if (isValidMove(gameState, sourceRow, sourceCol, targetRow, targetCol, isSwap)) {
                performMove(gameState, sourceRow, sourceCol, targetRow, targetCol, isSwap);

                gameState.selectedChip = null;
                gameState.potentialMoves = null;

                const winner = checkWinCondition(gameState, room);

                if (winner) {
                    const winningPlayer = room.players.find(p => p.role === winner.role);
                    winningPlayer.score += 1;
                    gameState.scores = {
                        host: room.players.find(p => p.role === 'host').score,
                        opp: room.players.find(p => p.role === 'opp').score
                    };
                    gameState.winner = winner;
                    io.to(room.roomCode).emit('gameWon', { winner: winningPlayer, gameState: gameState });
                } else {
                    switchTurn(room);
                    io.to(room.roomCode).emit('gameStateUpdate', gameState);
                }
            } else {
                socket.emit('invalidMove');
            }
        }
    });

    socket.on('playAgain', () => {
        const room = getRoomForSocket(socket);
        if (room) {
            const playerRole = getPlayerRole(socket);

            if (!room.gameState.playAgainVotes) {
                room.gameState.playAgainVotes = { host: false, opp: false };
            }

            room.gameState.playAgainVotes[playerRole] = true;

            console.log(`Player ${playerRole} voted to play again`);

            // Check if all players have voted to play again
            if (Object.values(room.gameState.playAgainVotes).every(vote => vote)) {
                console.log('All players voted to play again. Resetting game.');
                room.gameState = createInitialGameState();
                room.gameState.scores = {
                    host: room.players.find(p => p.role === 'host').score,
                    opp: room.players.find(p => p.role === 'opp').score
                };
                determineStartingPlayer(room);
                io.to(room.roomCode).emit('gameReset', room.gameState);
            } else {
                console.log('Waiting for other player to vote');
                socket.to(room.roomCode).emit('waitingForPlayAgain');
            }
        }
    });

    socket.on('disconnect', () => {
        for (const [roomCode, room] of rooms.entries()) {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const disconnectedPlayer = room.players[playerIndex];
                room.players.splice(playerIndex, 1);
                console.log(`Player ${disconnectedPlayer.name} disconnected from room ${roomCode}`);

                if (room.players.length === 0) {
                    rooms.delete(roomCode);
                    console.log(`Room ${roomCode} deleted as it's empty`);
                } else if (room.players.length === 1) {
                    room.gameState = createInitialGameState();
                    room.players[0].role = 'host';
                    io.to(roomCode).emit('playerDisconnected', { players: room.players, gameState: room.gameState });
                }
                break;
            }
        }
    });
});

function hexToHsl(hex) {
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;

    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
}

function createInitialGameState() {
    const gameState = {
        board: Array(4).fill().map(() => Array(4).fill(null)),
        currentPlayer: { role: 'host' },
        lastSwap: null,
        selectedChip: null,
        potentialMoves: null,
        winner: null,
        playAgainVotes: { host: false, opp: false },
        scores: { host: 0, opp: 0 }
    };
    placeInitialChips(gameState);
    return gameState;
}

function placeInitialChips(gameState) {
    const hostPositions = [[0, 0], [2, 1], [1, 2], [3, 3]];
    const oppPositions = [[3, 0], [1, 1], [2, 2], [0, 3]];

    hostPositions.forEach(([row, col]) => {
        gameState.board[row][col] = { role: 'host' };
    });

    oppPositions.forEach(([row, col]) => {
        gameState.board[row][col] = { role: 'opp' };
    });
}

function getRoomForSocket(socket) {
    return [...rooms.values()].find(room => room.players.some(p => p.id === socket.id));
}

function getPlayerRole(socket) {
    const room = getRoomForSocket(socket);
    if (room) {
        const player = room.players.find(p => p.id === socket.id);
        return player ? player.role : null;
    }
    return null;
}

function calculatePotentialMoves(gameState, row, col) {
    const potentialMoves = [];
    const directions = [
        [-1, 0], [1, 0], [0, -1], [0, 1],
        [-1, -1], [-1, 1], [1, -1], [1, 1]
    ];

    const sourceChip = gameState.board[row][col];
    if (!sourceChip) return potentialMoves;

    const canSwapHere = canSwap(gameState, row, col);

    directions.forEach(([dx, dy]) => {
        const newRow = (row + dx + 4) % 4;
        const newCol = (col + dy + 4) % 4;
        const targetChip = gameState.board[newRow][newCol];

        if (targetChip && targetChip.role !== sourceChip.role) {
            if ((canSwapHere || canSwap(gameState, newRow, newCol)) && (dx === 0 || dy === 0)) {
                if (!isPreviousSwap(gameState, row, col, newRow, newCol)) {
                    potentialMoves.push({ row: newRow, col: newCol, isSwap: true });
                }
            }
        } else if (!targetChip && sourceChip.role === gameState.currentPlayer.role) {
            potentialMoves.push({ row: newRow, col: newCol, isSwap: false });
        }
    });

    return potentialMoves;
}

function canSwap(gameState, row, col) {
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let adjacentEnemyCount = 0;
    const chip = gameState.board[row][col];

    if (!chip) return false;

    for (const [dx, dy] of directions) {
        const newRow = (row + dx + 4) % 4;
        const newCol = (col + dy + 4) % 4;
        const adjacentChip = gameState.board[newRow][newCol];

        if (adjacentChip && adjacentChip.role !== chip.role) {
            adjacentEnemyCount++;
        }
    }

    return adjacentEnemyCount >= 2;
}

function isPreviousSwap(gameState, sourceRow, sourceCol, targetRow, targetCol) {
    if (gameState.lastSwap &&
        gameState.lastSwap.currentPlayerRole !== gameState.currentPlayer.role) {
        return (
            (gameState.lastSwap.sourceRow === targetRow && gameState.lastSwap.sourceCol === targetCol &&
                gameState.lastSwap.targetRow === sourceRow && gameState.lastSwap.targetCol === sourceCol) ||
            (gameState.lastSwap.sourceRow === sourceRow && gameState.lastSwap.sourceCol === sourceCol &&
                gameState.lastSwap.targetRow === targetRow && gameState.lastSwap.targetCol === targetCol)
        );
    }
    return false;
}

function isValidMove(gameState, sourceRow, sourceCol, targetRow, targetCol, isSwap) {
    const sourceChip = gameState.board[sourceRow][sourceCol];
    if (!sourceChip) {
        return false;
    }

    const rowDiff = (targetRow - sourceRow + 4) % 4;
    const colDiff = (targetCol - sourceCol + 4) % 4;

    const isAdjacentMove = (rowDiff <= 1 || rowDiff === 3) && (colDiff <= 1 || colDiff === 3) && !(rowDiff === 0 && colDiff === 0);

    if (!isAdjacentMove) {
        return false;
    }

    const targetChip = gameState.board[targetRow][targetCol];

    if (isSwap) {
        if (!targetChip || targetChip.role === sourceChip.role) {
            return false;
        }

        if (rowDiff !== 0 && colDiff !== 0) {
            return false;
        }

        if (!canSwap(gameState, sourceRow, sourceCol) && !canSwap(gameState, targetRow, targetCol)) {
            return false;
        }

        if (isPreviousSwap(gameState, sourceRow, sourceCol, targetRow, targetCol)) {
            return false;
        }
    } else {
        if (sourceChip.role !== gameState.currentPlayer.role) {
            return false;
        }
        if (targetChip) {
            return false;
        }
    }

    return true;
}

function switchTurn(room) {
    room.gameState.currentPlayer = room.players.find(p => p.role !== room.gameState.currentPlayer.role);
    room.gameState.selectedChip = null;
    room.gameState.potentialMoves = null;
}

function checkWinCondition(gameState, room) {
    const directions = [
        [[0, 1], [0, 2], [0, 3]],
        [[1, 0], [2, 0], [3, 0]],
        [[1, 1], [2, 2], [3, 3]],
        [[1, -1], [2, -2], [3, -3]]
    ];

    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            const chip = gameState.board[row][col];
            if (chip) {
                for (const direction of directions) {
                    if (direction.every(([dx, dy]) => {
                        const newRow = (row + dx + 4) % 4;
                        const newCol = (col + dy + 4) % 4;
                        return gameState.board[newRow][newCol] && gameState.board[newRow][newCol].role === chip.role;
                    })) {
                        room.lastWinner = chip.role;
                        return chip;
                    }
                }
            }
        }
    }
    return null;
}

function performMove(gameState, sourceRow, sourceCol, targetRow, targetCol, isSwap) {
    if (isSwap) {
        const temp = gameState.board[sourceRow][sourceCol];
        gameState.board[sourceRow][sourceCol] = gameState.board[targetRow][targetCol];
        gameState.board[targetRow][targetCol] = temp;

        gameState.lastSwap = {
            sourceRow: sourceRow,
            sourceCol: sourceCol,
            targetRow: targetRow,
            targetCol: targetCol,
            currentPlayerRole: gameState.currentPlayer.role
        };
    } else {
        gameState.board[targetRow][targetCol] = gameState.board[sourceRow][sourceCol];
        gameState.board[sourceRow][sourceCol] = null;
        gameState.lastSwap = null;
    }
}

function determineStartingPlayer(room) {
    if (room.lastWinner) {
        room.gameState.currentPlayer = { role: room.lastWinner === 'host' ? 'opp' : 'host' };
    } else {
        room.gameState.currentPlayer = { role: 'host' };
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});