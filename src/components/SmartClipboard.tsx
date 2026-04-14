import { useRef, useState, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';

const PLAYER_RADIUS = 20;

interface Player {
    id: string;
    x: number;
    y: number;
    path: { x: number; y: number; isScreen?: boolean }[];
    actionType: 'MOVE' | 'SCREEN';
    isDefense?: boolean;
    attachedTo?: string | null;
}

export default function SmartClipboard() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Initialize 5 players in a standard "3-out 2-in" formation 
    const [players, setPlayers] = useState<Player[]>([
        { id: 'PG', x: 400, y: 480, path: [], actionType: 'MOVE' },
        { id: 'SG', x: 150, y: 400, path: [], actionType: 'MOVE' },
        { id: 'SF', x: 650, y: 400, path: [], actionType: 'MOVE' },
        { id: 'PF', x: 250, y: 150, path: [], actionType: 'MOVE' },
        { id: 'C', x: 550, y: 150, path: [], actionType: 'MOVE' },
        { id: 'BALL', x: 400, y: 440, path: [], actionType: 'MOVE', attachedTo: null }, // Track possession
    ]);

    const [defenders, setDefenders] = useState<Player[]>([
        { id: 'D1', x: 400, y: 380, path: [], actionType: 'MOVE', isDefense: true },
        { id: 'D2', x: 200, y: 350, path: [], actionType: 'MOVE', isDefense: true },
        { id: 'D3', x: 600, y: 350, path: [], actionType: 'MOVE', isDefense: true },
        { id: 'D4', x: 300, y: 150, path: [], actionType: 'MOVE', isDefense: true },
        { id: 'D5', x: 500, y: 150, path: [], actionType: 'MOVE', isDefense: true },
    ]);

    const [defenseType, setDefenseType] = useState<'MAN' | 'ZONE_23' | 'ZONE_32'>('MAN');
    const [doubleTeamTarget, setDoubleTeamTarget] = useState<string | null>(null);

    const [activePlayerIndex, setActivePlayerIndex] = useState<number | null>(null);
    const [activeDefenderIndex, setActiveDefenderIndex] = useState<number | null>(null);
    const [analysis, setAnalysis] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAnimating, setIsAnimating] = useState(false);
    const [animationPlayers, setAnimationPlayers] = useState<any[]>([]);
    const animationRef = useRef<number | null>(null);
    const [playerPoints, setPlayerPoints] = useState<Record<string, number>>({});
    const [hotHand, setHotHand] = useState<string | null>(null);
    const [playDesignFeedback, setPlayDesignFeedback] = useState<string | null>(null);
    const [jerseyNumbers, setJerseyNumbers] = useState<Record<string, string>>({});

    // Formation positions helper
    const getFormationPositions = (type: string): Player[] => {
        if (type === 'ZONE_23') {
            return [
                { id: 'D1', x: 330, y: 230, path: [], actionType: 'MOVE', isDefense: true }, // Top Left
                { id: 'D2', x: 470, y: 230, path: [], actionType: 'MOVE', isDefense: true }, // Top Right
                { id: 'D3', x: 180, y: 150, path: [], actionType: 'MOVE', isDefense: true }, // Bottom Left
                { id: 'D4', x: 620, y: 150, path: [], actionType: 'MOVE', isDefense: true }, // Bottom Right
                { id: 'D5', x: 400, y: 110, path: [], actionType: 'MOVE', isDefense: true }, // Paint
            ];
        } else if (type === 'ZONE_32') {
            return [
                { id: 'D1', x: 400, y: 280, path: [], actionType: 'MOVE', isDefense: true }, // Top Point
                { id: 'D2', x: 230, y: 240, path: [], actionType: 'MOVE', isDefense: true }, // Left Wing
                { id: 'D3', x: 570, y: 240, path: [], actionType: 'MOVE', isDefense: true }, // Right Wing
                { id: 'D4', x: 340, y: 130, path: [], actionType: 'MOVE', isDefense: true }, // Left Block
                { id: 'D5', x: 460, y: 130, path: [], actionType: 'MOVE', isDefense: true }, // Right Block
            ];
        } else {
            return [
                { id: 'D1', x: 400, y: 380, path: [], actionType: 'MOVE', isDefense: true },
                { id: 'D2', x: 200, y: 350, path: [], actionType: 'MOVE', isDefense: true },
                { id: 'D3', x: 600, y: 350, path: [], actionType: 'MOVE', isDefense: true },
                { id: 'D4', x: 300, y: 150, path: [], actionType: 'MOVE', isDefense: true },
                { id: 'D5', x: 500, y: 150, path: [], actionType: 'MOVE', isDefense: true },
            ];
        }
    };

    // Auto-setup formations when defense type changes
    useEffect(() => {
        setDefenders(getFormationPositions(defenseType));
    }, [defenseType]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;

        // Ensure all players are rendered during animation
        let drawList: any[] = [];
        if (isAnimating) {
            // Start with base players/defenders then override with animation frames
            const baseList = [...players, ...defenders];
            drawList = baseList.map(base => {
                const anim = animationPlayers.find(a => a.id === base.id);
                return anim ? { ...base, ...anim } : base;
            });
        } else {
            drawList = [...players, ...defenders];
        }

        // 1. Clear and Draw Court
        drawCourt(ctx);

        // 2. Draw all Ghost Trails
        players.forEach(p => {
            if (p.path.length > 1) drawTrail(ctx, p.path, p.id === 'BALL', p.actionType === 'SCREEN');
        });

        // 3. Draw all Players (Regular or Animated)
        drawList.forEach(p => drawPlayer(ctx, p));

    }, [players, defenders, isAnimating, animationPlayers]);

    const drawCourt = (ctx: CanvasRenderingContext2D) => {
        ctx.clearRect(0, 0, 800, 600);
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 2;
        ctx.strokeRect(50, 50, 700, 500); // Boundary 
        ctx.strokeRect(300, 50, 200, 190); // Key 
        ctx.beginPath();
        ctx.moveTo(100, 50);
        ctx.lineTo(100, 145);
        ctx.arc(400, 75, 307, Math.PI - 0.23, 0.23, true);
        ctx.lineTo(700, 50);
        ctx.stroke();
    };

    const drawTrail = (ctx: CanvasRenderingContext2D, path: { x: number; y: number; isScreen?: boolean }[], isBall: boolean, isWholePlayerScreen: boolean) => {
        if (path.length < 1) return;

        ctx.beginPath();
        ctx.setLineDash(isBall ? [5, 5] : []);
        ctx.strokeStyle = isBall ? "rgba(249, 115, 22, 0.6)" : "rgba(148, 163, 184, 0.5)";
        ctx.lineWidth = 3;

        path.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw individual T-bars for localized screens
        path.forEach((p, i) => {
            if (p.isScreen || (i === path.length - 1 && isWholePlayerScreen)) {
                // Calculate direction for the bar (perpendicular to path)
                let angle = 0;
                if (i > 0) {
                    angle = Math.atan2(p.y - path[i - 1].y, p.x - path[i - 1].x);
                } else if (path.length > 1) {
                    angle = Math.atan2(path[1].y - p.y, path[1].x - p.x);
                }

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(angle + Math.PI / 2);

                // Screen Bar (Wider and On Top)
                ctx.strokeStyle = "#1e293b";
                ctx.lineWidth = 6;
                ctx.beginPath();
                ctx.moveTo(-PLAYER_RADIUS * 1.5, 0);
                ctx.lineTo(PLAYER_RADIUS * 1.5, 0);
                ctx.stroke();

                ctx.strokeStyle = "white";
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.restore();
            }
        });
    };

    const drawPlayer = (ctx: CanvasRenderingContext2D, player: any) => {
        const isBall = player.id === 'BALL';
        const isDefense = player.isDefense || player.id.startsWith('D');
        const radius = isBall ? 10 : PLAYER_RADIUS;

        ctx.beginPath();
        ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);

        if (isBall) {
            ctx.fillStyle = "#f97316"; // Orange
        } else if (isDefense) {
            ctx.fillStyle = "#ef4444"; // Red
        } else {
            ctx.fillStyle = "#3b82f6"; // Blue
        }

        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();

        if (!isBall) {
            ctx.fillStyle = "white";
            ctx.font = "bold 12px Sans-Serif";
            ctx.textAlign = "center";
            const jerseyNum = jerseyNumbers[player.id];
            const displayText = jerseyNum ? `#${jerseyNum}` : player.id;
            ctx.fillText(displayText, player.x, player.y + 5);
        }

        // Draw Screen T-Bar during animation if active
        if (player.isScreenActive) {
            ctx.save();
            ctx.translate(player.x, player.y);
            ctx.strokeStyle = "rgba(15, 23, 42, 0.8)";
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(-PLAYER_RADIUS * 1.5, 0);
            ctx.lineTo(PLAYER_RADIUS * 1.5, 0);
            ctx.stroke();
            ctx.restore();
        }
    };

    const getPlayDesignFeedback = () => {
        const feedback: string[] = [];

        // Check if any plays are drawn
        const activePlayers = players.filter(p => p.path.length > 1);
        if (activePlayers.length === 0) {
            setPlayDesignFeedback("No play paths detected. Draw some player movements first!");
            return;
        }

        // Analyze spacing between players
        const playerPositions = activePlayers.map(p => ({ id: p.id, x: p.x, y: p.y }));
        for (let i = 0; i < playerPositions.length; i++) {
            for (let j = i + 1; j < playerPositions.length; j++) {
                const dist = Math.sqrt(
                    Math.pow(playerPositions[i].x - playerPositions[j].x, 2) +
                    Math.pow(playerPositions[i].y - playerPositions[j].y, 2)
                );
                if (dist < 60) {
                    feedback.push(`⚠️ ${playerPositions[i].id} and ${playerPositions[j].id} are too close (${Math.round(dist)}px). Increase spacing for better ball movement.`);
                }
            }
        }

        // Check for screening opportunities
        const screeners = activePlayers.filter(p => p.actionType === 'SCREEN' || p.path.some(point => point.isScreen));
        if (screeners.length > 0) {
            feedback.push(`✅ Found ${screeners.length} screening action(s) from ${screeners.map(s => s.id).join(', ')}. Good for creating driving lanes!`);
        } else {
            feedback.push("💡 Consider adding screens to create driving opportunities for cutters.");
        }

        // Analyze path complexity
        activePlayers.forEach(player => {
            if (player.path.length > 8) {
                feedback.push(`🔄 ${player.id}'s path is quite complex (${player.path.length} points). Consider simplifying for better execution.`);
            } else if (player.path.length <= 3) {
                feedback.push(`📏 ${player.id}'s movement is very basic. Add more detailed cutting routes for realism.`);
            }
        });

        // Check ball movement
        const ballPlayer = players.find(p => p.id === 'BALL');
        if (ballPlayer && ballPlayer.path.length > 2) {
            feedback.push("🏀 Ball movement detected. Ensure passes are timed well with defensive rotations.");
        }

        // Court position analysis
        activePlayers.forEach(player => {
            const endPos = player.path[player.path.length - 1];
            if (endPos.y < 150) {
                feedback.push(`🎯 ${player.id} ends up high on the court. Good for spacing, but ensure defensive help can rotate.`);
            } else if (endPos.y > 450) {
                feedback.push(`🛡️ ${player.id} stays low. Consider moving higher to stretch the defense.`);
            }
        });

        // Hot hand consideration
        if (hotHand) {
            const hotPlayer = activePlayers.find(p => p.id === hotHand);
            if (hotPlayer) {
                feedback.push(`🔥 ${hotHand} has the hot hand! Consider designing the play to get them more touches.`);
            }
        }

        // Points analysis
        const highScorers = Object.entries(playerPoints).filter(([_, points]) => points > 10);
        if (highScorers.length > 0) {
            feedback.push(`📊 High scorers: ${highScorers.map(([id, pts]) => `${id}(${pts}pts)`).join(', ')}. Balance scoring opportunities.`);
        }

        // Ball possession check
        const ballEntity = players.find(p => p.id === 'BALL');
        const ballAttached = players.some(p => p.id !== 'BALL' && ballEntity?.attachedTo === p.id);
        if (ballEntity && ballEntity.path.length >= 2 && !ballAttached) {
            feedback.push(`🏀⚠️ Ball is not attached to any player! Click on a player near the ball to assign possession, or the system will auto-assign to the nearest player.`);
        } else if (ballAttached) {
            const playerWithBall = players.find(p => ballEntity?.attachedTo === p.id);
            if (playerWithBall) {
                feedback.push(`🏀 Ball possession: ${playerWithBall.id} has the ball.`);
            }
        }

        // Jersey numbers feedback
        const playersWithJerseys = Object.entries(jerseyNumbers).filter(([_, num]) => num && num.trim());
        if (playersWithJerseys.length > 0) {
            feedback.push(`🏷️ Jersey numbers set: ${playersWithJerseys.map(([id, num]) => `${id}#${num}`).join(', ')}. Great for team identification!`);
        }

        if (feedback.length === 0) {
            feedback.push("✅ Play design looks solid! All players have good spacing and movement patterns.");
        }

        setPlayDesignFeedback(feedback.join('\n\n'));
    };

    const exportPlay = async () => {
        const playData = players.map(player => {
            // Only export players who actually moved 
            if (player.path.length < 2) return null;

            const ball = players.find(p => p.id === 'BALL');
            const snapped = snapToFivePoints(player.path);
            return {
                id: player.id,
                action: player.actionType,
                hasBall: ball?.attachedTo === player.id,
                start_pos: { x: player.path[0].x, y: player.path[0].y },
                end_pos: { x: player.x, y: player.y },
                motion_path: snapped
            };
        }).filter(Boolean);

        // Add BALL player to playData if it has a path
        const ballPlayer = players.find(p => p.id === 'BALL');
        if (ballPlayer && ballPlayer.path.length >= 2) {
            const snapped = snapToFivePoints(ballPlayer.path);
            playData.push({
                id: 'BALL',
                action: ballPlayer.actionType,
                hasBall: false,
                start_pos: { x: ballPlayer.path[0].x, y: ballPlayer.path[0].y },
                end_pos: { x: ballPlayer.x, y: ballPlayer.y },
                motion_path: snapped
            });
        }

        // Auto-assign ball possession if ball was drawn but not attached
        let ballAutoAssigned = false;
        if (ballPlayer && ballPlayer.path.length >= 2 && !ballPlayer.attachedTo) {
            // Find the player closest to the ball's starting position
            let closestPlayer: Player | null = null;
            let minDistance = Infinity;

            players.forEach(player => {
                if (player.id !== 'BALL' && player.path.length >= 2) {
                    const startDist = Math.sqrt(
                        Math.pow(ballPlayer.path[0].x - player.path[0].x, 2) +
                        Math.pow(ballPlayer.path[0].y - player.path[0].y, 2)
                    );
                    if (startDist < minDistance) {
                        minDistance = startDist;
                        closestPlayer = player;
                    }
                }
            });

            // If a player is within reasonable distance, assign them the ball
            if (closestPlayer && minDistance < 100) {
                const ballData = playData.find(p => p?.id === 'BALL');
                const playerData = playData.find(p => p?.id === closestPlayer!.id);
                if (ballData && playerData) {
                    playerData.hasBall = true;
                    ballAutoAssigned = true;
                }
            }
        }

        try {
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            if (!apiKey) {
                throw new Error('Gemini API key not found. Please set VITE_GEMINI_API_KEY in your .env.local file.');
            }
            
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: "gemini-flash-latest",
                generationConfig: { responseMimeType: "application/json" }
            });

            const playerPerformanceStr = Object.entries(playerPoints).filter(([_, pts]) => pts > 0).length > 0 ? 
                Object.entries(playerPoints).filter(([_, pts]) => pts > 0).map(([id, pts]) => `${id}: ${pts} points`).join(', ') : 
                'No scoring data provided';
            
            const hotHandStr = hotHand ? `${hotHand} is feeling it tonight` : 'No player identified as having hot hand';
            
            const jerseyStr = Object.entries(jerseyNumbers).filter(([_, num]) => num && num.trim()).length > 0 ?
                Object.entries(jerseyNumbers).filter(([_, num]) => num && num.trim()).map(([id, num]) => `${id} wears #${num}`).join(', ') :
                'No jersey numbers specified';

            const jsonString = JSON.stringify(playData, null, 2);

            const prompt = `Expert Basketball Coach. Analyze this play data and return STRICT JSON:
${JSON.stringify({
    playName: "name",
    coachAnalysis: "2 sentences", 
    steps: ["step1", "step2"],
    reanimationData: {
        playerSequences: [
            { id: "PG", path: [{ x: 0, y: 0, t: 0.0 }, { x: 100, y: 100, t: 1.0 }] }
        ]
    }
}, null, 4)}

Note: For each path point, include a 't' property (0.0 to 1.0) representing the tactical timing.
Synchronize moves: e.g., screeners arrive at their spot BEFORE cutters start their route.

Defense Info: Type: ${defenseType}, Double Team Target: ${doubleTeamTarget || 'None'}.
Ball Possession: ${ballAutoAssigned ? 'Ball possession was auto-assigned to the nearest player since it was drawn separately.' : 'Ball possession based on player attachment during drawing.'}
Player Performance: ${playerPerformanceStr}.
Hot Hand: ${hotHandStr}.
Jersey Numbers: ${jerseyStr}.
Analyze the play and provide smooth synchronization for the offensive team.
STRICT TACTICAL RULES:
1. SCREENERS MUST ARRIVE FIRST: If a player's path has a point with 'isScreen: true', their 't' (time) at that arrival should be EARLIER than any cutters interacting with them.
2. THE SET PERIOD: Once at a screen point, the player MUST stay firm (same x,y) for at least 0.8 seconds.
3. CUTTER SYNCHRONIZATION: Cutters (players moving near the screen) MUST have 't' values that ensure they only pass the screen area AFTER the 'wait' period of the screener has begun.

Play Data: ${jsonString}`;
            
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            console.log("Gemini Response Recieved:", text);
            setAnalysis(JSON.parse(text));

        } catch (err: any) {
            console.error("Gemini Error:", err);
            setError(err.message || "Failed. See console.");
        } finally {
            setIsLoading(false);
        }
    };

    const startPlayback = () => {
        if (!analysis?.reanimationData?.playerSequences) return;
        setIsAnimating(true);
        const duration = 3000; // 3 seconds
        const startTime = performance.now();

        const basket = { x: 400, y: 75 };
        
        // Track defensive assignments and screen stickiness
        const defAssignments: Record<string, string> = {
            'D1': 'PG', 'D2': 'SG', 'D3': 'SF', 'D4': 'PF', 'D5': 'C'
        };
        const screenStickiness: Record<string, { stuckTime: number; stuckOnScreenId: string }> = {
            'D1': { stuckTime: 0, stuckOnScreenId: '' },
            'D2': { stuckTime: 0, stuckOnScreenId: '' },
            'D3': { stuckTime: 0, stuckOnScreenId: '' },
            'D4': { stuckTime: 0, stuckOnScreenId: '' },
            'D5': { stuckTime: 0, stuckOnScreenId: '' }
        };
        const prevDefenderPos: Record<string, { x: number; y: number }> = {};
        defenders.forEach(def => {
            prevDefenderPos[def.id] = { x: def.x, y: def.y };
        });

        // Sub-logic for Man-to-Man with speed limiting and commitment
        const calculateManToMan = (idx: number, targetPlayer: any, ballPos: any, defId: string, prevPos: { x: number; y: number }) => {
            const offenseIds = ['PG', 'SG', 'SF', 'PF', 'C'];
            const targetId = defAssignments[defId] || offenseIds[idx];
            const isDoubleTeaming = doubleTeamTarget === targetId;
            
            // 1. Smooth Gap Factor (Continuous)
            const distToBall = Math.sqrt((targetPlayer.x - ballPos.x) ** 2 + (targetPlayer.y - ballPos.y) ** 2);
            
            let gapFactor = 0.35;
            if (isDoubleTeaming) {
                gapFactor = 0.05; // Swarm
            } else {
                const t = Math.max(0, Math.min(1, (distToBall - 50) / 400));
                gapFactor = 0.1 + (0.65 - 0.1) * t;
            }

            let tx = targetPlayer.x + (basket.x - targetPlayer.x) * gapFactor;
            let ty = targetPlayer.y + (basket.y - targetPlayer.y) * gapFactor;

            // 2. Soft Paint Tether for Bigs (D4, D5)
            if (idx >= 3) { 
                const clampMinY = 80;
                const clampMaxY = 250;
                ty = Math.max(clampMinY, Math.min(clampMaxY, ty));
            }

            // 3. Smooth Shifting & Double Team Logic
            if (isDoubleTeaming && (idx === 0 || idx === 1)) {
                const distBallToTarget = Math.sqrt((ballPos.x - targetPlayer.x) ** 2 + (ballPos.y - targetPlayer.y) ** 2);
                const swarmInfluence = 1 - Math.max(0, Math.min(1, (distBallToTarget - 40) / 160));
                const normX = tx, normY = ty;
                const swarmX = targetPlayer.x + (idx === 0 ? -18 : 18);
                const swarmY = targetPlayer.y + (idx === 0 ? -18 : 18);
                tx = normX + (swarmX - normX) * swarmInfluence;
                ty = normY + (swarmY - normY) * swarmInfluence;
            } else {
                const shiftStrength = Math.min(0.25, (distToBall / 800) * 0.3);
                tx += (ballPos.x - tx) * shiftStrength;
                ty += (ballPos.y - ty) * shiftStrength;
            }

            // 4. Speed Limiting - Defenders committed to one side can't move too fast
            const maxSpeed = 150 / (1000 / 16.67); // pixels per frame (~150px/sec)
            const commitmentFactor = Math.abs(ballPos.x - 400) > 150 ? 0.6 : 1.0; // 60% speed if committed to side
            const limitedMaxSpeed = maxSpeed * commitmentFactor;
            
            const dx = tx - prevPos.x;
            const dy = ty - prevPos.y;
            const actualSpeed = Math.sqrt(dx * dx + dy * dy);
            
            if (actualSpeed > limitedMaxSpeed) {
                const scale = limitedMaxSpeed / actualSpeed;
                tx = prevPos.x + dx * scale;
                ty = prevPos.y + dy * scale;
            }

            return { x: tx, y: ty };
        };

        // Sub-logic for 2-3 Zone
        const calculate23Zone = (idx: number, ballPos: any) => {
            const slots = [
                { x: 330, y: 230 }, { x: 470, y: 230 }, // D1, D2 Guards (Top)
                { x: 180, y: 150 }, { x: 620, y: 150 }, // D3, D4 Wings / Corners (Bottom)
                { x: 400, y: 110 }                      // D5 Center (Paint)
            ];
            const slot = slots[idx];
            const isBallLeft = ballPos.x < 400;
            const isBallRight = ballPos.x > 400;
            
            let tx = slot.x;
            let ty = slot.y;

            if (idx < 2) { // Top Guards
                const isMySide = (idx === 0 && isBallLeft) || (idx === 1 && isBallRight);
                if (isMySide) {
                    tx += (ballPos.x - slot.x) * 0.55; // Aggressive close out
                    ty += (ballPos.y - slot.y) * 0.25;
                } else {
                    tx += (400 - slot.x) * 0.3; // Sink toward middle
                    ty = Math.max(ty + (ballPos.y - 400) * 0.1, 200);
                }
            } else if (idx < 4) { // Bottom Wings
                const isMySide = (idx === 2 && isBallLeft) || (idx === 3 && isBallRight);
                if (isMySide) {
                    // Close out to the ball (Corner or Wing)
                    tx += (ballPos.x - slot.x) * 0.7;
                    ty += (ballPos.y - slot.y) * 0.4;
                } else {
                    // Help Side: Sink deep into the paint
                    tx += (400 - slot.x) * 0.6;
                    ty = Math.max(ty + (ballPos.y - 300) * 0.15, 100);
                }
            } else { // Center
                // Anchor: Slide to stay between ball and basket primarily on X
                tx += (ballPos.x - 400) * 0.6;
                ty += (ballPos.y - 150) * 0.1;
                ty = Math.min(ty, 180); // Stay low to protect rim
            }
            
            return { x: tx, y: ty };
        };

        // Sub-logic for 3-2 Zone
        const calculate32Zone = (idx: number, ballPos: any) => {
            const slots = [
                { x: 400, y: 280 }, // D1 Top Guard
                { x: 230, y: 240 }, // D2 Wing Left
                { x: 570, y: 240 }, // D3 Wing Right
                { x: 340, y: 130 }, // D4 Block Left
                { x: 460, y: 130 }  // D5 Block Right
            ];
            const slot = slots[idx];
            const isBallLeft = ballPos.x < 400;
            const isBallRight = ballPos.x > 400;

            let tx = slot.x;
            let ty = slot.y;

            if (idx === 0) { // Top Point
                tx += (ballPos.x - 400) * 0.4;
                ty = Math.max(ty + (ballPos.y - 450) * 0.2, 260); // Stay high
            } else if (idx < 3) { // Wings
                const isMySide = (idx === 1 && isBallLeft) || (idx === 2 && isBallRight);
                if (isMySide) {
                    tx += (ballPos.x - slot.x) * 0.6;
                    ty += (ballPos.y - slot.y) * 0.3;
                } else {
                    tx += (400 - slot.x) * 0.4; // Sink toward elbow
                    ty = Math.max(ty + (ballPos.y - 300) * 0.1, 200);
                }
            } else { // Blocks
                const isMySide = (idx === 3 && isBallLeft) || (idx === 4 && isBallRight);
                if (isMySide) {
                    tx += (ballPos.x - slot.x) * 0.3; // Slide to ball side block
                    ty += (ballPos.y - slot.y) * 0.15;
                } else {
                    tx += (400 - slot.x) * 0.5; // Stay in paint middle
                    ty = 130;
                }
            }

            return { x: tx, y: ty };
        };

        const animate = (time: number) => {
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // 1. Calculate current offensive positions (including ball)
            const offenseSequences = analysis.reanimationData.playerSequences || [];
            const currentOffense = offenseSequences.map((seq: any) => {
                const path = seq.path;
                if (!path || path.length === 0) return { id: seq.id, x: 0, y: 0 };
                
                let p1 = path[0], p2 = path[path.length - 1];
                for (let i = 0; i < path.length - 1; i++) {
                    if (progress >= path[i].t && progress <= path[i + 1].t) {
                        p1 = path[i]; p2 = path[i + 1];
                        break;
                    }
                }
                const timeDiff = p2.t - p1.t;
                let subProgress = timeDiff <= 0 ? 0 : (progress - p1.t) / timeDiff;
                subProgress = Math.max(0, Math.min(1, subProgress)); // CLAMP

                const tx = p1.x + (p2.x - p1.x) * subProgress;
                const ty = p1.y + (p2.y - p1.y) * subProgress;

                return {
                    id: seq.id,
                    x: Math.max(50, Math.min(750, tx)), // CLAMP TO COURT
                    y: Math.max(50, Math.min(550, ty)), // CLAMP TO COURT
                    isScreenActive: !!p1.isScreen || !!p2.isScreen
                };
            });

            // 2. Compute Responsive Defensive Positions with Enhanced Screen Logic
            const ballPos = currentOffense.find((p: any) => p.id === 'BALL') || { x: 400, y: 300 };
            const currentDefenders = defenders.map((def, idx) => {
                let pos = { x: def.x, y: def.y };
                const prevPos = prevDefenderPos[def.id] || { x: def.x, y: def.y };
                
                if (defenseType === 'MAN') {
                    const targetId = defAssignments[def.id];
                    const targetPlayer = currentOffense.find((p: any) => p.id === targetId) || players.find(p => p.id === targetId) || def;
                    pos = calculateManToMan(idx, targetPlayer, ballPos, def.id, prevPos);
                } else if (defenseType === 'ZONE_23') {
                    pos = calculate23Zone(idx, ballPos);
                } else if (defenseType === 'ZONE_32') {
                    pos = calculate32Zone(idx, ballPos);
                }

                // ENHANCED SCREEN COLLISION: Defender gets caught on screens with stickiness tracking
                const activeScreens = currentOffense.filter((p: any) => p.isScreenActive);
                let isCaughtOnScreen = false;
                
                activeScreens.forEach((screen: any) => {
                    const distToScreen = Math.sqrt((pos.x - screen.x)**2 + (pos.y - screen.y)**2);
                    if (distToScreen < PLAYER_RADIUS * 2) { // Larger collision radius
                        isCaughtOnScreen = true;
                        
                        // Strong stickiness effect - defender gets really caught
                        const stickiness = 0.5; // Increased stickiness
                        pos.x = pos.x + (screen.x - pos.x) * stickiness;
                        pos.y = pos.y + (screen.y - pos.y) * stickiness;
                        
                        // Track stuckTime for switching
                        screenStickiness[def.id].stuckTime += 16.67; // ~60fps
                        screenStickiness[def.id].stuckOnScreenId = screen.id;
                    }
                });

                // If no longer on a screen, reset stuck time
                if (!isCaughtOnScreen) {
                    screenStickiness[def.id].stuckTime = Math.max(0, screenStickiness[def.id].stuckTime - 8.33);
                    screenStickiness[def.id].stuckOnScreenId = '';
                }

                // SWITCH LOGIC: If defender stuck for 500ms+, consider switching
                if (screenStickiness[def.id].stuckTime > 500 && defenseType === 'MAN') {
                    // Find the nearest offensive player not being defended
                    const offenseIds = ['PG', 'SG', 'SF', 'PF', 'C'];
                    let closestOffense = null;
                    let minDist = Infinity;
                    
                    offenseIds.forEach(offId => {
                        const offPlayer = currentOffense.find((p: any) => p.id === offId);
                        if (offPlayer) {
                            // Find if any other defender is already guarding this player
                            const isGuarded = Object.entries(defAssignments).some(
                                ([dId, targetId]) => dId !== def.id && targetId === offId
                            );
                            
                            const dist = Math.sqrt((pos.x - offPlayer.x) ** 2 + (pos.y - offPlayer.y) ** 2);
                            if (dist < minDist && !isGuarded) {
                                minDist = dist;
                                closestOffense = offId;
                            }
                        }
                    });
                    
                    if (closestOffense && minDist < 250) {
                        const oldAssignment = defAssignments[def.id];
                        defAssignments[def.id] = closestOffense;
                        screenStickiness[def.id].stuckTime = 0; // Reset after switch
                        console.log(`Switch: ${def.id} switched from ${oldAssignment} to ${closestOffense}`);
                    }
                }

                // Update previous position for next frame
                prevDefenderPos[def.id] = pos;

                return { id: def.id, x: pos.x, y: pos.y, isDefense: true };
            });

            setAnimationPlayers([...currentOffense, ...currentDefenders]);
            
            // 3. Post-process: Snap Ball to Carrier during animation (Dribbling)
            // Only snap if the AI's ball path is trailing close to the carrier.
            // If the ball is far (e.g. a Pass), let it follow the AI path freely.
            const ballPlayer = players.find(p => p.id === 'BALL');
            if (ballPlayer?.attachedTo) {
                const carrier = currentOffense.find((p: any) => p.id === ballPlayer.attachedTo);
                const animatedBall = currentOffense.find((p: any) => p.id === 'BALL');
                if (carrier && animatedBall) {
                    const distToCarrier = Math.sqrt((animatedBall.x - carrier.x) ** 2 + (animatedBall.y - carrier.y) ** 2);
                    if (distToCarrier < 40) {
                        animatedBall.x = carrier.x + 8; // Dribble offset
                        animatedBall.y = carrier.y + 8;
                    }
                }
            }

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            } else {
                setTimeout(() => setIsAnimating(false), 500); // Small pause at end
            }
        };

        animationRef.current = requestAnimationFrame(animate);
    };

    const handleStart = (e: any) => {
        if (isAnimating) return;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        // Calculate scale factor in case canvas is scaled down
        const scaleX = 800 / rect.width;
        const scaleY = 600 / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // Find if we clicked any player or defender
        const playerIndex = players.findIndex(p =>
            Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2) < PLAYER_RADIUS
        );

        if (playerIndex !== -1) {
            setActivePlayerIndex(playerIndex);

            setPlayers(prev => {
                const newPlayers = prev.map(p => ({ ...p, path: [...p.path] }));
                const ball = newPlayers.find(p => p.id === 'BALL');
                if (!ball) return newPlayers;

                // Possession logic
                if (newPlayers[playerIndex].id === 'BALL') {
                    ball.attachedTo = null;
                } else {
                    const dist = Math.sqrt((x - ball.x) ** 2 + (y - ball.y) ** 2);
                    if (dist < 50) {
                        ball.attachedTo = newPlayers[playerIndex].id;
                    }
                }

                if (newPlayers[playerIndex].path.length === 0) {
                    newPlayers[playerIndex].path = [{ x, y }];
                }
                return newPlayers;
            });
        } else {
            const defenderIndex = defenders.findIndex(p =>
                Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2) < PLAYER_RADIUS
            );
            if (defenderIndex !== -1) {
                setActiveDefenderIndex(defenderIndex);
            }
        }
    };

    const handleMove = (e: any) => {
        if (activePlayerIndex === null && activeDefenderIndex === null) return;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        // Calculate scale factor in case canvas is scaled down
        const scaleX = 800 / rect.width;
        const scaleY = 600 / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        if (activePlayerIndex !== null) {
            setPlayers(prev => {
                const newPlayers = prev.map(p => ({ ...p, path: [...p.path] }));
                const mover = newPlayers[activePlayerIndex];
                mover.x = x;
                mover.y = y;
                mover.path.push({ x, y });

                const ball = newPlayers.find(p => p.id === 'BALL');
                if (ball && ball.attachedTo === mover.id) {
                    const bx = x + 18;
                    const by = y + 18;
                    ball.x = bx;
                    ball.y = by;
                    ball.path.push({ x: bx, y: by });
                }
                return newPlayers;
            });
        } else if (activeDefenderIndex !== null) {
            setDefenders(prev => {
                const newDefenders = prev.map(d => ({ ...d, path: [...d.path] }));
                const mover = newDefenders[activeDefenderIndex];
                mover.x = x;
                mover.y = y;
                return newDefenders;
            });
        }
    };

    const handleEnd = () => {
        setActivePlayerIndex(null);
        setActiveDefenderIndex(null);
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        // Calculate scale factor in case canvas is scaled down
        const scaleX = 800 / rect.width;
        const scaleY = 600 / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const index = players.findIndex(p =>
            Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2) < PLAYER_RADIUS + 5
        );

        if (index !== -1) {
            setPlayers(players.map((p, i) => i === index ? { ...p, path: [], actionType: 'MOVE' } : p));
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        // Calculate scale factor in case canvas is scaled down
        const scaleX = 800 / rect.width;
        const scaleY = 600 / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const playerIndex = players.findIndex(p =>
            Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2) < PLAYER_RADIUS + 15
        );

        if (playerIndex !== -1 && players[playerIndex].id !== 'BALL') {
            const player = players[playerIndex];
            
            // If right-clicked NEAR a point on the path, toggle screen for that point
            let pointIndex = -1;
            let minDist = 20;
            player.path.forEach((p, i) => {
                const d = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2);
                if (d < minDist) {
                    minDist = d;
                    pointIndex = i;
                }
            });

            const newPlayers = [...players];
            if (pointIndex !== -1) {
                // Toggle localized screen
                newPlayers[playerIndex].path[pointIndex].isScreen = !newPlayers[playerIndex].path[pointIndex].isScreen;
            } else {
                // Toggle whole player screen (end of path)
                newPlayers[playerIndex].actionType = newPlayers[playerIndex].actionType === 'SCREEN' ? 'MOVE' : 'SCREEN';
            }
            setPlayers(newPlayers);
        }
    };

    // The "Snap" Logic: Simplifies raw points into key coordinates, preserving screens
    const snapToFivePoints = (allPoints: { x: number; y: number; isScreen?: boolean }[]) => {
        if (allPoints.length === 0) return [];
        
        // 1. Always include the Start and End
        // 2. Always include any point that has a SCREEN action
        // 3. Sample a few intermediate points to maintain the curve
        
        const screenIndices: number[] = [];
        allPoints.forEach((p, i) => {
            if (p.isScreen) screenIndices.push(i);
        });

        const keyIndices = new Set([0, allPoints.length - 1, ...screenIndices]);
        
        // If we still have few points, add 25%, 50%, 75%
        if (keyIndices.size < 5 && allPoints.length > 5) {
            const step = Math.floor(allPoints.length / 4);
            keyIndices.add(step);
            keyIndices.add(step * 2);
            keyIndices.add(step * 3);
        }

        const sorted = Array.from(keyIndices).sort((a, b) => a - b);
        return sorted.map(idx => allPoints[idx]);
    };

    return (
        <div className="flex flex-col lg:flex-row items-start bg-gray-50 p-4 rounded-xl max-w-full mx-auto gap-6">
            {/* LEFT SIDE: Buttons & Feedback & Analysis */}
            <div className="w-full lg:w-1/4 flex flex-col gap-4 overflow-y-auto max-h-screen">
                {/* Action Buttons */}
                <div className="flex flex-col gap-4">
                    <button
                        onClick={getPlayDesignFeedback}
                        disabled={isLoading}
                        className={`px-6 py-3 font-bold rounded-lg transition-all shadow-sm flex items-center justify-center gap-2 ${isLoading ? 'bg-purple-300 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 text-white active:scale-95'
                            }`}
                    >
                        💡 Get Play Design Feedback
                    </button>
                    <button
                        onClick={exportPlay}
                        disabled={isLoading}
                        className={`px-6 py-3 font-bold rounded-lg transition-all shadow-sm flex items-center justify-center gap-2 ${isLoading ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                            }`}
                    >
                        {isLoading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Analyzing Play...
                            </>
                        ) : 'Analyze Play with Gemini'}
                    </button>
                    <button
                        onClick={() => {
                            setPlayers(players.map(p => ({ ...p, path: [], actionType: 'MOVE' })));
                            setDefenders(getFormationPositions(defenseType));
                            setAnalysis(null);
                            setError(null);
                            setDoubleTeamTarget(null);
                            setHotHand(null);
                            setPlayDesignFeedback(null);
                        }}
                        className="px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                    >
                        Reset Clipboard
                    </button>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
                        <p className="font-bold">Error</p>
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                {/* Play Design Feedback */}
                {playDesignFeedback && (
                    <div className="p-4 bg-purple-50 border border-purple-200 text-purple-800 rounded-lg">
                        <p className="font-bold mb-2">💡 Play Design Feedback</p>
                        <div className="text-sm whitespace-pre-line">{playDesignFeedback}</div>
                    </div>
                )}

                {/* Analysis & Animation */}
                {analysis && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-100">
                            <div className="bg-blue-600 p-4 text-white">
                                <h3 className="text-xl font-bold">{analysis.playName}</h3>
                                <p className="text-blue-100 italic">Advanced Coaching Report</p>
                            </div>
                            <div className="p-6 space-y-6">
                                <div>
                                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">Coach's Analysis</h4>
                                    <p className="text-slate-700 text-lg leading-relaxed">{analysis.coachAnalysis}</p>
                                </div>

                                <hr className="border-slate-100" />

                                <div>
                                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Step-by-Step Breakdown</h4>
                                    <ul className="space-y-3">
                                        {analysis.steps.map((step: string, idx: number) => (
                                            <li key={idx} className="flex gap-4 items-start">
                                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                                                    {idx + 1}
                                                </span>
                                                <span className="text-slate-600 font-medium">{step}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {analysis.reanimationData && (
                                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                            Re-animation data ready
                                        </div>
                                        <button
                                            onClick={startPlayback}
                                            disabled={isAnimating}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold transition-all ${isAnimating
                                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md active:scale-95'
                                                }`}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                            </svg>
                                            {isAnimating ? 'Re-animating...' : 'Play Re-animation'}
                                        </button>
                                    </div>
                                )}

                                <div className="pt-4 border-t border-slate-100 flex justify-end">
                                    <button
                                        onClick={() => {
                                            const debugInfo = {
                                                defenseSettings: { defenseType, doubleTeamTarget },
                                                inputPlayData: players,
                                                aiResponse: analysis
                                            };
                                            navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
                                            alert("Debug info copied to clipboard! Paste it into the chat.");
                                        }}
                                        className="text-xs font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                                            <path d="M5 5a2 2 0 012-2h6a2 2 0 012 2v2H7a2 2 0 00-2 2v6H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
                                        </svg>
                                        Copy Debug Data for Antigravity
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* CENTER: Canvas/Clipboard */}
            <div className="w-full lg:w-1/2 flex flex-col items-center gap-4">
                <div className="w-full text-center mb-4">
                    <h2 className="text-2xl font-bold text-slate-800">Smart Basketball Clipboard</h2>
                    <p className="text-slate-500">Draw paths for players to analyze the play with Gemini</p>
                </div>

                <canvas
                    ref={canvasRef}
                    width={800}
                    height={600}
                    onMouseDown={handleStart}
                    onMouseMove={handleMove}
                    onMouseUp={handleEnd}
                    onContextMenu={handleContextMenu}
                    onDoubleClick={handleDoubleClick}
                    className="bg-white border-2 border-slate-200 rounded-lg shadow-md touch-none cursor-grab max-w-full"
                />
            </div>

            {/* RIGHT SIDE: Controls & Settings */}
            <div className="w-full lg:w-1/4 flex flex-col gap-6">
                <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Defense Type</label>
                            <div className="flex flex-wrap gap-2">
                                {(['MAN', 'ZONE_23', 'ZONE_32'] as const).map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setDefenseType(type)}
                                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${defenseType === type
                                            ? 'bg-red-600 text-white shadow-md'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            }`}
                                    >
                                        {type === 'MAN' ? 'Man-to-Man' : type === 'ZONE_23' ? '2-3 Zone' : '3-2 Zone'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Double Team Target</label>
                            <select
                                value={doubleTeamTarget || ''}
                                onChange={(e) => setDoubleTeamTarget(e.target.value || null)}
                                className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-red-500 focus:border-red-500 block w-full p-2.5 transition-colors"
                            >
                                <option value="">None</option>
                                {players.filter(p => p.id !== 'BALL').map(p => (
                                    <option key={p.id} value={p.id}>Double Team {p.id}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Player Points</label>
                            <div className="grid grid-cols-2 gap-2">
                                {players.filter(p => p.id !== 'BALL').map(p => (
                                    <div key={p.id} className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-slate-600 w-6">{p.id}</span>
                                        <input
                                            type="number"
                                            min="0"
                                            value={playerPoints[p.id] || 0}
                                            onChange={(e) => setPlayerPoints(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                                            className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded focus:ring-blue-500 focus:border-blue-500 block w-full p-1 transition-colors"
                                            placeholder="0"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Jersey Numbers</label>
                            <div className="grid grid-cols-2 gap-2">
                                {players.filter(p => p.id !== 'BALL').map(p => (
                                    <div key={p.id} className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-slate-600 w-6">{p.id}</span>
                                        <input
                                            type="text"
                                            maxLength={3}
                                            value={jerseyNumbers[p.id] || ''}
                                            onChange={(e) => setJerseyNumbers(prev => ({ ...prev, [p.id]: e.target.value }))}
                                            className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded focus:ring-green-500 focus:border-green-500 block w-full p-1 transition-colors"
                                            placeholder="#"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Hot Hand</label>
                            <select
                                value={hotHand || ''}
                                onChange={(e) => setHotHand(e.target.value || null)}
                                className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-orange-500 focus:border-orange-500 block w-full p-2.5 transition-colors"
                            >
                                <option value="">No one hot</option>
                                {players.filter(p => p.id !== 'BALL').map(p => (
                                    <option key={p.id} value={p.id}>{p.id} is hot</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
