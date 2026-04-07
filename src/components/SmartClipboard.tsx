import { useRef, useState, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';

const PLAYER_RADIUS = 20;

interface Player {
    id: string;
    x: number;
    y: number;
    path: { x: number; y: number }[];
    actionType: string;
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
        { id: 'BALL', x: 400, y: 440, path: [], actionType: 'PASS', attachedTo: null }, // Track possession
    ]);
    const [activePlayerIndex, setActivePlayerIndex] = useState<number | null>(null);
    const [analysis, setAnalysis] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAnimating, setIsAnimating] = useState(false);
    const [animationPlayers, setAnimationPlayers] = useState<any[]>([]);
    const animationRef = useRef<number | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;

        // Determine which set of players to draw
        const drawList = isAnimating ? animationPlayers : players;

        // 1. Clear and Draw Court
        drawCourt(ctx);

        // 2. Draw all Ghost Trails (only if not animating or if we want to see them below)
        players.forEach(p => {
            if (p.path.length > 1) drawTrail(ctx, p.path, p.id === 'BALL', p.actionType === 'SCREEN');
        });

        // 3. Draw all Players (Regular or Animated)
        drawList.forEach(p => drawPlayer(ctx, p));

    }, [players, isAnimating, animationPlayers]);

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

    const drawTrail = (ctx: CanvasRenderingContext2D, path: { x: number, y: number }[], isBall: boolean, isScreen: boolean) => {
        ctx.beginPath();
        // Passes (Ball movement) are always dashed
        if (isBall) {
            ctx.setLineDash([8, 8]);
            ctx.strokeStyle = "rgba(249, 115, 22, 0.5)"; // Orange-ish for ball 
        } else {
            ctx.setLineDash([]);
            ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
        }

        ctx.lineWidth = 2;
        ctx.moveTo(path[0].x, path[0].y);
        path.forEach(pt => ctx.lineTo(pt.x, pt.y));
        ctx.stroke();

        // Draw a small dot at the START of the path 
        ctx.beginPath();
        ctx.arc(path[0].x, path[0].y, 3, 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();

        // Draw T-Intersection for Screens
        if (isScreen && path.length > 1) {
            const end = path[path.length - 1];
            const prev = path[path.length - 2];
            const dx = end.x - prev.x;
            const dy = end.y - prev.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) {
                const nx = (dx / len) * 15;
                const ny = (dy / len) * 15;
                ctx.beginPath();
                ctx.setLineDash([]);
                ctx.moveTo(end.x - ny, end.y + nx);
                ctx.lineTo(end.x + ny, end.y - nx);
                ctx.stroke();
            }
        }

        ctx.setLineDash([]);
    };

    const drawPlayer = (ctx: CanvasRenderingContext2D, player: any) => {
        const isBall = player.id === 'BALL';
        const radius = isBall ? 10 : PLAYER_RADIUS;

        ctx.beginPath();
        ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isBall ? "#f97316" : "#3b82f6"; // Orange for ball
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();

        if (!isBall) {
            ctx.fillStyle = "white";
            ctx.font = "bold 12px Sans-Serif";
            ctx.textAlign = "center";
            ctx.fillText(player.id, player.x, player.y + 5);
        }
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

        if (playData.length === 0) {
            alert("Please draw some plays first!");
            return;
        }

        const jsonString = JSON.stringify(playData, null, 2);
        console.log("PLAY DATA:", jsonString);

        setIsLoading(true);
        setError(null);

        console.log("Analyzing play...");
        try {
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            if (!apiKey) throw new Error("API Key missing");

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: "gemini-flash-latest",
                generationConfig: { responseMimeType: "application/json" }
            });

            const prompt = `
                Expert Basketball Coach. Analyze this play data and return STRICT JSON:
                { 
                    "playName": "name", 
                    "coachAnalysis": "2 sentences", 
                    "steps": ["step1", "step2"], 
                    "reanimationData": {
                        "playerSequences": [
                            { "id": "PG", "path": [{ "x": 0, "y": 0, "t": 0.0 }, { "x": 100, "y": 100, "t": 1.0 }] }
                        ]
                    }
                }
                
                Note: For each path point, include a 't' property (0.0 to 1.0) representing the tactical timing.
                Synchronize moves: e.g., screeners arrive at their spot BEFORE cutters start their route.
                
                Play Data: ${jsonString}
            `;

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

        const animate = (time: number) => {
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const currentFramePositions = analysis.reanimationData.playerSequences.map((seq: any) => {
                const path = seq.path;
                if (!path || path.length === 0) return { id: seq.id, x: 0, y: 0 };
                if (path.length === 1) return { id: seq.id, x: path[0].x, y: path[0].y };

                // Find the two points in the AI-provided path that bracket the current 'progress'
                let p1 = path[0];
                let p2 = path[path.length - 1];

                for (let i = 0; i < path.length - 1; i++) {
                    if (progress >= path[i].t && progress <= path[i + 1].t) {
                        p1 = path[i];
                        p2 = path[i + 1];
                        break;
                    }
                }

                if (p1 === p2) return { id: seq.id, x: p1.x, y: p1.y };

                // Interpolate based on the 't' values of the two bracketing points
                const timeDiff = p2.t - p1.t;
                const subProgress = timeDiff === 0 ? 0 : (progress - p1.t) / timeDiff;

                return {
                    id: seq.id,
                    x: p1.x + (p2.x - p1.x) * subProgress,
                    y: p1.y + (p2.y - p1.y) * subProgress
                };
            });

            setAnimationPlayers(currentFramePositions);

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            } else {
                setTimeout(() => setIsAnimating(false), 500); // Small pause at end
            }
        };

        animationRef.current = requestAnimationFrame(animate);
    };

    const handleStart = (e: any) => {
        if (isAnimating) return; // Disable during playback
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.nativeEvent.offsetX;
        const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.nativeEvent.offsetY;

        // Find if we clicked any of the 5 players
        const index = players.findIndex(p =>
            Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2) < PLAYER_RADIUS
        );

        if (index !== -1) {
            setActivePlayerIndex(index);
            
            setPlayers(prev => {
                const newPlayers = prev.map(p => ({ ...p, path: [...p.path] }));
                const ball = newPlayers.find(p => p.id === 'BALL');
                if (!ball) return newPlayers;

                // 1. Possession Check 
                if (newPlayers[index].id === 'BALL') {
                    ball.attachedTo = null; // Manual ball move detaches it
                } else {
                    const dist = Math.sqrt((x - ball.x) ** 2 + (y - ball.y) ** 2);
                    if (dist < 50) { // More forgiving pickup radius
                        ball.attachedTo = newPlayers[index].id;
                    }
                }

                // 2. Persistence Check
                if (newPlayers[index].path.length === 0) {
                    newPlayers[index].path = [{ x, y }];
                }
                return newPlayers;
            });
        }
    };

    const handleMove = (e: any) => {
        if (activePlayerIndex === null) return;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.nativeEvent.offsetX;
        const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.nativeEvent.offsetY;

        setPlayers(prev => {
            const newPlayers = prev.map(p => ({ ...p, path: [...p.path] }));
            const mover = newPlayers[activePlayerIndex];

            // 1. Update Player 
            mover.x = x;
            mover.y = y;
            mover.path.push({ x, y });

            // 2. LOGIC: Dribble Follow
            const ball = newPlayers.find(p => p.id === 'BALL');
            if (ball && ball.attachedTo === mover.id) {
                const bx = x + 18; // Offset for visibility
                const by = y + 18;
                ball.x = bx;
                ball.y = by;
                ball.path.push({ x: bx, y: by });
            }

            return newPlayers;
        });
    };

    const handleEnd = () => {
        if (activePlayerIndex !== null) {
            setActivePlayerIndex(null);
        }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const index = players.findIndex(p =>
            Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2) < PLAYER_RADIUS + 5
        );

        if (index !== -1) {
            const newPlayers = [...players];
            newPlayers[index].path = [];
            newPlayers[index].actionType = 'MOVE';
            setPlayers(newPlayers);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Find which player's path or icon was right-clicked
        const index = players.findIndex(p =>
            Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2) < PLAYER_RADIUS + 10
        );

        if (index !== -1 && players[index].id !== 'BALL') {
            const newPlayers = [...players];
            newPlayers[index].actionType = newPlayers[index].actionType === 'SCREEN' ? 'MOVE' : 'SCREEN';
            setPlayers(newPlayers);
        }
    };

    // The "Snap" Logic: Simplifies raw points into 5 key coordinates 
    const snapToFivePoints = (allPoints: { x: number; y: number }[]) => {
        if (allPoints.length <= 5) return allPoints;

        const step = Math.floor(allPoints.length / 4);
        const snapped = [
            allPoints[0],                                // Start
            allPoints[step],                             // 25%
            allPoints[step * 2],                         // 50%
            allPoints[step * 3],                         // 75%
            allPoints[allPoints.length - 1]              // End
        ];
        return snapped;
    };

    return (
        <div className="flex flex-col items-center bg-gray-50 p-4 rounded-xl max-w-4xl mx-auto">
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

            <div className="flex gap-4 mt-6">
                <button
                    onClick={exportPlay}
                    disabled={isLoading}
                    className={`px-8 py-3 font-bold rounded-lg transition-all shadow-sm flex items-center gap-2 ${isLoading ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
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
                        setPlayers(players.map(p => ({ ...p, path: [] })));
                        setAnalysis(null);
                        setError(null);
                    }}
                    className="px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                >
                    Reset Clipboard
                </button >
            </div>

            {error && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg w-full max-w-3xl">
                    <p className="font-bold">Error</p>
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {analysis && (
                <div className="mt-8 w-full max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                                        className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold transition-all ${isAnimating
                                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                            : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md active:scale-95'
                                            }`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                        </svg>
                                        {isAnimating ? 'Re-animating...' : 'Play Re-animation'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
}
