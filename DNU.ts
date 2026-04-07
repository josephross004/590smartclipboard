"use client";
import React, { useRef, useState, useEffect } from 'react';
const PLAYER_RADIUS = 20;
export default function SmartClipboard() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Initialize 5 players in a standard "3-out 2-in" formation 
    const [players, setPlayers] = useState([{ id: 'PG', x: 400, y: 480, path: [] as { x: number, y: number }[] }, { id: 'SG', x: 150, y: 400, path: [] }, { id: 'SF', x: 650, y: 400, path: [] }, { id: 'PF', x: 250, y: 150, path: [] }, { id: 'C', x: 550, y: 150, path: [] },]);
    const [activePlayerIndex, setActivePlayerIndex] = useState<number | null>(null);
    useEffect(() => {
        const canvas = canvasRef.current; const ctx = canvas?.getContext('2d'); if (!ctx) return;

        // 1. Clear and Draw Court
        drawCourt(ctx);

        // 2. Draw all Ghost Trails
        players.forEach(p => {
            if (p.path.length > 1) drawTrail(ctx, p.path);
        });

        // 3. Draw all Players
        players.forEach(p => drawPlayer(ctx, p));

    }, [players]);
    const drawCourt = (ctx: CanvasRenderingContext2D) => {
        ctx.clearRect(0, 0, 800, 600); ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 2; ctx.strokeRect(50, 50, 700, 500); // Boundary ctx.strokeRect(300, 50, 200, 190); // Key ctx.beginPath(); ctx.moveTo(100, 50); ctx.lineTo(100, 145); ctx.arc(400, 75, 307, Math.PI - 0.23, 0.23, true); ctx.lineTo(700, 50); ctx.stroke(); };
        const drawTrail = (ctx: CanvasRenderingContext2D, path: { x: number, y: number }[]) => { ctx.beginPath(); ctx.setLineDash([8, 8]); ctx.strokeStyle = "rgba(59, 130, 246, 0.4)"; ctx.lineWidth = 2; ctx.moveTo(path[0].x, path[0].y); path.forEach(pt => ctx.lineTo(pt.x, pt.y)); ctx.stroke(); ctx.setLineDash([]); };
        const drawPlayer = (ctx: CanvasRenderingContext2D, player: any) => { ctx.beginPath(); ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2); ctx.fillStyle = "#3b82f6"; ctx.fill(); ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = "white"; ctx.font = "bold 12px Sans-Serif"; ctx.textAlign = "center"; ctx.fillText(player.id, player.x, player.y + 5); };
        // ... existing code ...
        const exportPlay = () => {
            const playData = players.map(player => { // Only export players who actually moved if (player.path.length < 2) return null;

                const snapped = snapToFivePoints(player.path);
                return {
                    position: player.id,
                    start_pos: { x: player.path[0].x, y: player.path[0].y },
                    end_pos: { x: player.x, y: player.y },
                    motion_path: snapped
                };
            }).filter(Boolean);

            const jsonString = JSON.stringify(playData, null, 2);
            console.log("PLAY EXPORTED:", jsonString);
            alert("Play data copied to console! Right-click > Inspect > Console to grab it.");

            // Optional: Copy to clipboard automatically
            navigator.clipboard.writeText(jsonString);

        };
        const handleStart = (e: any) => {
            const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return; const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.nativeEvent.offsetX; const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.nativeEvent.offsetY;

            // Find if we clicked any of the 5 players
            const index = players.findIndex(p =>
                Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2) < PLAYER_RADIUS
            );

            if (index !== -1) {
                setActivePlayerIndex(index);
                // Optional: Clear only this player's path when a new move starts
                const newPlayers = [...players];
                newPlayers[index].path = [{ x, y }];
                setPlayers(newPlayers);
            }

        };
        const handleMove = (e: any) => {
            if (activePlayerIndex === null) return; const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return; const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.nativeEvent.offsetX; const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.nativeEvent.offsetY;

            const newPlayers = [...players];
            newPlayers[activePlayerIndex] = {
                ...newPlayers[activePlayerIndex],
                x,
                y,
                path: [...newPlayers[activePlayerIndex].path, { x, y }]
            };
            setPlayers(newPlayers);

        };
        const handleEnd = () => {
            if (activePlayerIndex !== null) { // Logic for the LLM 'Snap' would go here for the active player setActivePlayerIndex(null); } };
                // The "Snap" Logic: Simplifies raw points into 5 key coordinates const snapToFivePoints = (allPoints: { x: number; y: number }[]) => { if (allPoints.length <= 5) return allPoints;

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
            return (<div className= "flex flex-col items-center bg-gray-50 p-4 rounded-xl" > <canvas ref={ canvasRef } width = { 800} height = { 600} onMouseDown = { handleStart } onMouseMove = { handleMove } onMouseUp = { handleEnd } className = "bg-white border-2 border-slate-200 rounded-lg shadow-sm touch-none cursor-grab" /> <div className="flex gap-4 mt-4" > <button onClick={ exportPlay } className = "px-6 py-2 bg-blue-600 text-white font-bold rounded-md hover:bg-blue-700 transition-colors" > Export Play for Gemini < /button> <button onClick={() => setPlayers(players.map(p => ({ ...p, path: [] })))} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300" > Reset Trails </button > </div> </div > );
        }