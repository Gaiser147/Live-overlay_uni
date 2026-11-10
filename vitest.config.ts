import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "md-as-text",
      transform(code, id) {
        if (id.endsWith(".md")) return { code: `export default ${JSON.stringify(code)};`, map: null };
        return null;
      },
    },
  ],
  test: {
    include: ["app/src/**/*.test.ts", "proxy/test/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
  },
});
