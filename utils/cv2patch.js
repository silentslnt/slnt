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

function embedToContainer(e) {
  const d = (e && (e.data || (typeof e.toJSON === 'function' ? e.toJSON() : e))) || {};
  const c = new ContainerBuilder();
  if (typeof d.color === 'number') c.setAccentColor(d.color);
  const head = [d.author?.name ? `-# ${d.author.name}` : '', d.title ? `## ${d.title}` : ''].filter(Boolean).join('\n');
  let body = d.description || '';
  for (const f of d.fields || []) body += `${body ? '\n\n' : ''}**${f.name}**\n${f.value}`;
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

module.exports = { embedToContainer, toV2 };
