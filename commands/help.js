// commands/help.js — one CV2 card, same look as Sentinel's ,help (direct: "Sentinel's help redesign is amazing,
// why isn't Shiro's like that"): an overview, a section picker, each section as compact command chips, and the
// Terms / Privacy links. The card edits in place (no new messages); only the person who opened it can switch it.
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, ThumbnailBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');

const BLACK = 0x000000;
const TOS_URL = 'https://app.notion.com/p/Terms-of-Service-Shiro-3edf8824fc1180e18603dc791550b243?source=copy_link';
const PRIVACY_URL = 'https://app.notion.com/p/Privacy-Policy-Shiro-3edf8824fc118091bf82d9d6a0ac339f?source=copy_link';
// key: [label, one-line blurb, [[command, alias], …], note]
const SECTIONS = {
  wallet: ['Wallet', 'Balance, daily, missions, trading', [
    ['bal', 'b'], ['daily', 'day'], ['freespin', 'fs'], ['missions', 'ms'], ['profile', 'pf'], ['inventory', ''],
    ['invest', 'vault'], ['gift', 'give'], ['tip', 'send'], ['trade', ''], ['convert', 'swap'], ['payout', 'cashout'],
  ], 'Coins you give or trade lose a 10% transfer fee. `.convert` turns coins into SILV and SILV into Sentinel Aether.'],
  games: ['Games', 'Every game, one bet each', [
    ['play', 'hub'], ['blackjack', 'bj'], ['slots', 'sl'], ['coinflip', 'cf'], ['roulette', 'rl'], ['dice', 'd'], ['rps', ''],
    ['mines', 'mn'], ['minesweeper', 'msw'], ['plinko', 'pl'], ['crash', 'cr'], ['tower', 'tw'], ['cups', ''], ['wheel', 'wh'],
    ['overunder', 'ou'], ['scratch', 'sc'], ['duel', 'dl'], ['history', 'hist'], ['weekly', 'wlb'],
    ['rpsduel', 'rpsd'], ['flipduel', 'cfd'], ['connect4', 'c4'], ['battleship', 'bship'],
  ], '`.<game> <bet|all>` — or `.play` to pick one with buttons. vs players: `.rpsduel` `.flipduel` `.connect4` `.battleship` `@user <bet>` (winner takes the pot, 5% fee). `.weekly`: the 10 most active players and the 10 most active chatters win SILV and coins every week.'],
  chat: ['Chat games', 'Started by staff in the game channel', [
    ['wordscramble', 'ws'], ['hangman', ''], ['guess', ''], ['cipher', ''], ['redeem', 'rd'],
  ], 'Type the answer in the game channel to win. `.rd` claims a dropped key.'],
  shop: ['Shop & SILV', 'Spend coins and SILV', [
    ['shop', 'sh'], ['store', 'market'], ['artifact', 'ashop'], ['silvexchange', 'sx'], ['rate', ''],
  ], '1 SILV = 10 Robux. `.store` sells Sentinel items (spells, gear, Fate Shards, Revive Tokens) delivered straight to your game bag.'],
  keys: ['Keys & characters', 'Open keys, roll and battle characters', [
    ['open', ''], ['openmysterybox', ''], ['roll', ''], ['characters', ''], ['charinfo', ''], ['battle', ''],
  ], ''],
  progress: ['Progress', 'Levels, achievements, boards', [
    ['achievements', 'ach'], ['leaderboard', 'lb'], ['livelb', ''], ['lottery', 'lot'],
  ], ''],
};

const chips = (list) => list.map(([c, a]) => `\`${c}\`${a ? ` *${a}*` : ''}`).join(' · ');

function render(page, client, guildName) {
  const c = new ContainerBuilder().setAccentColor(BLACK);
  if (page === 'home') {
    c.addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        "## Shiro\n-# Prefix `.` · bets take `all` or `max` · Sentinel's brother — what you do here helps you there"))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(client.user.displayAvatarURL())));
    c.addSeparatorComponents(new SeparatorBuilder());
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      Object.values(SECTIONS).map(([label, blurb]) => `> **${label}** — ${blurb}`).join('\n')
      + '\n-# Start here: `.daily` · `.freespin` · `.play`'));
  } else {
    const [label, blurb, list, note] = SECTIONS[page];
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${label}\n-# ${blurb}`));
    c.addSeparatorComponents(new SeparatorBuilder());
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`> ${chips(list)}` + (note ? `\n-# ${note}` : '')));
  }
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('help_pick').setPlaceholder('Pick a section…').addOptions(
      [{ label: 'Overview', value: 'home', default: page === 'home' },
        ...Object.entries(SECTIONS).map(([k, [label, blurb]]) => ({ label, value: k, description: blurb.slice(0, 100), default: page === k }))])));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Terms of Service').setURL(TOS_URL),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Privacy Policy').setURL(PRIVACY_URL)));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${guildName}`));
  return { components: [c], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

module.exports = {
  name: 'help',
  aliases: ['h', 'cmds'],
  adminOnly: false,
  description: 'Every Shiro command on one card. `.help [section]`',

  async execute({ message, args, client }) {
    const want = (args[0] || '').toLowerCase();
    let page = SECTIONS[want] ? want
      : (want && Object.keys(SECTIONS).find((k) => SECTIONS[k][0].toLowerCase().startsWith(want))) || 'home';
    const bot = client || message.client;
    const guildName = message.guild?.name || 'Shiro';
    const msg = await message.channel.send(render(page, bot, guildName));
    const col = msg.createMessageComponentCollector({ time: 180_000 });
    col.on('collect', async (i) => {
      if (i.user.id !== message.author.id) return i.reply({ content: 'Open your own with `.help`.', flags: MessageFlags.Ephemeral }).catch(() => {});
      page = i.values[0];
      await i.update(render(page, bot, guildName)).catch(() => {});
    });
  },
};
