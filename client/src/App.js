import React, { useState, useEffect, useCallback } from 'react';
import socket from './utils/socket'
import LobbyScreen from './screens/LobbyScreen';
import GameScreen from './screens/GameScreen';
import EndScreen from './screens/EndScreen';
import DisruptionScreen from './screens/DisruptionScreen';

export default function App() {
  const [screen, setScreen] = useState('lobby');
  const [gameData, setGameData] = useState(null);
  const [endData, setEndData] = useState(null);
  const [disruption, setDisruption] = useState(null);

  useEffect(() => {
    const handleHostDisconnected = (data) => {
      setDisruption((prev) => prev ?? { type: 'host_disconnected', data });
      setScreen((prev) => (prev === 'disruption' ? prev : 'disruption'));
    };

    const handleSpyLeft = (data) => {
      setDisruption((prev) => prev ?? { type: 'spy_left', data });
      setScreen((prev) => (prev === 'disruption' ? prev : 'disruption'));
    };

    socket.on('host_disconnected', handleHostDisconnected);
    socket.on('spy_left', handleSpyLeft);

    return () => {
      socket.off('host_disconnected', handleHostDisconnected);
      socket.off('spy_left', handleSpyLeft);
    };
  }, []);

  const handleGameStart = useCallback((data) => {
    setGameData(data);
    setScreen('game');
  }, []);
 
  const handleGameEnd = useCallback((data) => {
    setEndData(data);
    setScreen('end');
  }, []);
 
  const handlePlayAgain = useCallback(() => {
    setGameData(null);
    setEndData(null);
    setScreen('lobby');
  }, []);
 
  const handleReturnHome = useCallback(() => {
    setDisruption(null);
    setGameData(null);
    setEndData(null);
    setScreen('lobby');
    socket.disconnect();
    socket.connect();
  }, []);

  if (screen === 'disruption' && disruption) {
    return (
      <DisruptionScreen
        type={disruption.type}
        data={disruption.data}
        onReturnHome={handleReturnHome}
      />
    );
  }
 
  if (screen === 'game' && gameData) {
    return <GameScreen gameData={gameData} onGameEnd={handleGameEnd} />;
  }
 
  if (screen === 'end' && endData) {
    return <EndScreen endData={endData} onPlayAgain={handlePlayAgain} />;
  }
 
  return <LobbyScreen onGameStart={handleGameStart} />;
}
