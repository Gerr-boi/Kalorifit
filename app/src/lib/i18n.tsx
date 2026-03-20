import { createContext, useContext, type ReactNode } from 'react';
import { nb } from '../locales/nb';
import { en } from '../locales/en';
import type { Translations } from '../locales/nb';

export type Language = 'Norsk' | 'English';

const translations: Record<Language, Translations> = { Norsk: nb, English: en };

const I18nContext = createContext<Language>('Norsk');

export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  return <I18nContext.Provider value={language}>{children}</I18nContext.Provider>;
}

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}

export function useT() {
  const lang = useContext(I18nContext);
  const dict = translations[lang] as unknown as Record<string, unknown>;
  const fallbackDict = translations['Norsk'] as unknown as Record<string, unknown>;

  return function t(key: string, vars?: Record<string, string | number>): string {
    const value = getNestedValue(dict, key);
    if (value !== undefined) return interpolate(value, vars);
    const fallback = getNestedValue(fallbackDict, key);
    return interpolate(fallback ?? key, vars);
  };
}

export function useLanguage(): Language {
  return useContext(I18nContext);
}
