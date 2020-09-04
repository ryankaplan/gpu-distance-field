# gpu-distance-field

This library efficiently generates distance fields of 2D images. It has no dependencies and doesn't use any WebGL extensions, and it's fast enough to generate distance fields for dynamically changing content.

Caveats:

- It generates unsigned distance fields.
- It's output is lower quality than CPU methods like [TinySDF](https://github.com/mapbox/tiny-sdf). Still, it's fine for fun 2D demos and games.

## How it works

It uses a GPU implementation of an algorithm called jump flooding. I wrote a blog post on how it works that you can find [here](http://rykap.com/graphics/skew/2016/02/25/voronoi-diagrams/). Or you can skip right to the paper that it's based [on](http://www.comp.nus.edu.sg/~tants/jfa.html).
