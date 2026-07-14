/**
 * Content tree browsing via the Authoring GraphQL API.
 * Used by the item picker to let users select what to migrate.
 */
import { SitecoreClient } from "./client";
import { sitecoreConfig } from "./config";
import type { ItemNode } from "../types";

interface GqlItem {
  itemId: string;
  name: string;
  path: string;
  hasChildren: boolean;
  template?: { name?: string };
  children?: { nodes: GqlItem[] };
}

const CHILDREN_QUERY = `
  query BrowseItem($path: String!) {
    item(where: { database: "master", path: $path }) {
      itemId
      name
      path
      hasChildren
      template { name }
      children(first: 100) {
        nodes {
          itemId
          name
          path
          hasChildren
          template { name }
        }
      }
    }
  }
`;

export async function browseChildren(
  client: SitecoreClient,
  path: string
): Promise<ItemNode[]> {
  const res = await client.request<{
    data?: { item?: GqlItem };
    errors?: { message: string }[];
  }>(sitecoreConfig.authoringGraphQL, {
    method: "POST",
    json: { query: CHILDREN_QUERY, variables: { path } },
  });

  if (res.errors?.length) {
    throw new Error(`GraphQL error: ${res.errors.map((e) => e.message).join("; ")}`);
  }
  const nodes = res.data?.item?.children?.nodes ?? [];
  return nodes.map((n) => ({
    itemId: n.itemId,
    name: n.name,
    path: n.path,
    hasChildren: n.hasChildren,
    templateName: n.template?.name,
  }));
}
