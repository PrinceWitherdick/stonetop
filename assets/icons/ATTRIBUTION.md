# Interface Icon Attribution

## game-icons.net

Icons sourced from [game-icons.net](https://github.com/game-icons/icons),
licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

Where our filename differs from the original, the game-icons.net source name is listed too.

| Icon | game-icons.net source | Artist | Artist page |
|------|-----------------------|--------|-------------|
| broken-heart.svg | broken-heart | Lorc | https://lorcblog.blogspot.com |
| hearts.svg | hearts | Skoll | https://game-icons.net |
| move.svg | move | Delapouite | https://delapouite.com |

`move.svg` recolours the glyph and sets it on the system's dark octagon token; the artwork
itself is unchanged.

## The project's own drawings

Not listed above, because they are the project's own work rather than third-party
assets: `treasures/vase.svg` and `arcanum.svg`. Both are redrawn from category symbols the
rulebooks use — the treasure vase, and the triple spiral printed beside an arcanum (Book II
p.545). They are marks, not illustrations: neither reproduces any book artwork, and neither
depicts any particular item. `arcanum.svg` is generated geometry (three Archimedean spirals
at 120 degrees); the recipe and its numbers are in the file's own comment.

## Font Awesome Free

`followers/new-shoot.svg` carries the "seedling" icon from
[Font Awesome Free](https://github.com/FortAwesome/Font-Awesome) 6.7.2 (solid), licensed
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Copyright 2024 Fonticons,
Inc. As with `move.svg` above, our copy recolours the glyph and sets it on a disc; the
outline itself is unchanged. The upstream notice is kept inside the file, which is what
that licence asks for.

| Icon | Font Awesome source | Style | Licence |
|------|---------------------|-------|---------|
| followers/new-shoot.svg | seedling | Free, solid | CC BY 4.0 |

Two things worth knowing about this one. It is the **Free** distribution, fetched from the
Font Awesome Free repository, and deliberately not the copy Foundry bundles: Foundry ships
Font Awesome **Pro** under its own commercial licence, and Pro outlines may not be
redistributed in this package. And it is the same drawing a follower card already shows,
since the card renders `fas fa-seedling` as a font glyph and an Actor's `img` has to be a
file. Only the initiate of Danu uses it. Our copy reads the same way round as the Book I
creature-type marks in `bestiary/`, a black field carrying the drawing in cream over a disc
that shows past it as a hairline rim, so a shelf of follower actors reads as one set with
the monsters; the recipe and its numbers are in the file's own comment.

`note-caret.svg` is the project's own work too, and owes nothing to any source: it is three
line coordinates and a round-capped stroke, drawn wide and shallow for the expand control
under a relationship card's note. Its geometry is in the file's own comment.

`people/default_profile.svg` is not a separate icon at all: it is a byte copy of
`bestiary/human-individual.svg`, the Book I p.392 "human, individual" creature-type mark,
artwork unchanged. It lives at its own path so an un-portraited person stays distinguishable
from a human-type monster wearing that same mark as its art; the file's own comment has the
reasoning.
