import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignore: [
    "packages/qortex-admin/src/components/ui/**",
    "packages/qortex-admin/src/routeTree.gen.ts",
  ],
  ignoreDependencies: ["tailwindcss", "tw-animate-css"],
};

export default config;
