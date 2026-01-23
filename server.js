const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingTimeout: 60000, // Wait 60 seconds (default is 20s)
    pingInterval: 25000 // Send a "Are you there?" check every 25s
});

app.use(express.static(path.resolve("./public")));

let waitingUser = null;

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    let usercount = io.engine.clientsCount;
        io.emit('user-count', usercount);

    socket.on('join-chat', () => {
        if (waitingUser === null) {
            // Case A: Wait in queue
            waitingUser = socket;
            socket.emit('status', 'Searching for a stranger...');
        } else {
            // Case B: Match found
            const partnerSocket = waitingUser;
            const roomName = "room-" + socket.id + "-" + partnerSocket.id;

            socket.join(roomName);
            partnerSocket.join(roomName);

            // SAVE THE ROOM ID IN THE SOCKET OBJECT ITSELF
            // This is like adding a "tag" to the user
            socket.currentRoom = roomName;
            partnerSocket.currentRoom = roomName;

            io.to(roomName).emit('status', 'Stranger found! Say Hello.');
            io.to(roomName).emit('start-chat', roomName);

            waitingUser = null;
        }
    });

    socket.on('user-message', (data) => {
        const { message, room } = data;
        
        // 1. Get the list of people actually inside this room
        const clientsInRoom = io.sockets.adapter.rooms.get(room);
        
        // 2. STRICT CHECK:
        // A) Does the room exist?
        // B) Is the SENDER (socket.id) actually inside this room?
        if (!clientsInRoom || !clientsInRoom.has(socket.id)) {
            // If not, they are a "Ghost" (reconnected user with new ID).
            // Tell them the chat is over.
            socket.emit('stranger-disconnected'); 
            return;
        }

        // 3. If they passed the check, send the message
        socket.to(room).emit('message', message);
    });
    // ... inside io.on('connection', socket) ...

    socket.on('typing', (room) => {
        socket.to(room).emit('typing');
    });

    socket.on('stop-typing', (room) => {
        socket.to(room).emit('stop-typing');
    });
    // --- NEW: Handle "Skip" Button ---
    socket.on('leave-chat', () => {
        if (socket.currentRoom) {
            console.log("User skipped chat:", socket.id);
            
            // 1. Tell the partner "Stranger disconnected"
            socket.to(socket.currentRoom).emit('stranger-disconnected');
            
            // 2. Make THIS user leave the room properly
            socket.leave(socket.currentRoom);
            
            // 3. Clear the room tag so they are "free"
            socket.currentRoom = null;
        }
        
        // Also remove them from waiting queue if they clicked skip while searching
        if (waitingUser === socket) {
            waitingUser = null;
        }
    });

    // --- NEW: HANDLE DISCONNECT ---
    socket.on('disconnect', () => {
        // 1. If they were waiting in line, just remove them
        if (waitingUser === socket) {
            waitingUser = null;
        }

        // 2. If they were in a room, tell the other person!
        if (socket.currentRoom) {
            // Send "stranger-disconnected" event to the room
            socket.to(socket.currentRoom).emit('stranger-disconnected');
        }

        let usercount = io.engine.clientsCount;
        io.emit('user-count', usercount);
    });
});

const PORT = process.env.PORT || 9000; // Use Render's port, or 9000 if local
server.listen(PORT, () => console.log(`Server Running on Port ${PORT}`));