import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";

export default defineConfig({
  title: "SmartAgentKit",
  description:
    "Open-source SDK for deploying policy-governed smart wallets for AI agents on EVM chains",
  base: "/",

  head: [["link", { rel: "icon", href: "/logo.svg" }]],

  themeConfig: {
    logo: "/logo.svg",

    nav: [
      { text: "Getting Started", link: "/getting-started/introduction" },
      { text: "Guides", link: "/guides/wallet-creation" },
      { text: "API Reference", link: "/api/sdk/client" },
      { text: "Examples", link: "/examples/" },
      { text: "For LLMs", link: "/llm-api-reference" },
    ],

    sidebar: {
      "/": [
        {
          text: "Getting Started",
          items: [
            {
              text: "Introduction",
              link: "/getting-started/introduction",
            },
            { text: "Quickstart", link: "/getting-started/quickstart" },
            {
              text: "Installation",
              link: "/getting-started/installation",
            },
            {
              text: "Core Concepts",
              link: "/getting-started/concepts",
            },
          ],
        },
        {
          text: "Guides",
          items: [
            {
              text: "Wallet Creation",
              link: "/guides/wallet-creation",
            },
            {
              text: "Policy Configuration",
              link: "/guides/policy-configuration",
            },
            { text: "Session Keys", link: "/guides/session-keys" },
            {
              text: "LangChain Integration",
              link: "/guides/langchain-integration",
            },
            { text: "Testing", link: "/guides/testing" },
            { text: "CLI Usage", link: "/guides/cli-usage" },
            { text: "Deployment", link: "/guides/deployment" },
          ],
        },
        {
          text: "Examples",
          items: [
            { text: "Overview", link: "/examples/" },
            {
              text: "DeFi Trading Agent",
              link: "/examples/defi-trading-agent",
            },
            {
              text: "Treasury Management",
              link: "/examples/treasury-management",
            },
            {
              text: "Payment Distribution",
              link: "/examples/payment-distribution",
            },
            {
              text: "Monitoring & Alerts",
              link: "/examples/monitoring-alerts",
            },
            {
              text: "Arbitrage Agent",
              link: "/examples/arbitrage-agent",
            },
          ],
        },
        {
          text: "Security",
          items: [
            { text: "Security Model", link: "/security/model" },
            { text: "Best Practices", link: "/security/best-practices" },
          ],
        },
        {
          text: "Community",
          items: [
            { text: "Contributing", link: "/contributing" },
            { text: "Changelog", link: "/changelog" },
          ],
        },
      ],

      "/api/": [
        {
          text: "SDK",
          items: [
            { text: "SmartAgentKitClient", link: "/api/sdk/client" },
            { text: "Types", link: "/api/sdk/types" },
            { text: "Policies", link: "/api/sdk/policies" },
            { text: "Sessions", link: "/api/sdk/sessions" },
            { text: "Presets", link: "/api/sdk/presets" },
            { text: "Constants", link: "/api/sdk/constants" },
            { text: "Errors", link: "/api/sdk/errors" },
            { text: "Deployments", link: "/api/sdk/deployments" },
          ],
        },
        {
          text: "CLI",
          items: [
            { text: "Command Reference", link: "/api/cli" },
          ],
        },
        {
          text: "LangChain",
          items: [{ text: "Tools", link: "/api/langchain" }],
        },
        {
          text: "Testing",
          items: [
            {
              text: "MockSmartAgentKitClient",
              link: "/api/testing",
            },
          ],
        },
        {
          text: "Contracts (Solidity)",
          items: [
            {
              text: "SpendingLimitHook",
              link: "/api/contracts/spending-limit-hook",
            },
            {
              text: "AllowlistHook",
              link: "/api/contracts/allowlist-hook",
            },
            {
              text: "EmergencyPauseHook",
              link: "/api/contracts/emergency-pause-hook",
            },
            {
              text: "AutomationExecutor",
              link: "/api/contracts/automation-executor",
            },
          ],
        },
      ],
    },

    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/smartagentkit/smartagentkit",
      },
    ],

    editLink: {
      pattern:
        "https://github.com/smartagentkit/smartagentkit/edit/main/apps/docs/:path",
    },

    search: {
      provider: "local",
    },

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 SmartAgentKit Contributors",
    },
  },

  vite: {
    plugins: [llmstxt()],
  },
});
