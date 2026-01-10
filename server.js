const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

    socket.on('user-message', ({ message, room }) => {
        socket.to(room).emit('message', message);
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