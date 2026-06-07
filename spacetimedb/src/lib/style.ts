const STYLE_BIBLE_BASE =
  'Black and white comic strip art, hand-drawn ink style, expressive cartoon characters with consistent species and proportions across scenes, clear linework, hatching for shadows, newspaper comic aesthetic, no color. Every panel is a complete comic frame with all dialogue and captions drawn inside the image as speech balloons and caption boxes with legible hand-lettered text. Never change a character\'s species or face design between panels or scenes';

export function buildStyleBible(genre: string, setting: string): string {
  return `${STYLE_BIBLE_BASE}. Setting: ${setting}. Tone: ${genre} genre.`;
}
