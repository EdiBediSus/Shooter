const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static('public'));

// Store active players
const players = new Map();

// Clean up stale players every 10 seconds
setInterval(() => {
    const now = Date.now();
    const staleThreshold = 10000; // 10 seconds
    
    players.forEach((player, id) => {
        if (now - player.lastUpdate > staleThreshold) {
            players.delete(id);
            // Broadcast player left
            broadcast({
                type: 'player_left',
                id: id
            });
            console.log(`Removed stale player: ${player.name}`);
        }
    });
}, 10000);

wss.on('connection', (ws) => {
    console.log('New client connected');
    let playerId = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'join':
                    playerId = data.id;
                    players.set(playerId, {
                        id: data.id,
                        name: data.name,
                        x: data.x || 0,
                        y: data.y || 1.7,
                        z: data.z || 0,
                        yaw: data.yaw || 0,
                        pitch: data.pitch || 0,
                        hp: data.hp || 100,
                        score: data.score || 0,
                        weapon: data.weapon || 0,
                        lastUpdate: Date.now(),
                        ws: ws
                    });
                    
                    console.log(`Player joined: ${data.name} (${playerId})`);
                    
                    // Send current players to the new player
                    const currentPlayers = Array.from(players.values())
                        .filter(p => p.id !== playerId)
                        .map(p => ({
                            id: p.id,
                            name: p.name,
                            x: p.x,
                            y: p.y,
                            z: p.z,
                            yaw: p.yaw,
                            pitch: p.pitch,
                            hp: p.hp,
                            score: p.score,
                            weapon: p.weapon
                        }));
                    
                    ws.send(JSON.stringify({
                        type: 'init',
                        players: currentPlayers
                    }));
                    
                    // Broadcast new player to others
                    broadcast({
                        type: 'player_joined',
                        player: {
                            id: playerId,
                            name: data.name,
                            x: data.x || 0,
                            y: data.y || 1.7,
                            z: data.z || 0,
                            yaw: data.yaw || 0,
                            pitch: data.pitch || 0,
                            hp: data.hp || 100,
                            score: data.score || 0,
                            weapon: data.weapon || 0
                        }
                    }, playerId);
                    break;

                case 'update':
                    if (playerId && players.has(playerId)) {
                        const player = players.get(playerId);
                        player.x = data.x;
                        player.y = data.y;
                        player.z = data.z;
                        player.yaw = data.yaw;
                        player.pitch = data.pitch;
                        player.hp = data.hp;
                        player.score = data.score;
                        player.weapon = data.weapon;
                        player.lastUpdate = Date.now();
                        
                        // Broadcast update to other players
                        broadcast({
                            type: 'player_update',
                            player: {
                                id: playerId,
                                x: data.x,
                                y: data.y,
                                z: data.z,
                                yaw: data.yaw,
                                pitch: data.pitch,
                                hp: data.hp,
                                score: data.score,
                                weapon: data.weapon
                            }
                        }, playerId);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        if (playerId && players.has(playerId)) {
            const playerName = players.get(playerId).name;
            players.delete(playerId);
            console.log(`Player disconnected: ${playerName} (${playerId})`);
            
            // Broadcast player left
            broadcast({
                type: 'player_left',
                id: playerId
            });
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Broadcast message to all clients except sender
function broadcast(message, excludeId = null) {
    const data = JSON.stringify(message);
    players.forEach((player, id) => {
        if (id !== excludeId && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(data);
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
