// commands/play.js — the game floor as a card (direct: "would you have to type to select a game on a website? no…
// they pick a game, pick a betting amount and start"). Pick a game → pick a bet → (pick a side if the game has one) →
// Start. Start runs the real game command for the clicker (client.runAs), so every check, cooldown and atomic money
// move is the same as typing it. Only the opener can drive their card.
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

// game → [label, emoji, blurb, choices (null = none): [[value, label], …]]
const GAMES = {
  mines:     ['Mines', '💣', 'Dig safe tiles, cash out before a mine.', null],
  tower:     ['Tower', '🗼', 'Climb floor by floor — one door hides a trap.', null],
  crash:     ['Crash', '📈', 'Cash out before the line crashes.', null],
  blackjack: ['Blackjack', '♠', 'Beat the dealer to 21.', null],
  slots:     ['Slots', '🎰', 'Spin for a line — jackpots exist.', null],
  plinko:    ['Plinko', '🎯', 'Drop a ball down the pegs.', null],
  wheel:     ['Wheel', '🎡', 'Spin: 0× to 5×.', null],
  cups:      ['Cups', '🥤', 'Find the coin under the right cup.', null],
  dice:      ['Dice', '🎲', 'Roll and win by your number.', null],
  coinflip:  ['Coinflip', '🪙', '50 / 50 — call it.', [['h', 'Heads'], ['t', 'Tails']]],
  roulette:  ['Roulette', '🔴', 'Red, black or green.', [['red', 'Red'], ['black', 'Black'], ['green', 'Green']]],
  rps:       ['Rock Paper Scissors', '✊', 'Beat the house hand.', [['r', 'Rock'], ['p', 'Paper'], ['s', 'Scissors']]],
  scratch:   ['Scratch card', '🎟', 'Match three — up to 1,000×.', null],
};
const BETS = [100, 1_000, 5_000, 10_000, 50_000];
const fmt = (n) => Number(n || 0).toLocaleString();

function render(st, data, guildName, disabled = false) {
  const g = st.game ? GAMES[st.game] : null;
  const c = new ContainerBuilder().setAccentColor(0xD4AF37)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## 🎲 Game floor\n-# Coins \`${fmt(data.balance)}\` · pick a game, pick a bet, play.\n-# 🏆 \`.weekly\` — the 10 most active players win SILV, coins and Aether every week · 🎡 \`.freespin\` once a day`))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('play_game')
      .setPlaceholder(g ? `${g[1]} ${g[0]}` : 'Pick a game…').setDisabled(disabled)
      .addOptions(Object.entries(GAMES).map(([k, v]) => ({ label: v[0], value: k, emoji: v[1], description: v[2].slice(0, 100), default: k === st.game })))));
  if (g) {
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `**${g[1]} ${g[0]}** — ${g[2]}\n> Bet: **${st.bet ? fmt(st.bet) : 'pick one'}**` + (g[3] ? ` · Side: **${st.choice ? g[3].find((x) => x[0] === st.choice)?.[1] : 'pick one'}**` : '')));
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      ...BETS.map((b) => new ButtonBuilder().setCustomId(`play_bet_${b}`).setLabel(b >= 1000 ? `${b / 1000}k` : String(b))
        .setStyle(st.bet === b ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(disabled))));
    const r2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('play_bet_all').setLabel('All in').setStyle(st.bet === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(disabled),
      new ButtonBuilder().setCustomId('play_custom').setLabel('Custom…').setStyle(ButtonStyle.Secondary).setDisabled(disabled));
    if (g[3]) for (const [v, l] of g[3]) r2.addComponents(new ButtonBuilder().setCustomId(`play_side_${v}`).setLabel(l)
      .setStyle(st.choice === v ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(disabled));
    c.addActionRowComponents(r2);
    const ready = st.bet && (!g[3] || st.choice);
    c.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('play_start')
      .setLabel(ready ? `Play ${g[0]}` : 'Pick a bet' + (g[3] ? ' and a side' : '')).setStyle(ButtonStyle.Success).setDisabled(disabled || !ready)));
  }
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${guildName} · every game keeps a house edge · your results: \`.history\``));
  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

module.exports = {
  name: 'play',
  aliases: ['casino', 'games', 'hub'],
  adminOnly: false,
  description: 'The game floor — pick a game and a bet with buttons, no typing.',
  GAMES,

  async execute({ message, userData, getUserData }) {
    const st = { game: null, bet: null, choice: null };
    const guildName = message.guild?.name || 'Shiro';
    const msg = await message.channel.send(render(st, userData, guildName));
    const col = msg.createMessageComponentCollector({ time: 10 * 60_000 });
    col.on('collect', async (i) => {
      if (i.user.id !== message.author.id) return i.reply({ content: 'Open your own with `.play`.', flags: MessageFlags.Ephemeral });
      const id = i.customId;
      if (id === 'play_game') { st.game = i.values[0]; st.choice = null; }
      else if (id.startsWith('play_bet_')) { const v = id.slice(9); st.bet = v === 'all' ? 'all' : parseInt(v, 10); }
      else if (id.startsWith('play_side_')) st.choice = id.slice(10);
      else if (id === 'play_custom') {
        const mid = `playm_${i.id}`;
        await i.showModal(new ModalBuilder().setCustomId(mid).setTitle('Your bet').addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('b').setLabel('Coins').setStyle(TextInputStyle.Short).setPlaceholder('2500').setRequired(true).setMaxLength(12))));
        const sub = await i.awaitModalSubmit({ time: 60_000, filter: (m) => m.customId === mid && m.user.id === i.user.id }).catch(() => null);
        if (!sub) return;
        const n = parseInt(String(sub.fields.getTextInputValue('b')).replace(/[, ]/g, ''), 10);
        if (!Number.isFinite(n) || n < 1) return sub.reply({ content: 'Enter a whole number of coins.', flags: MessageFlags.Ephemeral });
        st.bet = n;
        await sub.deferUpdate().catch(() => {});
        const fresh = await getUserData(i.user.id);
        return msg.edit(render(st, fresh, guildName)).catch(() => {});
      } else if (id === 'play_start') {
        const g = GAMES[st.game];
        if (!g || !st.bet || (g[3] && !st.choice)) return i.deferUpdate();
        await i.deferUpdate();
        const args = [String(st.bet)];
        if (st.choice) args.push(st.choice);
        await i.client.runAs(i, st.game, args);
        const fresh = await getUserData(i.user.id);
        return msg.edit(render(st, fresh, guildName)).catch(() => {});
      }
      const fresh = await getUserData(i.user.id);
      await i.update(render(st, fresh, guildName)).catch(() => {});
    });
    col.on('end', async () => {
      const fresh = await getUserData(message.author.id).catch(() => userData);
      msg.edit(render(st, fresh || userData, guildName, true)).catch(() => {});
    });
  },
};
