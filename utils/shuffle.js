// utils/shuffle.js — a fair shuffle. `arr.sort(() => Math.random() - 0.5)` is NOT uniform: in Tower it made
// one door a trap far less often than it should be (Easy door 2: 19% instead of 33%), so always picking it
// beat the house. Fisher–Yates with crypto randomness gives every order the same chance.
const { randomInt } = require('crypto');

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { shuffle };
