import { defaultSchema } from "rehype-sanitize";

export const markdownSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), "img"],
  attributes: {
    ...(defaultSchema.attributes || {}),
    img: ["src", "alt", "title", "width", "height"]
  }
};
