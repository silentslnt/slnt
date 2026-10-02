// utils/cv2patch.js — every embed Shiro sends becomes a Components V2 card.
// Loaded once at the top of index.js. Wraps send/reply/edit/update/followUp
// so the 180+ existing `{ embeds: [...] }` calls render as CV2 containers
// (title/description/fields/image/footer) without touching each command.
// If Discord rejects a converted payload (e.g. editing an old non-V2
// message), it falls back to the original embed — never breaks a command.
const {
  MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder,
  ThumbnailBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
  TextChannel, DMChannel, ThreadChannel, NewsChannel, VoiceChannel, Message,
  ChatInputCommandInteraction, MessageComponentInteraction, ModalSubmitInteraction, ButtonInteraction,
  StringSelectMenuInteraction,
} = require('discord.js');

const V2 = MessageFlags.IsComponentsV2;

// Game cards show who's playing at the top (direct: "it should have the player's name at top… on cashouts and wins too").
// index.js runs every game command inside asPlayer(user, …); the first card it posts gets a name line, and every later
// edit/update of that card keeps it (cashouts, replays, results) — no game file has to know about it.
const { AsyncLocalStorage } = require('async_hooks');
const playerCtx = new AsyncLocalStorage();
const GAME_COMMANDS = new Set(['blackjack', 'coinflip', 'crash', 'cups', 'dice', 'mines', 'minesweeper', 'overunder', 'plinko',
  'roulette', 'rps', 'slots', 'tower', 'wheel', 'spin']);
const MARK = '-# 🎮 ';
function asPlayer(user, name, fn) {
  if (!user || !GAME_COMMANDS.has(name)) return fn();
  return playerCtx.run(`${MARK}**${user.globalName || user.username}** is playing`, fn);
}
function firstText(c) {
  const j = c && (typeof c.toJSON === 'function' ? c.toJSON() : c);
  const t = j?.components?.[0];
  return t && t.type === 10 ? t.content : null;
}
function stamp(opts, line) {
  if (!line || !opts || typeof opts !== 'object' || !Array.isArray(opts.components) || !opts.components.length) return opts;
  if (!((typeof opts.flags === 'number' ? opts.flags : 0) & V2)) return opts;
  const c = opts.components[0];
  if (!(c instanceof ContainerBuilder) || (firstText(c) || '').startsWith(MARK)) return opts;
  const copy = new ContainerBuilder(c.toJSON());
  copy.spliceComponents(0, 0, new TextDisplayBuilder().setContent(line));
  return { ...opts, components: [copy, ...opts.components.slice(1)] };
}
function lineOf(msg) {
  const t = firstText(msg?.components?.[0]);
  return t && t.startsWith(MARK) ? t : null;
}

// SHOUTED TITLES ("DAILY REWARD") read as Title Case on a card; mixed-case titles are left alone.
function titleCase(t) {
  const str = String(t);
  if (str !== str.toUpperCase() || !/[A-Z]/.test(str)) return str;
  return str.toLowerCase().replace(/(^|[\s—–-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
}

function embedToContainer(e) {
  const d = (e && (e.data || (typeof e.toJSON === 'function' ? e.toJSON() : e))) || {};
  const c = new ContainerBuilder();
  if (typeof d.color === 'number') c.setAccentColor(d.color);
  const head = [d.author?.name ? `-# ${d.author.name}` : '', d.title ? `## ${titleCase(d.title)}` : ''].filter(Boolean).join('\n');
  let body = d.description || '';
  // inline fields become one compact stat strip; block fields get the house style (__**Label**__ then > lines)
  const fields = d.fields || [];
  let strip = [];
  const flush = () => { if (strip.length) { body += `${body ? '\n\n' : ''}${strip.join('  ·  ')}`; strip = []; } };
  for (const f of fields) {
    const v = String(f.value ?? '');
    if (f.inline && !v.includes('\n') && v.length <= 60) { strip.push(`**${f.name}** ${v}`); continue; }
    flush();
    const quoted = v.split('\n').map((l) => (l.startsWith('>') || l.startsWith('-#') || !l.trim() ? l : `> ${l}`)).join('\n');
    body += `${body ? '\n\n' : ''}__**${f.name}**__\n${quoted}`;
  }
  flush();
  const top = head || body || '​';
  const rest = head ? body : '';
  if (d.thumbnail?.url) {
    c.addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(top))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(d.thumbnail.url)));
  } else {
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(top));
  }
  if (rest) {
    c.addSeparatorComponents(new SeparatorBuilder());
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(rest));
  }
  if (d.image?.url) c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(d.image.url)));
  if (d.footer?.text) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${d.footer.text}`));
  return c;
}

function toV2(opts) {
  if (!opts || typeof opts !== 'object' || !Array.isArray(opts.embeds) || !opts.embeds.length) return null;
  const out = { ...opts };
  const comps = [];
  if (out.content) comps.push(new TextDisplayBuilder().setContent(out.content));
  for (const e of out.embeds) comps.push(embedToContainer(e));
  for (const row of out.components || []) comps.push(row);
  delete out.embeds;
  delete out.content;
  out.components = comps;
  let flags = typeof out.flags === 'number' ? out.flags : 0;
  if (out.ephemeral) { flags |= MessageFlags.Ephemeral; delete out.ephemeral; }
  out.flags = flags | V2;
  return out;
}

function wrap(proto, method) {
  if (!proto || typeof proto[method] !== 'function' || proto[method].__cv2) return;
  const orig = proto[method];
  const patched = async function (opts, ...rest) {
    try {
      const line = playerCtx.getStore() || (method === 'edit' ? lineOf(this) : method === 'update' ? lineOf(this.message) : null);
      if (line) opts = stamp(opts, line);
    } catch { /* never block a send over the name line */ }
    const v2 = toV2(opts);
    if (!v2) return orig.call(this, opts, ...rest);
    try {
      return await orig.call(this, v2, ...rest);
    } catch (err) {
      return orig.call(this, opts, ...rest); // e.g. editing a legacy embed message — keep it working
    }
  };
  patched.__cv2 = true;
  proto[method] = patched;
}

for (const C of [TextChannel, DMChannel, ThreadChannel, NewsChannel, VoiceChannel]) wrap(C?.prototype, 'send');
for (const m of ['reply', 'edit']) wrap(Message.prototype, m);
for (const C of [ChatInputCommandInteraction, MessageComponentInteraction, ModalSubmitInteraction, ButtonInteraction, StringSelectMenuInteraction]) {
  for (const m of ['reply', 'editReply', 'followUp', 'update']) wrap(C?.prototype, m);
}

module.exports = { embedToContainer, toV2, asPlayer, _stamp: stamp, _lineOf: lineOf };
