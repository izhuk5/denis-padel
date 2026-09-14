import data from "../data/content.json";

/* Every editable string, list and image reference on the public site lives in
   src/data/content.json. The admin panel edits that same shape, so a field
   added here is a field the admin can already render. */
export const content = data;

/* astro:assets needs a real imported asset, not a path string, to emit the
   optimised AVIF sources. content.json can only store a file name, so the
   whole image folder is globbed eagerly at build time and looked up by name.
   Unused entries are tree-shaken — only images an entry actually references
   get processed. */
const images = import.meta.glob("../assets/images/*.{png,jpg,jpeg,webp}", {
  eager: true,
  import: "default",
});

/* The admin image picker can only offer files that already exist in the
   repo — with no server there is nowhere to upload a new one to. */
export const imageChoices = Object.entries(images)
  .map(([path, asset]) => ({
    name: path.split("/").pop(),
    src: asset.src,
    width: asset.width,
    height: asset.height,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function image(name) {
  const asset = images[`../assets/images/${name}`];

  if (!asset) {
    throw new Error(
      `content.json references the image "${name}", which is not in src/assets/images/. ` +
        `Available: ${Object.keys(images)
          .map((path) => path.split("/").pop())
          .join(", ")}`,
    );
  }

  return asset;
}
