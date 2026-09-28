# Season Glyph Attribution

The four seasons as small glyphs for the weather-and-season bar at the top of the screen
(`module/seasons/time-banner.js`). They stand in for the book's season art (the `*_icon.svg`
files one folder up) at that size only: those are traced bitmaps, and at about 24px their edges
break up into stair-steps. The Chronicle and the location journals still use the book's art.

Icons sourced from [game-icons.net](https://github.com/game-icons/icons),
licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

Our filenames are named for the SEASON rather than for the drawing, so the game-icons.net
source name is listed for every one.

| Icon | Season | game-icons.net source | Artist | Artist page |
|------|--------|-----------------------|--------|-------------|
| spring.svg | Spring | sprout | Lorc | https://lorcblog.blogspot.com |
| summer.svg | Summer | sunflower | Delapouite | https://delapouite.com |
| autumn.svg | Autumn | maple-leaf | Lorc | https://lorcblog.blogspot.com |
| winter.svg | Winter | snowflake-2 | Lorc | https://lorcblog.blogspot.com |

One change from the originals: the repository files open with an opaque 512x512 backing square,
which would mask in the whole tile. It is made transparent
(`<path d="M0 0h512v512H0z" fill="#fff" fill-opacity="0"/>`), the same way the icons downloaded
from the site ship. The drawings themselves are unaltered. Every glyph is worn as a CSS *mask*
tinted by `background-color`, so its colour comes from the bar's season light.
