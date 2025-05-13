// Create a shared state module
const activeRooms = new Set();
const roomUsers = new Map();

module.exports = {
  activeRooms,
  roomUsers
};
