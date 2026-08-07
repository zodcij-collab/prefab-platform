"use client";

import { useEffect } from "react";
import type { PublicLanguage } from "@/data/public-site";

export function PublicLanguageAttribute({ language }: { language: PublicLanguage }) {
  useEffect(() => {
    const previousLanguage = document.documentElement.lang;
    document.documentElement.lang = language;

    return () => {
      document.documentElement.lang = previousLanguage;
    };
  }, [language]);

  return null;
}
