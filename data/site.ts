export const company = {
  name: "PREFAB.LV SIA",
  registrationNumber: "40003009726",
  address: "Pērnavas iela 30, Rīga",
  email: "info@prefab.lv",
  website: "https://www.prefab.lv",
} as const;

export const socialLinks = [
  { name: "LinkedIn", url: process.env.NEXT_PUBLIC_LINKEDIN_URL || "" },
  { name: "Instagram", url: process.env.NEXT_PUBLIC_INSTAGRAM_URL || "" },
  { name: "Facebook", url: process.env.NEXT_PUBLIC_FACEBOOK_URL || "" },
] as const;

export const whatsappNumber=process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g,"")||"";
