const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { handleConnection } = require('./socket');

const app = express();
app.use(cors());
app.use(express.json());

app.length('/', (req, res) => {
  res.send('Code Spy server is running');
})

const server = http.createServer(app);

const io = new Server(server, {
  cors: { 
    origin: '*', 
    methods: ['GET', 'POST'] 
  }
});

io.on('connection', (socket) => handleConnection(socket, io));

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`✅ Code Spy server running on ${PORT}`);
});
