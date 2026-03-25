import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_NOTIFICATIONS = 30;
const TYPING_NOTIFICATION_PREFIX = 'typing-';

export default function useGameNotifications(eliminatedPlayers) {
  const [notifications, setNotifications] = useState([]);
  const [typingPlayers, setTypingPlayers] = useState({});

  const typingTimeoutsRef = useRef({});
  const notificationTimersRef = useRef({});

  const addOrUpdateNotification = useCallback((item) => {
    setNotifications((prev) => {
      const exists = prev.some((notification) => notification.id === item.id);

      if (exists) {
        return prev.map((notification) =>
          notification.id === item.id
            ? { ...notification, ...item }
            : notification
        );
      }

      return [item, ...prev].slice(0, MAX_NOTIFICATIONS);
    });
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  }, []);

  const clearNotificationTimer = useCallback((id) => {
    const timer = notificationTimersRef.current[id];
    if (timer) {
      clearTimeout(timer);
      delete notificationTimersRef.current[id];
    }
  }, []);

  const pushTimedNotification = useCallback(
    (item, duration = 3000) => {
      addOrUpdateNotification(item);
      clearNotificationTimer(item.id);

      notificationTimersRef.current[item.id] = setTimeout(() => {
        removeNotification(item.id);
        delete notificationTimersRef.current[item.id];
      }, duration);
    },
    [addOrUpdateNotification, clearNotificationTimer, removeNotification]
  );

  const pushPersistentNotification = useCallback(
    (item) => {
      addOrUpdateNotification(item);
    },
    [addOrUpdateNotification]
  );

  const clearTypingState = useCallback(
    (playerId) => {
      setTypingPlayers((prev) => {
        const next = { ...prev };
        delete next[playerId];
        return next;
      });

      removeNotification(`${TYPING_NOTIFICATION_PREFIX}${playerId}`);

      const timeout = typingTimeoutsRef.current[playerId];
      if (timeout) {
        clearTimeout(timeout);
        delete typingTimeoutsRef.current[playerId];
      }
    },
    [removeNotification]
  );

  const markPlayerTyping = useCallback(
    (playerId, playerName) => {
      const isEliminated = eliminatedPlayers.some((player) => player.id === playerId);
      if (isEliminated) return;

      const notificationId = `${TYPING_NOTIFICATION_PREFIX}${playerId}`;

      setTypingPlayers((prev) => ({
        ...prev,
        [playerId]: true
      }));

      addOrUpdateNotification({
        id: notificationId,
        type: 'typing',
        message: `✍ ${playerName} is typing...`,
        createdAt: Date.now()
      });

      if (typingTimeoutsRef.current[playerId]) {
        clearTimeout(typingTimeoutsRef.current[playerId]);
      }

      clearNotificationTimer(notificationId);

      typingTimeoutsRef.current[playerId] = setTimeout(() => {
        clearTypingState(playerId);
      }, 1500);
    },
    [addOrUpdateNotification, clearNotificationTimer, clearTypingState, eliminatedPlayers]
  );

  useEffect(() => {
    const typingTimeouts = typingTimeoutsRef.current;
    const notificationTimers = notificationTimersRef.current;

    return () => {
      Object.values(typingTimeouts).forEach(clearTimeout);
      Object.values(notificationTimers).forEach(clearTimeout);
    };
  }, []);

  return {
    notifications,
    typingPlayers,
    addOrUpdateNotification,
    removeNotification,
    pushTimedNotification,
    pushPersistentNotification,
    markPlayerTyping,
    clearTypingState
  };
}