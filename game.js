// ============================================================
//  রোবট দাবা — Robot Chess with Ninja Slash Animations
//  Full chess engine, SVG robot pieces, Bangla UI
// ============================================================
(() => {
  'use strict';
  // ======================== CONSTANTS ========================
  const SIZE = 8;
  const W = 'white', B = 'black';
  const BANGLA = {
    king: 'রাজা', queen: 'মন্ত্রী', rook: 'নৌকা',
    bishop: 'গজ', knight: 'ঘোড়া', pawn: 'বোড়ে'
  };
  const PIECE_VAL = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
  const FILES = 'abcdefgh';
  const RANKS = '87654321';
  const BANGLA_NUM = ['১','২','৩','৪','৫','৬','৭','৮'];
  const SETUP = [
    ['rook','knight','bishop','queen','king','bishop','knight','rook'],
    ['pawn','pawn','pawn','pawn','pawn','pawn','pawn','pawn'],
    null, null, null, null,
    ['pawn','pawn','pawn','pawn','pawn','pawn','pawn','pawn'],
    ['rook','knight','bishop','queen','king','bishop','knight','rook']
  ];
  // ======================== AUDIO ========================
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function playSound(type) {
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      if (type === 'move') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'capture') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(1800, now + 0.08);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.25);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        // Second swoosh
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(300, now + 0.1);
        osc2.frequency.exponentialRampToValueAtTime(2000, now + 0.18);
        osc2.frequency.exponentialRampToValueAtTime(80, now + 0.35);
        gain2.gain.setValueAtTime(0.12, now + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.4);
      } else if (type === 'check') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.setValueAtTime(1000, now + 0.1);
        osc.frequency.setValueAtTime(800, now + 0.2);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'gameover') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
      }
    } catch(e) {}
  }
  // ======================== GAME STATE ========================
  let board, turn, selected, validMoves, history, captured, castling, epTarget, gameEnded, kingPos, animating;
  let undoStack = [];
  function initState() {
    board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    for (let r = 0; r < SIZE; r++) {
      const setup = SETUP[r];
      if (!setup) continue;
      for (let c = 0; c < SIZE; c++) {
        board[r][c] = { type: setup[c], color: r < 2 ? B : W, moved: false };
      }
    }
    turn = W;
    selected = null;
    validMoves = [];
    history = [];
    captured = { [W]: [], [B]: [] };
    castling = { [W]: { k: true, q: true }, [B]: { k: true, q: true } };
    epTarget = null;
    gameEnded = false;
    kingPos = { [W]: [7, 4], [B]: [0, 4] };
    animating = false;
    undoStack = [];
  }
  // ======================== ENGINE ========================
  function onBoard(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
  function slidingMoves(r, c, color, dirs) {
    const moves = [];
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc;
      while (onBoard(nr, nc)) {
        if (!board[nr][nc]) { moves.push([nr, nc]); }
        else {
          if (board[nr][nc].color !== color) moves.push([nr, nc]);
          break;
        }
        nr += dr; nc += dc;
      }
    }
    return moves;
  }
  function rawMoves(r, c) {
    const p = board[r][c];
    if (!p) return [];
    const { type, color } = p;
    const mvs = [];
    if (type === 'pawn') {
      const d = color === W ? -1 : 1;
      const start = color === W ? 6 : 1;
      if (onBoard(r+d, c) && !board[r+d][c]) {
        mvs.push([r+d, c]);
        if (r === start && !board[r+2*d][c]) mvs.push([r+2*d, c]);
      }
      for (const dc of [-1, 1]) {
        const nr = r+d, nc = c+dc;
        if (!onBoard(nr, nc)) continue;
        if (board[nr][nc] && board[nr][nc].color !== color) mvs.push([nr, nc]);
        if (epTarget && epTarget[0] === nr && epTarget[1] === nc) mvs.push([nr, nc]);
      }
    } else if (type === 'knight') {
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr = r+dr, nc = c+dc;
        if (onBoard(nr, nc) && (!board[nr][nc] || board[nr][nc].color !== color)) mvs.push([nr, nc]);
      }
    } else if (type === 'bishop') {
      return slidingMoves(r, c, color, [[-1,-1],[-1,1],[1,-1],[1,1]]);
    } else if (type === 'rook') {
      return slidingMoves(r, c, color, [[-1,0],[1,0],[0,-1],[0,1]]);
    } else if (type === 'queen') {
      return slidingMoves(r, c, color, [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]);
    } else if (type === 'king') {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r+dr, nc = c+dc;
        if (onBoard(nr, nc) && (!board[nr][nc] || board[nr][nc].color !== color)) mvs.push([nr, nc]);
      }
      // Castling
      const cr = castling[color];
      const hr = color === W ? 7 : 0;
      if (r === hr && !isInCheck(color)) {
        if (cr.k && !board[hr][5] && !board[hr][6] && board[hr][7]?.type === 'rook' && board[hr][7]?.color === color) {
          if (!sqAttacked(hr, 5, color) && !sqAttacked(hr, 6, color)) mvs.push([hr, 6]);
        }
        if (cr.q && !board[hr][3] && !board[hr][2] && !board[hr][1] && board[hr][0]?.type === 'rook' && board[hr][0]?.color === color) {
          if (!sqAttacked(hr, 3, color) && !sqAttacked(hr, 2, color)) mvs.push([hr, 2]);
        }
      }
    }
    return mvs;
  }
  function sqAttacked(row, col, byColor) {
    const opp = byColor === W ? B : W;
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const p = board[r][c];
      if (!p || p.color !== opp) continue;
      if (p.type === 'pawn') {
        const d = p.color === W ? -1 : 1;
        if (r+d === row && (c-1 === col || c+1 === col)) return true;
      } else if (p.type === 'knight') {
        for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
          if (r+dr === row && c+dc === col) return true;
      } else if (p.type === 'king') {
        if (Math.abs(r-row) <= 1 && Math.abs(c-col) <= 1 && (r !== row || c !== col)) return true;
      } else {
        let dirs;
        if (p.type === 'bishop') dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
        else if (p.type === 'rook') dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        else dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (const [dr, dc] of dirs) {
          let cr = r+dr, cc = c+dc;
          while (onBoard(cr, cc)) {
            if (cr === row && cc === col) return true;
            if (board[cr][cc]) break;
            cr += dr; cc += dc;
          }
        }
      }
    }
    return false;
  }
  function isInCheck(color) {
    const [kr, kc] = kingPos[color];
    return sqAttacked(kr, kc, color);
  }
  function legalMoves(r, c) {
    const p = board[r][c];
    if (!p) return [];
    const raw = rawMoves(r, c);
    const legal = [];
    for (const [tr, tc] of raw) {
      // Simulate
      const savedTo = board[tr][tc];
      const savedFrom = board[r][c];
      let savedEp = null;
      if (p.type === 'pawn' && epTarget && tr === epTarget[0] && tc === epTarget[1]) {
        const cr = p.color === W ? tr+1 : tr-1;
        savedEp = { r: cr, c: tc, piece: board[cr][tc] };
        board[cr][tc] = null;
      }
      board[tr][tc] = p;
      board[r][c] = null;
      const savedKP = [...kingPos[p.color]];
      if (p.type === 'king') kingPos[p.color] = [tr, tc];
      const inCheck = isInCheck(p.color);
      // Restore
      board[r][c] = savedFrom;
      board[tr][tc] = savedTo;
      kingPos[p.color] = savedKP;
      if (savedEp) board[savedEp.r][savedEp.c] = savedEp.piece;
      if (!inCheck) legal.push([tr, tc]);
    }
    return legal;
  }
  function allLegalMoves(color) {
    const all = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      if (board[r][c]?.color === color) {
        for (const m of legalMoves(r, c)) all.push({ from: [r,c], to: m });
      }
    }
    return all;
  }
  // ======================== MAKE MOVE ========================
  function doMove(fr, fc, tr, tc, promo) {
    const p = board[fr][fc];
    const cap = board[tr][tc];
    const info = {
      piece: { ...p }, from: [fr,fc], to: [tr,tc],
      captured: cap ? { ...cap } : null,
      isCapture: !!cap, isCastling: false, isEP: false, isPromo: false,
      prevEP: epTarget, prevCastling: JSON.parse(JSON.stringify(castling)),
      prevKingPos: { ...kingPos, [W]: [...kingPos[W]], [B]: [...kingPos[B]] }
    };
    // En passant capture
    if (p.type === 'pawn' && epTarget && tr === epTarget[0] && tc === epTarget[1]) {
      const cr = p.color === W ? tr+1 : tr-1;
      info.captured = { ...board[cr][tc] };
      info.isEP = true;
      info.isCapture = true;
      info.epCapturePos = [cr, tc];
      captured[board[cr][tc].color].push(board[cr][tc]);
      board[cr][tc] = null;
    }
    if (cap) captured[cap.color].push(cap);
    // Castling
    if (p.type === 'king' && Math.abs(tc - fc) === 2) {
      info.isCastling = true;
      if (tc === 6) { board[fr][5] = board[fr][7]; board[fr][7] = null; }
      else { board[fr][3] = board[fr][0]; board[fr][0] = null; }
    }
    board[tr][tc] = { ...p, moved: true };
    board[fr][fc] = null;
    // Promotion
    if (p.type === 'pawn' && (tr === 0 || tr === 7)) {
      info.isPromo = true;
      board[tr][tc] = { type: promo || 'queen', color: p.color, moved: true };
    }
    if (p.type === 'king') kingPos[p.color] = [tr, tc];
    // Update castling rights
    if (p.type === 'king') { castling[p.color].k = false; castling[p.color].q = false; }
    if (p.type === 'rook') {
      if (fc === 0) castling[p.color].q = false;
      if (fc === 7) castling[p.color].k = false;
    }
    if (cap?.type === 'rook') {
      if (tc === 0) castling[cap.color].q = false;
      if (tc === 7) castling[cap.color].k = false;
    }
    // En passant target
    epTarget = (p.type === 'pawn' && Math.abs(tr - fr) === 2) ? [(fr+tr)/2, fc] : null;
    // Notation
    info.notation = notation(info);
    history.push(info);
    undoStack.push(info);
    turn = turn === W ? B : W;
    // Check post-move status
    const opp = turn;
    if (isInCheck(opp)) {
      if (allLegalMoves(opp).length === 0) {
        info.notation += '#';
      } else {
        info.notation += '+';
      }
    }
    return info;
  }
  function notation(info) {
    if (info.isCastling) return info.to[1] === 6 ? 'O-O' : 'O-O-O';
    let n = '';
    if (info.piece.type !== 'pawn') n += { king:'রা', queen:'ম', rook:'নৌ', bishop:'গ', knight:'ঘ' }[info.piece.type];
    if (info.isCapture && info.piece.type === 'pawn') n += FILES[info.from[1]];
    if (info.isCapture) n += '×';
    n += FILES[info.to[1]] + RANKS[info.to[0]];
    if (info.isPromo) n += '=ম';
    return n;
  }
  // ======================== SVG ROBOT PIECES ========================
  function robotSVG(type, color) {
    const cMain = color === W ? '#00e5ff' : '#ff0050';
    const cDim = color === W ? '#006680' : '#800028';
    const cBody = '#1a1e2e';
    const cMetal = '#2a3040';
    const cEye = color === W ? '#00ff88' : '#ffaa00';
    const cGlow = color === W ? 'rgba(0,229,255,0.4)' : 'rgba(255,0,80,0.4)';
    const svg = (inner, vb = '0 0 45 45') =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${inner}</svg>`;
    const glow = (id, c) =>
      `<defs><filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="1.5"/></filter></defs>`;
    switch (type) {
      case 'pawn': return svg(`
        ${glow('pg', cMain)}
        <!-- Drone body -->
        <ellipse cx="22.5" cy="24" rx="9" ry="7" fill="${cBody}" stroke="${cMain}" stroke-width="1.2"/>
        <ellipse cx="22.5" cy="24" rx="9" ry="7" fill="none" stroke="${cMain}" stroke-width="1" filter="url(#pg)" opacity="0.5"/>
        <!-- Visor -->
        <rect x="17" y="22" width="11" height="3.5" rx="1.5" fill="${cEye}" opacity="0.9"/>
        <rect x="17" y="22" width="11" height="3.5" rx="1.5" fill="none" stroke="${cEye}" stroke-width="0.5" filter="url(#pg)"/>
        <!-- Antenna -->
        <line x1="22.5" y1="17" x2="22.5" y2="12" stroke="${cMain}" stroke-width="1.2"/>
        <circle cx="22.5" cy="11" r="2" fill="${cMain}" opacity="0.8"/>
        <circle cx="22.5" cy="11" r="2" fill="${cMain}" filter="url(#pg)" opacity="0.4"/>
        <!-- Thrusters -->
        <line x1="16" y1="31" x2="14" y2="35" stroke="${cMain}" stroke-width="1" opacity="0.6"/>
        <line x1="22.5" y1="31" x2="22.5" y2="36" stroke="${cMain}" stroke-width="1" opacity="0.6"/>
        <line x1="29" y1="31" x2="31" y2="35" stroke="${cMain}" stroke-width="1" opacity="0.6"/>
        <!-- Hover glow -->
        <ellipse cx="22.5" cy="36" rx="8" ry="2" fill="${cGlow}" filter="url(#pg)"/>
      `);
      case 'knight': return svg(`
        ${glow('kg', cMain)}
        <!-- Body -->
        <path d="M16 34 L16 22 L14 18 L18 12 L24 10 L30 12 L32 16 L30 20 L32 22 L32 34 Z" fill="${cBody}" stroke="${cMain}" stroke-width="1.2"/>
        <path d="M16 34 L16 22 L14 18 L18 12 L24 10 L30 12 L32 16 L30 20 L32 22 L32 34 Z" fill="none" stroke="${cMain}" stroke-width="1" filter="url(#kg)" opacity="0.4"/>
        <!-- Head -->
        <path d="M18 18 L14 14 L18 10 L28 10 L30 14 L26 18 Z" fill="${cMetal}" stroke="${cMain}" stroke-width="0.8"/>
        <!-- Eye -->
        <circle cx="21" cy="14" r="2" fill="${cEye}"/>
        <circle cx="21" cy="14" r="2" fill="${cEye}" filter="url(#kg)" opacity="0.6"/>
        <!-- Legs -->
        <rect x="17" y="30" width="4" height="8" rx="1" fill="${cMetal}" stroke="${cDim}" stroke-width="0.6"/>
        <rect x="26" y="30" width="4" height="8" rx="1" fill="${cMetal}" stroke="${cDim}" stroke-width="0.6"/>
        <!-- Ear/sensor -->
        <line x1="25" y1="10" x2="28" y2="5" stroke="${cMain}" stroke-width="1"/>
        <circle cx="28" cy="5" r="1.5" fill="${cMain}" opacity="0.7"/>
      `);
      case 'bishop': return svg(`
        ${glow('bg', cMain)}
        <!-- Tall body -->
        <path d="M18 38 L16 26 L18 16 L22.5 8 L27 16 L29 26 L27 38 Z" fill="${cBody}" stroke="${cMain}" stroke-width="1.2"/>
        <path d="M18 38 L16 26 L18 16 L22.5 8 L27 16 L29 26 L27 38 Z" fill="none" stroke="${cMain}" stroke-width="1" filter="url(#bg)" opacity="0.4"/>
        <!-- Sensor dish - angled -->
        <ellipse cx="22.5" cy="12" rx="6" ry="3" fill="${cMetal}" stroke="${cMain}" stroke-width="0.8" transform="rotate(-15, 22.5, 12)"/>
        <!-- Eye -->
        <circle cx="22.5" cy="18" r="2.5" fill="${cEye}"/>
        <circle cx="22.5" cy="18" r="2.5" fill="${cEye}" filter="url(#bg)" opacity="0.5"/>
        <!-- Cross mark on body -->
        <line x1="20" y1="24" x2="25" y2="24" stroke="${cMain}" stroke-width="0.8" opacity="0.6"/>
        <line x1="22.5" y1="22" x2="22.5" y2="28" stroke="${cMain}" stroke-width="0.8" opacity="0.6"/>
        <!-- Base -->
        <rect x="16" y="36" width="13" height="3" rx="1" fill="${cMetal}" stroke="${cDim}" stroke-width="0.6"/>
      `);
      case 'rook': return svg(`
        ${glow('rg', cMain)}
        <!-- Tank body -->
        <rect x="12" y="16" width="21" height="20" rx="2" fill="${cBody}" stroke="${cMain}" stroke-width="1.2"/>
        <rect x="12" y="16" width="21" height="20" rx="2" fill="none" stroke="${cMain}" stroke-width="1" filter="url(#rg)" opacity="0.4"/>
        <!-- Turret head -->
        <rect x="15" y="10" width="15" height="8" rx="2" fill="${cMetal}" stroke="${cMain}" stroke-width="1"/>
        <!-- Cannon -->
        <rect x="28" y="12" width="7" height="3" rx="1" fill="${cDim}" stroke="${cMain}" stroke-width="0.8"/>
        <!-- Eyes -->
        <rect x="17" y="12" width="4" height="2.5" rx="1" fill="${cEye}"/>
        <rect x="23" y="12" width="4" height="2.5" rx="1" fill="${cEye}"/>
        <!-- Treads -->
        <rect x="10" y="36" width="25" height="4" rx="2" fill="${cMetal}" stroke="${cDim}" stroke-width="0.8"/>
        <line x1="14" y1="36" x2="14" y2="40" stroke="${cDim}" stroke-width="0.5"/>
        <line x1="18" y1="36" x2="18" y2="40" stroke="${cDim}" stroke-width="0.5"/>
        <line x1="22" y1="36" x2="22" y2="40" stroke="${cDim}" stroke-width="0.5"/>
        <line x1="26" y1="36" x2="26" y2="40" stroke="${cDim}" stroke-width="0.5"/>
        <line x1="30" y1="36" x2="30" y2="40" stroke="${cDim}" stroke-width="0.5"/>
        <!-- Armor plates -->
        <line x1="14" y1="22" x2="31" y2="22" stroke="${cDim}" stroke-width="0.5"/>
        <line x1="14" y1="28" x2="31" y2="28" stroke="${cDim}" stroke-width="0.5"/>
      `);
      case 'queen': return svg(`
        ${glow('qg', cMain)}
        <!-- Sleek body -->
        <path d="M14 36 L16 20 L14 14 L22.5 6 L31 14 L29 20 L31 36 Z" fill="${cBody}" stroke="${cMain}" stroke-width="1.2"/>
        <path d="M14 36 L16 20 L14 14 L22.5 6 L31 14 L29 20 L31 36 Z" fill="none" stroke="${cMain}" stroke-width="1" filter="url(#qg)" opacity="0.4"/>
        <!-- Crown/tiara -->
        <polygon points="17,10 19,4 22.5,8 26,4 28,10" fill="${cMain}" opacity="0.7" stroke="${cMain}" stroke-width="0.5"/>
        <polygon points="17,10 19,4 22.5,8 26,4 28,10" fill="none" stroke="${cMain}" stroke-width="0.8" filter="url(#qg)" opacity="0.5"/>
        <!-- Visor -->
        <path d="M18 16 L27 16 L25 19 L20 19 Z" fill="${cEye}" opacity="0.85"/>
        <!-- Arms -->
        <line x1="14" y1="22" x2="8" y2="18" stroke="${cMain}" stroke-width="1.5"/>
        <circle cx="7" cy="17" r="1.5" fill="${cMain}" opacity="0.6"/>
        <line x1="31" y1="22" x2="37" y2="18" stroke="${cMain}" stroke-width="1.5"/>
        <circle cx="38" cy="17" r="1.5" fill="${cMain}" opacity="0.6"/>
        <!-- Center gem -->
        <circle cx="22.5" cy="26" r="2.5" fill="${cMain}" opacity="0.5"/>
        <circle cx="22.5" cy="26" r="2.5" fill="${cMain}" filter="url(#qg)" opacity="0.3"/>
        <!-- Base -->
        <rect x="14" y="34" width="17" height="3" rx="1.5" fill="${cMetal}" stroke="${cDim}" stroke-width="0.5"/>
      `);
      case 'king': return svg(`
        ${glow('kkg', cMain)}
        <!-- Large mech body -->
        <path d="M12 38 L14 20 L12 16 L16 12 L22.5 14 L29 12 L33 16 L31 20 L33 38 Z" fill="${cBody}" stroke="${cMain}" stroke-width="1.3"/>
        <path d="M12 38 L14 20 L12 16 L16 12 L22.5 14 L29 12 L33 16 L31 20 L33 38 Z" fill="none" stroke="${cMain}" stroke-width="1.2" filter="url(#kkg)" opacity="0.4"/>
        <!-- Crown antenna array -->
        <line x1="18" y1="12" x2="16" y2="5" stroke="${cMain}" stroke-width="1.2"/>
        <line x1="22.5" y1="12" x2="22.5" y2="3" stroke="${cMain}" stroke-width="1.5"/>
        <line x1="27" y1="12" x2="29" y2="5" stroke="${cMain}" stroke-width="1.2"/>
        <circle cx="16" cy="4" r="1.5" fill="${cMain}"/>
        <circle cx="22.5" cy="2" r="2" fill="${cMain}"/>
        <circle cx="29" cy="4" r="1.5" fill="${cMain}"/>
        <circle cx="22.5" cy="2" r="3" fill="${cMain}" filter="url(#kkg)" opacity="0.4"/>
        <!-- Visor -->
        <rect x="16" y="17" width="13" height="4" rx="2" fill="${cEye}" opacity="0.85"/>
        <rect x="16" y="17" width="13" height="4" rx="2" fill="${cEye}" filter="url(#kkg)" opacity="0.3"/>
        <!-- Shoulder armor -->
        <rect x="10" y="18" width="5" height="8" rx="1" fill="${cMetal}" stroke="${cDim}" stroke-width="0.6"/>
        <rect x="30" y="18" width="5" height="8" rx="1" fill="${cMetal}" stroke="${cDim}" stroke-width="0.6"/>
        <!-- Chest core -->
        <circle cx="22.5" cy="28" r="3" fill="${cMain}" opacity="0.4"/>
        <circle cx="22.5" cy="28" r="3" fill="${cMain}" filter="url(#kkg)" opacity="0.3"/>
        <circle cx="22.5" cy="28" r="1.5" fill="${cEye}" opacity="0.9"/>
        <!-- Legs -->
        <rect x="15" y="34" width="5" height="7" rx="1" fill="${cMetal}" stroke="${cDim}" stroke-width="0.5"/>
        <rect x="25" y="34" width="5" height="7" rx="1" fill="${cMetal}" stroke="${cDim}" stroke-width="0.5"/>
        <!-- Base -->
        <rect x="12" y="38" width="21" height="3" rx="1" fill="${cMetal}" stroke="${cDim}" stroke-width="0.5"/>
      `);
    }
    return '';
  }
  // ======================== RENDERING ========================
  const $ = id => document.getElementById(id);
  function renderBoard() {
    const boardEl = $('board');
    boardEl.innerHTML = '';
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const sq = document.createElement('div');
        sq.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
        sq.dataset.row = r;
        sq.dataset.col = c;
        sq.addEventListener('click', () => handleClick(r, c));
        if (board[r][c]) {
          const piece = document.createElement('div');
          piece.className = 'piece';
          piece.innerHTML = robotSVG(board[r][c].type, board[r][c].color);
          sq.appendChild(piece);
        }
        boardEl.appendChild(sq);
      }
    }
    updateHighlights();
  }
  function updateSquare(r, c) {
    const sq = getSquare(r, c);
    if (!sq) return;
    const existing = sq.querySelector('.piece');
    if (existing) existing.remove();
    if (board[r][c]) {
      const piece = document.createElement('div');
      piece.className = 'piece';
      piece.innerHTML = robotSVG(board[r][c].type, board[r][c].color);
      sq.appendChild(piece);
    }
  }
  function getSquare(r, c) {
    return $('board').querySelector(`[data-row="${r}"][data-col="${c}"]`);
  }
  function updateHighlights() {
    // Clear all highlights
    document.querySelectorAll('.square').forEach(sq => {
      sq.classList.remove('selected', 'valid-move', 'valid-capture', 'last-move', 'in-check');
    });
    // Selected
    if (selected) {
      getSquare(selected[0], selected[1])?.classList.add('selected');
      for (const [r, c] of validMoves) {
        const sq = getSquare(r, c);
        if (board[r][c] || (board[selected[0]][selected[1]]?.type === 'pawn' && epTarget && r === epTarget[0] && c === epTarget[1])) {
          sq?.classList.add('valid-capture');
        } else {
          sq?.classList.add('valid-move');
        }
      }
    }
    // Last move
    if (history.length > 0) {
      const last = history[history.length - 1];
      getSquare(last.from[0], last.from[1])?.classList.add('last-move');
      getSquare(last.to[0], last.to[1])?.classList.add('last-move');
    }
    // Check highlight
    if (isInCheck(turn)) {
      const [kr, kc] = kingPos[turn];
      getSquare(kr, kc)?.classList.add('in-check');
    }
  }
  function updateStatus() {
    const statusEl = $('status-text');
    const turnEl = $('turn-text');
    const indEl = $('turn-indicator');
    if (gameEnded) return;
    const color = turn === W ? 'সাদা' : 'কালো';
    turnEl.textContent = `${color}র চাল`;
    indEl.className = turn === B ? 'black' : '';
    if (isInCheck(turn)) {
      if (allLegalMoves(turn).length === 0) {
        const winner = turn === W ? 'কালো' : 'সাদা';
        statusEl.textContent = `চেকমেট! ${winner} জিতেছে! 🏆`;
        statusEl.className = 'checkmate';
        gameEnded = true;
        showGameOver(`${winner} জিতেছে!`, 'চেকমেট! 🏆', '⚔️');
        playSound('gameover');
      } else {
        statusEl.textContent = `শাহ! ${color} রাজা বিপদে! ⚠️`;
        statusEl.className = 'check';
        playSound('check');
      }
    } else if (allLegalMoves(turn).length === 0) {
      statusEl.textContent = 'অচলাবস্থা — ড্র! 🤝';
      statusEl.className = '';
      gameEnded = true;
      showGameOver('ড্র!', 'অচলাবস্থা — কেউ জিতেনি', '🤝');
      playSound('gameover');
    } else {
      statusEl.textContent = `${color}র পালা`;
      statusEl.className = '';
    }
  }
  function updateCapturedPieces() {
    for (const color of [W, B]) {
      const tray = $(`captured-${color}`);
      tray.innerHTML = '';
      // Sort by value descending
      const sorted = [...captured[color]].sort((a, b) => PIECE_VAL[b.type] - PIECE_VAL[a.type]);
      for (const p of sorted) {
        const el = document.createElement('div');
        el.className = 'captured-piece';
        el.innerHTML = robotSVG(p.type, p.color);
        el.title = BANGLA[p.type];
        tray.appendChild(el);
      }
    }
  }
  function updateMoveHistory() {
    const list = $('move-history');
    list.innerHTML = '';
    for (let i = 0; i < history.length; i += 2) {
      const row = document.createElement('div');
      row.className = 'move-row';
      const num = document.createElement('span');
      num.className = 'move-number';
      num.textContent = `${BANGLA_NUM[Math.floor(i/2)] || Math.floor(i/2)+1}.`;
      row.appendChild(num);
      const wMove = document.createElement('span');
      wMove.className = 'move-white';
      wMove.textContent = history[i].notation;
      row.appendChild(wMove);
      if (i + 1 < history.length) {
        const bMove = document.createElement('span');
        bMove.className = 'move-black';
        bMove.textContent = history[i+1].notation;
        row.appendChild(bMove);
      }
      list.appendChild(row);
    }
    list.scrollTop = list.scrollHeight;
  }
  function showGameOver(title, message, icon) {
    $('game-over-icon').textContent = icon;
    $('game-over-title').textContent = title;
    $('game-over-message').textContent = message;
    $('game-over-modal').classList.remove('hidden');
  }
  // ======================== INTERACTION ========================
  function handleClick(r, c) {
    if (gameEnded || animating) return;
    // Resume audio context on user gesture
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const piece = board[r][c];
    if (selected) {
      // Clicking on own piece — reselect
      if (piece && piece.color === turn) {
        selected = [r, c];
        validMoves = legalMoves(r, c);
        updateHighlights();
        return;
      }
      // Check if valid move
      if (validMoves.some(([mr, mc]) => mr === r && mc === c)) {
        executeMove(selected[0], selected[1], r, c);
        return;
      }
      // Deselect
      selected = null;
      validMoves = [];
      updateHighlights();
    } else {
      if (piece && piece.color === turn) {
        selected = [r, c];
        validMoves = legalMoves(r, c);
        updateHighlights();
      }
    }
  }
  function executeMove(fr, fc, tr, tc) {
    const piece = board[fr][fc];
    const isCapture = !!board[tr][tc] || (piece.type === 'pawn' && epTarget && tr === epTarget[0] && tc === epTarget[1]);
    const isPromotion = piece.type === 'pawn' && (tr === 0 || tr === 7);
    if (isPromotion) {
      showPromotion(piece.color, (promoType) => {
        if (isCapture) {
          playCapture(fr, fc, tr, tc, promoType);
        } else {
          finishMove(fr, fc, tr, tc, promoType);
        }
      });
      return;
    }
    if (isCapture) {
      playCapture(fr, fc, tr, tc, null);
    } else {
      finishMove(fr, fc, tr, tc, null);
    }
  }
  function finishMove(fr, fc, tr, tc, promo) {
    const info = doMove(fr, fc, tr, tc, promo);
    selected = null;
    validMoves = [];
    playSound('move');
    // Update board display
    renderBoard();
    updateStatus();
    updateCapturedPieces();
    updateMoveHistory();
  }
  // ======================== PROMOTION ========================
  function showPromotion(color, callback) {
    const modal = $('promotion-modal');
    const grid = $('promotion-choices');
    grid.innerHTML = '';
    for (const type of ['queen', 'rook', 'bishop', 'knight']) {
      const btn = document.createElement('div');
      btn.className = 'promotion-option';
      btn.innerHTML = robotSVG(type, color);
      btn.title = BANGLA[type];
      btn.addEventListener('click', () => {
        modal.classList.add('hidden');
        callback(type);
      });
      grid.appendChild(btn);
    }
    modal.classList.remove('hidden');
  }
  // ======================== NINJA SLASH ANIMATION ========================
  function playCapture(fr, fc, tr, tc, promo) {
    animating = true;
    selected = null;
    validMoves = [];
    updateHighlights();
    // Determine the capture square for animation
    const piece = board[fr][fc];
    let captureR = tr, captureC = tc;
    const isEP = piece.type === 'pawn' && epTarget && tr === epTarget[0] && tc === epTarget[1];
    if (isEP) {
      captureR = piece.color === W ? tr + 1 : tr - 1;
      captureC = tc;
    }
    const sq = getSquare(captureR, captureC);
    if (!sq) {
      finishMove(fr, fc, tr, tc, promo);
      animating = false;
      return;
    }
    const existingPiece = sq.querySelector('.piece');
    playSound('capture');
    // Create slash container
    const container = document.createElement('div');
    container.className = 'slash-container';
    // Slash lines
    for (let i = 1; i <= 3; i++) {
      const line = document.createElement('div');
      line.className = `slash-line slash-${i}`;
      const inner = document.createElement('div');
      inner.className = 'slash-line-inner';
      line.appendChild(inner);
      container.appendChild(line);
    }
    // Flash
    const flash = document.createElement('div');
    flash.className = 'slash-flash';
    container.appendChild(flash);
    sq.appendChild(container);
    // Shatter the piece
    if (existingPiece) {
      existingPiece.classList.add('piece-shatter');
    }
    // Sparks
    createSparks(sq);
    // Board shake
    $('board').classList.add('shake');
    // Screen flash
    $('flash-overlay').classList.add('active');
    // Cleanup and finish
    setTimeout(() => {
      container.remove();
      $('board').classList.remove('shake');
      $('flash-overlay').classList.remove('active');
      if (existingPiece) existingPiece.remove();
      // Remove sparks
      sq.querySelectorAll('.spark').forEach(s => s.remove());
      finishMove(fr, fc, tr, tc, promo);
      animating = false;
    }, 600);
  }
  function createSparks(sq) {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const spark = document.createElement('div');
      spark.className = 'spark';
      const inner = document.createElement('div');
      inner.className = 'spark-inner';
      const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
      const dist = 30 + Math.random() * 40;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist;
      spark.style.left = '50%';
      spark.style.top = '50%';
      spark.style.setProperty('--tx', tx + 'px');
      spark.style.setProperty('--ty', ty + 'px');
      spark.style.animation = `sparkFly ${0.3 + Math.random() * 0.3}s ${Math.random() * 0.1}s ease-out forwards`;
      const colors = ['#39ff14', '#00e5ff', '#fff', '#ffff00'];
      inner.style.background = colors[Math.floor(Math.random() * colors.length)];
      inner.style.boxShadow = `0 0 4px ${inner.style.background}`;
      spark.appendChild(inner);
      sq.appendChild(spark);
    }
  }
  // ======================== UNDO ========================
  function undoMove() {
    if (history.length === 0 || gameEnded || animating) return;
    const info = history.pop();
    undoStack.pop();
    // Restore board
    board[info.from[0]][info.from[1]] = { type: info.piece.type, color: info.piece.color, moved: info.piece.moved };
    board[info.to[0]][info.to[1]] = info.captured && !info.isEP ? { ...info.captured } : null;
    // Restore en passant capture
    if (info.isEP && info.epCapturePos) {
      board[info.epCapturePos[0]][info.epCapturePos[1]] = { ...info.captured };
      board[info.to[0]][info.to[1]] = null;
      // Remove from captured list
      const cap = captured[info.captured.color];
      cap.splice(cap.length - 1, 1);
    } else if (info.captured && !info.isEP) {
      const cap = captured[info.captured.color];
      cap.splice(cap.length - 1, 1);
    }
    // Restore castling
    if (info.isCastling) {
      const r = info.from[0];
      if (info.to[1] === 6) { board[r][7] = board[r][5]; board[r][5] = null; }
      else { board[r][0] = board[r][3]; board[r][3] = null; }
    }
    // Restore state
    castling = info.prevCastling;
    epTarget = info.prevEP;
    kingPos = { [W]: [...info.prevKingPos[W]], [B]: [...info.prevKingPos[B]] };
    turn = info.piece.color;
    gameEnded = false;
    selected = null;
    validMoves = [];
    $('game-over-modal').classList.add('hidden');
    renderBoard();
    updateStatus();
    updateCapturedPieces();
    updateMoveHistory();
  }
  // ======================== INIT ========================
  function start() {
    initState();
    renderBoard();
    updateStatus();
    updateCapturedPieces();
    updateMoveHistory();
    $('game-over-modal').classList.add('hidden');
    $('promotion-modal').classList.add('hidden');
  }
  // Public API
  window.chessGame = {
    restart: () => {
      $('game-over-modal').classList.add('hidden');
      start();
    },
    undo: undoMove
  };
  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
