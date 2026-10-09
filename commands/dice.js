const { recordRound } = require('../utils/houseBank');
const { card, gameResult, attachReplay } = require('../utils/casino');
const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const { awardPoints } = require('../utils/sentinelDb');
const { parseBet } = require('../utils/parseBet');
const { announceWin } = require('../utils/winAnnouncer');
const { trackStat, checkAchievements } = require('../utils/achievements');


module.exports = {
  name: 'dice',
  aliases: ['d'],
  description: 'Roll a die and win rewards based on your roll! `.dice <amount|all>`',
  async execute({ message, args, userData, saveUserData, client, logAdminAction }) {
    if (typeof userData.balance !== 'number') userData.balance = 0;
    const bet = parseBet(args[0], userData);

    if (!bet) {
      return message.channel.send(card({ title: '🎲 Dice', body: '> `.dice <amount|all>` — roll a die: **4** pays 1.4× · **5** pays 1.7× · **6** pays 2×.\n> Or with buttons: `.play`', footer: message.guild?.name || 'Shiro' }));
    }
    if (userData.balance < bet) {
      return message.channel.send("You don't have enough balance to play!");
    }

    // Deduct bet first
    userData.balance -= bet;

    const roll = Math.floor(Math.random() * 6) + 1; // 1-6
    let reward = 0;
    let resultLine = '';

    if (roll === 6) {
      reward = Math.floor(bet * 2);
      userData.balance += reward;
      resultLine = `> Rolled **6** — Jackpot! Reward: **${reward.toLocaleString()}** (2×)`;
    } else if (roll === 5) {
      reward = Math.floor(bet * 1.7);
      userData.balance += reward;
      resultLine = `> Rolled **5** — Big Win! Reward: **${reward.toLocaleString()}** (1.7×)`;
    } else if (roll === 4) {
      reward = Math.floor(bet * 1.4);
      userData.balance += reward;
      resultLine = `> Rolled **4** — Win! Reward: **${reward.toLocaleString()}** (1.4×)`;
    } else {
      resultLine = `> Rolled **${roll}** — you lose.`;
    }

    await saveUserData({ balance: userData.balance });
    if (reward > 0 && message.guild) {
      const pts = roll === 6 ? 20 : roll === 5 ? 12 : 8;
      await awardPoints(message.guild.id, message.author.id, pts);
    }

    recordRound('dice', bet, reward, 0, message.author.id);
    await trackStat(userData, 'gamesPlayed', 1);
    if (reward > 0) {
      await trackStat(userData, 'gamesWon', 1);
      await trackStat(userData, 'coinsWon', reward);
    }
    await saveUserData({ stats: userData.stats });
    await checkAchievements(userData, { message, saveUserData });

    const g = message.guild?.name || 'Shiro';
    const rollMsg = await message.channel.send(card({ title: '🎲 Dice', body: `# ${FACES[0]}\n> Rolling for **${bet.toLocaleString()}**…`, footer: g }));
    for (const f of [FACES[3], FACES[1], FACES[4]]) {
      await new Promise((r) => setTimeout(r, 280));
      await rollMsg.edit(card({ title: '🎲 Dice', body: `# ${f}\n> Rolling for **${bet.toLocaleString()}**…`, footer: g })).catch(() => {});
    }
    const opts = {
      emoji: '🎲', game: 'Dice', won: reward > bet ? true : false,
      headline: `${FACES[roll - 1]}  ${roll}` + (roll === 6 ? ' — JACKPOT' : roll >= 4 ? ' — win' : ' — lose'),
      lines: [resultLine.replace(/^> /, ''), `Balance **${userData.balance.toLocaleString()}**`, '-# 4 → 1.4× · 5 → 1.7× · 6 → 2×'],
      footer: g, replay: { game: 'dice', bet },
    };
    await rollMsg.edit(gameResult(opts)).catch(() => {});
    attachReplay(rollMsg, message.author.id, opts);

    if (reward > 0 && client) {
      announceWin(client, {
        userId: message.author.id, username: message.author.username,
        avatarURL: message.author.displayAvatarURL({ dynamic: true }),
        game: 'dice', bet, payout: reward, multiplier: bet > 0 ? reward / bet : 0,
        logAdminAction,
      }).catch(() => {});
    }
  }
};
