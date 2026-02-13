/**
 * CHECKERS GAME ENGINE
 * Implements Draughts rules with Minimax AI
 */

const BOARD_SIZE = 8;
const P1 = 1; // Blue
const P2 = 2; // Red
const K1 = 3; // King P1
const K2 = 4; // King P2

class Game {
    constructor() {
        this.board = [];
        this.turn = P1;
        this.selectedSquare = null;
        this.validMoves = [];
        this.isAiEnabled = false;
        this.aiDifficulty = 'hard';
        this.mustJump = false;
        this.gameOver = false;
        this.lastMove = null;
        this.continuingJump = null; // Piece that must continue jumping

        this.initAudio();
        this.init();
    }

    initAudio() {
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch(e) {
            console.warn("Audio Context not supported");
        }
    }

    playSound(type) {
        if (!this.audioCtx || this.audioCtx.state === 'suspended') {
            // Start audio context on user interaction if needed
            if (this.audioCtx) this.audioCtx.resume();
            return;
        }
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        
        if (type === 'move') {
            osc.frequency.setValueAtTime(400, this.audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(300, this.audioCtx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);
            osc.start();
            osc.stop(this.audioCtx.currentTime + 0.1);
        } else if (type === 'capture') {
            osc.frequency.setValueAtTime(200, this.audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, this.audioCtx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.15);
            osc.start();
            osc.stop(this.audioCtx.currentTime + 0.15);
        } else if (type === 'king') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(500, this.audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, this.audioCtx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.05, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.3);
            osc.start();
            osc.stop(this.audioCtx.currentTime + 0.3);
        }
    }

    init() {
        this.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));
        
        // Set up pieces
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if ((r + c) % 2 !== 0) {
                    if (r < 3) this.board[r][c] = P2;
                    else if (r > 4) this.board[r][c] = P1;
                }
            }
        }
        
        this.render();
        this.checkJumps();
    }

    setMode(vsAi) {
        this.isAiEnabled = vsAi;
        document.getElementById('mode-display').textContent = vsAi ? 'VS AI' : 'Local PvP';
        document.getElementById('difficulty').style.display = vsAi ? 'block' : 'none';
        document.getElementById('toggle-mode').textContent = vsAi ? 'PvP Mode' : 'VS AI';
        this.reset();
    }

    reset() {
        this.turn = P1;
        this.selectedSquare = null;
        this.validMoves = [];
        this.mustJump = false;
        this.gameOver = false;
        this.lastMove = null;
        this.continuingJump = null;
        this.init();
        this.updateUI();
        document.getElementById('game-over').style.display = 'none';
    }

    updateUI() {
        const turnDisplay = document.getElementById('turn-display');
        if (this.turn === P1) {
            turnDisplay.textContent = "Player 1";
            turnDisplay.style.color = "var(--player-1)";
        } else {
            turnDisplay.textContent = this.isAiEnabled ? "AI Thinking..." : "Player 2";
            turnDisplay.style.color = "var(--player-2)";
        }
    }

    render() {
        const boardEl = document.getElementById('board');
        boardEl.innerHTML = '';

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const square = document.createElement('div');
                square.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
                square.dataset.r = r;
                square.dataset.c = c;
                
                // Highlight valid moves
                const move = this.validMoves.find(m => m.r === r && m.c === c);
                if (move) {
                    square.classList.add('highlight-valid');
                    if (move.jump) square.classList.add('highlight-capture');
                }

                // Last move highlight
                if (this.lastMove && ((this.lastMove.from.r === r && this.lastMove.from.c === c) || (this.lastMove.to.r === r && this.lastMove.to.c === c))) {
                    square.classList.add('last-move');
                }

                const pieceVal = this.board[r][c];
                if (pieceVal !== 0) {
                    const piece = document.createElement('div');
                    piece.className = `piece ${pieceVal <= 2 ? 'p' + pieceVal : 'p' + (pieceVal - 2) + ' king'}`;
                    if (this.selectedSquare && this.selectedSquare.r === r && this.selectedSquare.c === c) {
                        piece.classList.add('selected');
                    }
                    square.appendChild(piece);
                }

                square.onclick = () => this.handleSquareClick(r, c);
                boardEl.appendChild(square);
            }
        }
    }

    handleSquareClick(r, c) {
        if (this.gameOver) return;
        if (this.isAiEnabled && this.turn === P2) return;

        const piece = this.board[r][c];

        // Select a piece
        if (piece !== 0 && (piece === this.turn || piece === this.turn + 2)) {
            // Forced jump rule: only pieces that can jump are selectable
            if (this.continuingJump) {
                if (r !== this.continuingJump.r || c !== this.continuingJump.c) return;
            } else if (this.mustJump) {
                const jumps = this.getValidMoves(r, c).filter(m => m.jump);
                if (jumps.length === 0) return;
            }

            this.selectedSquare = { r, c };
            this.validMoves = this.getValidMoves(r, c);
            // If others must jump, only keep jumps
            if (this.mustJump) {
                this.validMoves = this.validMoves.filter(m => m.jump);
            }
            this.render();
            return;
        }

        // Make a move
        const move = this.validMoves.find(m => m.r === r && m.c === c);
        if (this.selectedSquare && move) {
            this.executeMove(this.selectedSquare, move);
        } else {
            this.selectedSquare = null;
            this.validMoves = [];
            this.render();
        }
    }

    executeMove(from, to) {
        const piece = this.board[from.r][from.c];
        this.board[to.r][to.c] = piece;
        this.board[from.r][from.c] = 0;
        this.lastMove = { from, to };

        let captured = false;
        if (to.jump) {
            const midR = (from.r + to.r) / 2;
            const midC = (from.c + to.c) / 2;
            this.board[midR][midC] = 0;
            captured = true;
            this.playSound('capture');
        } else {
            this.playSound('move');
        }

        // King promotion
        let promoted = false;
        if (this.turn === P1 && to.r === 0 && piece === P1) {
            this.board[to.r][to.c] = K1;
            promoted = true;
        } else if (this.turn === P2 && to.r === BOARD_SIZE - 1 && piece === P2) {
            this.board[to.r][to.c] = K2;
            promoted = true;
        }
        
        if (promoted) this.playSound('king');

        // Check for multi-jump
        if (captured && !promoted) {
            const nextJumps = this.getValidMoves(to.r, to.c).filter(m => m.jump);
            if (nextJumps.length > 0) {
                this.continuingJump = { r: to.r, c: to.c };
                this.selectedSquare = this.continuingJump;
                this.validMoves = nextJumps;
                this.render();
                return;
            }
        }

        this.continuingJump = null;
        this.selectedSquare = null;
        this.validMoves = [];
        this.turn = this.turn === P1 ? P2 : P1;
        
        this.checkGameState();
        this.render();
        this.updateUI();

        if (!this.gameOver && this.isAiEnabled && this.turn === P2) {
            setTimeout(() => this.aiMove(), 600 + Math.random() * 400);
        }
    }

    getValidMoves(r, c, board = this.board) {
        const piece = board[r][c];
        if (piece === 0) return [];

        const moves = [];
        const isKing = piece >= 3;
        const player = (piece === P1 || piece === K1) ? P1 : P2;

        // Directions: P1 moves up (-1), P2 moves down (+1)
        let directions = [];
        if (isKing) directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        else directions = (player === P1) ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];

        for (const [dr, dc] of directions) {
            // Normal move
            const nr = r + dr;
            const nc = c + dc;
            if (this.inBounds(nr, nc) && board[nr][nc] === 0) {
                moves.push({ r: nr, c: nc, jump: false });
            }

            // Jump move
            const jr = r + (dr * 2);
            const jc = c + (dc * 2);
            if (this.inBounds(jr, jc) && board[jr][jc] === 0) {
                const midPiece = board[nr][nc];
                if (midPiece !== 0 && !this.isOwnPiece(player, midPiece)) {
                    moves.push({ r: jr, c: jc, jump: true });
                }
            }
        }

        return moves;
    }

    inBounds(r, c) {
        return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
    }

    isOwnPiece(player, pieceVal) {
        if (player === P1) return pieceVal === P1 || pieceVal === K1;
        return pieceVal === P2 || pieceVal === K2;
    }

    checkJumps() {
        this.mustJump = false;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const p = this.board[r][c];
                if (p !== 0 && (p === this.turn || p === this.turn + 2)) {
                    if (this.getValidMoves(r, c).some(m => m.jump)) {
                        this.mustJump = true;
                        return;
                    }
                }
            }
        }
    }

    checkGameState() {
        this.checkJumps();
        
        // Check if current player has any moves
        let hasMoves = false;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const p = this.board[r][c];
                if (p !== 0 && (p === this.turn || p === this.turn + 2)) {
                    const moves = this.getValidMoves(r, c);
                    const finalMoves = this.mustJump ? moves.filter(m => m.jump) : moves;
                    if (finalMoves.length > 0) {
                        hasMoves = true;
                        break;
                    }
                }
            }
            if (hasMoves) break;
        }

        if (!hasMoves) {
            this.gameOver = true;
            this.showWinner(this.turn === P1 ? "Red Wins!" : "Blue Wins!");
        }
    }

    showWinner(message) {
        const overlay = document.getElementById('game-over');
        const text = document.getElementById('winner-text');
        text.textContent = message;
        text.style.color = message.includes("Blue") ? "var(--player-1)" : "var(--player-2)";
        overlay.style.display = 'flex';
    }

    // AI LOGIC
    aiMove() {
        if (this.gameOver) return;
        
        const difficulty = document.getElementById('difficulty').value;
        let moveData;

        if (difficulty === 'easy') {
            moveData = this.getRandomAiMove();
        } else {
            moveData = this.getBestAiMove();
        }

        if (moveData) {
            this.executeMove(moveData.from, moveData.to);
        }
    }

    getAllValidMoves(player, board) {
        let allMoves = [];
        let hasJump = false;

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const p = board[r][c];
                if (p !== 0 && (p === player || p === player + 2)) {
                    const moves = this.getValidMoves(r, c, board);
                    for (const m of moves) {
                        if (m.jump) hasJump = true;
                        allMoves.push({ from: { r, c }, to: m });
                    }
                }
            }
        }

        if (hasJump) {
            return allMoves.filter(m => m.to.jump);
        }
        return allMoves;
    }

    getRandomAiMove() {
        const moves = this.getAllValidMoves(P2, this.board);
        if (moves.length === 0) return null;
        return moves[Math.floor(Math.random() * moves.length)];
    }

    getBestAiMove() {
        const depth = 4;
        let bestMove = null;
        let bestValue = -Infinity;

        const moves = this.getAllValidMoves(P2, this.board);
        if (moves.length === 0) return null;
        if (moves.length === 1) return moves[0];

        for (const move of moves) {
            const tempBoard = this.board.map(row => [...row]);
            this.simulateMove(tempBoard, move.from, move.to, P2);
            
            const value = this.minimax(tempBoard, depth - 1, -Infinity, Infinity, false);
            if (value > bestValue) {
                bestValue = value;
                bestMove = move;
            }
        }
        return bestMove;
    }

    simulateMove(board, from, to, player) {
        const piece = board[from.r][from.c];
        board[to.r][to.c] = piece;
        board[from.r][from.c] = 0;

        if (to.jump) {
            board[(from.r + to.r) / 2][(from.c + to.c) / 2] = 0;
        }

        if (player === P1 && to.r === 0 && piece === P1) board[to.r][to.c] = K1;
        if (player === P2 && to.r === BOARD_SIZE - 1 && piece === P2) board[to.r][to.c] = K2;
    }

    evaluate(board) {
        let score = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const p = board[r][c];
                if (p === P1) score -= 10;
                else if (p === K1) score -= 30;
                else if (p === P2) score += 10;
                else if (p === K2) score += 30;
                
                // Positional bonus
                if (p !== 0) {
                    const bonus = (r === 0 || r === 7 || c === 0 || c === 7) ? 2 : 5;
                    score += (p === P2 || p === K2) ? bonus : -bonus;
                }
            }
        }
        return score;
    }

    minimax(board, depth, alpha, beta, isMaximizing) {
        if (depth === 0) return this.evaluate(board);

        const currentP = isMaximizing ? P2 : P1;
        const moves = this.getAllValidMoves(currentP, board);

        if (moves.length === 0) return isMaximizing ? -1000 : 1000;

        if (isMaximizing) {
            let maxEval = -Infinity;
            for (const move of moves) {
                const nextBoard = board.map(row => [...row]);
                this.simulateMove(nextBoard, move.from, move.to, P2);
                const ev = this.minimax(nextBoard, depth - 1, alpha, beta, false);
                maxEval = Math.max(maxEval, ev);
                alpha = Math.max(alpha, ev);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (const move of moves) {
                const nextBoard = board.map(row => [...row]);
                this.simulateMove(nextBoard, move.from, move.to, P1);
                const ev = this.minimax(nextBoard, depth - 1, alpha, beta, true);
                minEval = Math.min(minEval, ev);
                beta = Math.min(beta, ev);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }
}

// Init Game
const game = new Game();

document.getElementById('reset-game').onclick = () => game.reset();
document.getElementById('play-again').onclick = () => game.reset();
document.getElementById('toggle-mode').onclick = () => {
    const current = game.isAiEnabled;
    game.setMode(!current);
};
