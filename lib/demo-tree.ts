import type { ItemNode } from "./types";

/** Fallback tree so the item picker is usable in dry-run/demo mode. */
export const DEMO_TREE: Record<string, ItemNode[]> = {
  "/sitecore/content": [
    { itemId: "0DE95AE4-41AB-4D01-9EB0-67441B7C2450", name: "Home", path: "/sitecore/content/Home", hasChildren: true, templateName: "Sample Item" },
    { itemId: "8A2C74B7-4B1A-4E38-9D5E-2E1F1C9A7712", name: "Site A", path: "/sitecore/content/Site A", hasChildren: true, templateName: "Site" },
    { itemId: "C3F1A9E2-7D44-4B7A-8E19-55C0D9B2A331", name: "Global", path: "/sitecore/content/Global", hasChildren: false, templateName: "Folder" },
  ],
  "/sitecore/content/Home": [
    { itemId: "A1B2C3D4-1111-2222-3333-444455556666", name: "About", path: "/sitecore/content/Home/About", hasChildren: false, templateName: "Page" },
    { itemId: "B2C3D4E5-2222-3333-4444-555566667777", name: "Products", path: "/sitecore/content/Home/Products", hasChildren: true, templateName: "Page" },
    { itemId: "C3D4E5F6-3333-4444-5555-666677778888", name: "News", path: "/sitecore/content/Home/News", hasChildren: false, templateName: "Page" },
  ],
  "/sitecore/content/Home/Products": [
    { itemId: "D4E5F6A7-4444-5555-6666-777788889999", name: "Product 1", path: "/sitecore/content/Home/Products/Product 1", hasChildren: false, templateName: "Product" },
    { itemId: "E5F6A7B8-5555-6666-7777-888899990000", name: "Product 2", path: "/sitecore/content/Home/Products/Product 2", hasChildren: false, templateName: "Product" },
  ],
  "/sitecore/content/Site A": [
    { itemId: "F6A7B8C9-6666-7777-8888-99990000AAAA", name: "Landing", path: "/sitecore/content/Site A/Landing", hasChildren: false, templateName: "Page" },
  ],
};
