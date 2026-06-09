const STYLE_BIBLE_BASE =
  'Black and white comic strip art, hand-drawn ink style, expressive human cartoon characters with consistent face, hair, and body proportions across scenes, clear linework, hatching for shadows, newspaper comic aesthetic, no color. Every panel is a complete comic frame with all dialogue and captions drawn inside the image as speech balloons and caption boxes with legible hand-lettered text. All characters are human adults unless explicitly described otherwise. Never change a character\'s face or body design between panels or scenes. Never depict human characters as animals.';

export function buildStyleBible(genre: string, setting: string): string {
  return `${STYLE_BIBLE_BASE}. Setting: ${setting}. Tone: ${genre} genre.`;
}
