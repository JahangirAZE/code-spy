function generateRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '0123456789';

  let code = 'SPY-';

  for (let i = 0; i < 2; i++) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }

  for (let i = 0; i < 2; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }

  return code;
}

module.exports = { generateRoomCode };