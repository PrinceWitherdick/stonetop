# Tab Rail Icon Attribution

The glyphs worn by the vertical tab rail on the character, steading and NPC sheets.

Icons sourced from [game-icons.net](https://github.com/game-icons/icons),
licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

Where our filename differs from the original, the game-icons.net source name is listed too.

| Icon | Tab | game-icons.net source | Artist | Artist page |
|------|-----|-----------------------|--------|-------------|
| move.svg | Moves | move | Delapouite | https://delapouite.com |
| three-friends.svg | Followers, Residents | three-friends | Delapouite | https://delapouite.com |
| school-bag.svg | Inventory | school-bag | Delapouite | https://delapouite.com |
| info.svg | Details | info | Delapouite | https://delapouite.com |
| newspaper.svg | Post-Death | newspaper | Delapouite | https://delapouite.com |
| round-star.svg | Special Moves | round-star | Delapouite | https://delapouite.com |
| notebook.svg | Notes | notebook | Delapouite | https://delapouite.com |
| village.svg | Overview (steading) | village | Delapouite | https://delapouite.com |
| hammer-nails.svg | Improvements | hammer-nails | Lorc | https://lorcblog.blogspot.com |
| hazard-sign.svg | Threats & Dangers | hazard-sign | Lorc | https://lorcblog.blogspot.com |
| hearts.svg | Relationships | hearts | Skoll | https://game-icons.net |
| crossed-swords.svg | Stats (NPC), Overview (character) | crossed-swords | Lorc | https://lorcblog.blogspot.com |

No artwork above is altered. Every rail icon is worn as a CSS *mask* (`-webkit-mask` /
`mask`, tinted by `background-color`) so one glyph can take the rail's rest, hover and
active colours, which means each file must carry alpha ONLY where the glyph is. The eight
icons exported from game-icons.net already ship that way — a 512x512 background square at
`fill-opacity="0"` behind an opaque glyph — and so does `hearts.svg`, which is a byte copy
of `assets/icons/hearts.svg`, already in the tree for the relationship hearts.

`village.svg`, `hammer-nails.svg`, `hazard-sign.svg`, `crossed-swords.svg`, `round-star.svg`
and `school-bag.svg` were taken from the game-icons.net repository instead, where the same
drawings are stored INVERTED — an opaque black background square under a white glyph, which
as a mask would resolve to a solid slab. Their background square (and only that square) was
punched transparent to match the export form: `<path d="M0 0h512v512H0z"/>` became
`<path d="M0 0h512v512H0z" fill="#ffffff" fill-opacity="0"/>`. The glyph path in each is
untouched.

Not listed above, because it comes from the Stonetop books rather than game-icons.net:
`lightbearer-sun.svg`, the Invocations tab's glyph. Invocations are the Lightbearer's own
move set, so the tab wears the Lightbearer's playbook mark. It is a trace of
`assets/icons/playbooks/the_lightbearer_icon.webp`, which is a lossy WEBP with no alpha at
all — black ink on an opaque white square, and so a solid slab if used as a mask directly.
`scripts/trace-icon-svg.js` vectorizes it (Chromium decodes, marching squares finds every
boundary loop, Douglas-Peucker simplifies, one `fill-rule="evenodd"` path carves the sun's
centre and the ring's interior as holes). Traced at source resolution and not redrawn, so
the hand-inked roughness and the ink flecks are the book's own; re-run the script if the
source art is ever replaced.

Also not from game-icons.net, and the project's own drawing rather than either:
`arcanum.svg`, the Arcana tab's glyph. It is the triple spiral from
`assets/icons/arcanum.svg` — generated geometry, redrawn from the mark the rulebooks print
beside an arcanum (Book II p.545) — with the dark octagon token dropped, since an opaque
octagon cannot be masked. Its two deliberate differences from the octagon version are in
the file's own comment.
