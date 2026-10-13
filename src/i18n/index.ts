import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

import en from "./en.json";
import sw from "./sw.json";

/**
 * We use createInstance() instead of importing the i18next default export.
 * Reason: i18next's default export also exposes named members with the same
 * names (use, changeLanguage, etc.), which trips the ESLint rule
 * `import/no-named-as-default-member` and hides real bugs. createInstance()
 * gives us an isolated instance with a clean type surface.
 */
const i18n = createInstance();

const deviceLang = Localization.getLocales()[0]?.languageCode ?? "en";
const fallback: "en" | "sw" = deviceLang === "sw" ? "sw" : "en";

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    sw: { translation: sw },
  },
  lng: fallback,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  compatibilityJSON: "v4",
});

// Fire-and-forget hydration. i18n emits a languageChanged event when done,
// which react-i18next listens to, so the UI re-renders automatically.
void AsyncStorage.getItem("lang").then((saved) => {
  if (saved && saved !== i18n.language) {
    void i18n.changeLanguage(saved);
  }
});

export default i18n;
