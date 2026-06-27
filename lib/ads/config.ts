export const ADS_CONFIG = {
  enabled: process.env.NEXT_PUBLIC_ADS_ENABLED === "true",
  scripts: {
    socialBar: process.env.NEXT_PUBLIC_AD_SOCIAL_BAR_SRC ?? "",
    nativeBanner: process.env.NEXT_PUBLIC_AD_NATIVE_BANNER_SRC ?? "",
    popunder: process.env.NEXT_PUBLIC_AD_POPUNDER_SRC ?? "",
  },
  containerId: {
    // Container ID untuk Native Banner (dari div id="container-...")
    nativeBanner: "container-34af5f0d62c250d55045579424f8b61c",
  },
} as const;
