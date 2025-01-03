import { translateAndConvert } from "../lib/translate";

export async function translateText(text: string): Promise<string> {
  try {
    // 如果文本已经是英文，直接返回
    if (/^[a-zA-Z0-9\s]+$/.test(text)) {
      return text;
    }

    const translated = await translateAndConvert(text);

    return translated;
  } catch (error) {
    console.error(`Failed to translate "${text}":`, error);
    // 翻译失败时返回原文
    return text;
  }
}
