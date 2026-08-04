// 16 subtle "beauty" style CSS presets. Focus on skin glow, soft
// brightening, and gentle enhancement rather than heavy color tints —
// so the subject and environment stay natural like Snapchat's beauty
// modes. Applied as CSS `filter` on live camera preview and baked into
// captured photos via canvas.

export interface Filter {
  id: string;
  name: string;
  css: string;
}

export const FILTERS: Filter[] = [
  { id: "none",     name: "Natural",   css: "none" },
  { id: "glow",     name: "Glow",      css: "brightness(1.08) contrast(1.05) saturate(1.05)" },
  { id: "soft",     name: "Soft",      css: "brightness(1.06) contrast(0.96) blur(0.3px)" },
  { id: "smooth",   name: "Smooth",    css: "brightness(1.05) contrast(0.98) saturate(1.02) blur(0.5px)" },
  { id: "porcelain",name: "Porcelain", css: "brightness(1.1) contrast(0.95) saturate(0.95) blur(0.4px)" },
  { id: "radiant",  name: "Radiant",   css: "brightness(1.1) contrast(1.06) saturate(1.1)" },
  { id: "clear",    name: "Clear",     css: "brightness(1.04) contrast(1.08) saturate(1.05)" },
  { id: "fresh",    name: "Fresh",     css: "brightness(1.07) contrast(1.02) saturate(1.12)" },
  { id: "warm",     name: "Warm",      css: "brightness(1.06) contrast(1.02) saturate(1.08) sepia(0.08)" },
  { id: "peach",    name: "Peach",     css: "brightness(1.08) saturate(1.1) sepia(0.12)" },
  { id: "honey",    name: "Honey",     css: "brightness(1.07) saturate(1.15) sepia(0.14)" },
  { id: "cool",     name: "Cool",      css: "brightness(1.05) contrast(1.04) saturate(1.05) hue-rotate(-4deg)" },
  { id: "airy",     name: "Airy",      css: "brightness(1.12) contrast(0.94) saturate(1) blur(0.3px)" },
  { id: "vivid",    name: "Vivid",     css: "brightness(1.05) contrast(1.1) saturate(1.2)" },
  { id: "studio",   name: "Studio",    css: "brightness(1.06) contrast(1.08) saturate(1.06)" },
  { id: "hd",       name: "HD",        css: "brightness(1.03) contrast(1.12) saturate(1.08)" },
];

export const filterById = (id?: string) => FILTERS.find((f) => f.id === id) ?? FILTERS[0];