import { io } from 'socket.io-client';

const socket = io('http://localhost:4000', {
  autoConnect: false,
  reconnectionAttempts: 5,
});

export default socket;