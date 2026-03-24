import React, { useState } from 'react';
import LobbyScreen from './screens/LobbyScreen';
import GameScreen from './screens/GameScreen';
import EndScreen from './screens/EndScreen';

export default function App() {
  const [screen, setScreen] = useState('lobby');
  const [gameData, setGameData] = useState(null);
  const [endData, setEndData] = useState(null);

  function goToGame(data) {
    setGameData(data);
    setScreen('game');
  }

  function goToEnd(data) {
    setEndData(data);
    setScreen('end');
  }

  function goToLobby() {
    setScreen('lobby');
    setGameData(null);
    setEndData(null);
  }

  return (
    <>
      <div className="scanline" />
      {screen === 'lobby' && <LobbyScreen onGameStart={goToGame} />}
      {screen === 'game' && <GameScreen gameData={gameData} onGameEnd={goToEnd} />}
      {screen === 'end' && <EndScreen endData={endData} onPlayAgain={goToLobby} />}
    </>
  );
}
