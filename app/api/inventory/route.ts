import { NextRequest, NextResponse } from "next/server";

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

const LOCATION_NAMES = {
  warehouse: "E-Commerce/Warehouse",
  portland: "Portland Retail Store - Pick Up",
  scappoose: "ReRack Outpost @ Paddle Shack Scappoose Bay",
};

async function getAccessToken() {
  if (
    !SHOPIFY_STORE_DOMAIN ||
    !SHOPIFY_CLIENT_ID ||
    !SHOPIFY_CLIENT_SECRET
  ) {
    throw new Error("Missing Shopify environment variables");
  }

  const response = await fetch(
    `https://${SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify token request failed: ${text}`);
  }

  const data = await response.json();

  return data.access_token;
}

function getStockStatus(quantity: number) {
  if (quantity <= 0) {
    return "out_of_stock";
  }

  if (quantity < 4) {
    return "low_stock";
  }

  return "in_stock";
}

function getAvailableQuantity(level: any) {
  return (
    level?.quantities?.find(
      (item: any) => item.name === "available"
    )?.quantity ?? 0
  );
}

export async function GET(request: NextRequest) {
  try {
    const productId = request.nextUrl.searchParams.get("product_id");
    const variantId = request.nextUrl.searchParams.get("variant_id");

    if (!productId && !variantId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing product_id or variant_id",
        },
        { status: 400 }
      );
    }

    const token = await getAccessToken();

    let query = "";
    let variables: Record<string, string> = {};

    if (variantId) {
      const variantGid = variantId.startsWith(
        "gid://shopify/ProductVariant/"
      )
        ? variantId
        : `gid://shopify/ProductVariant/${variantId}`;

      query = `
        query VariantInventory($id: ID!) {
          productVariant(id: $id) {
            id
            sku
            title
            inventoryItem {
              inventoryLevels(first: 50) {
                nodes {
                  location {
                    id
                    name
                  }
                  quantities(names: ["available"]) {
                    name
                    quantity
                  }
                }
              }
            }
          }
        }
      `;

      variables = {
        id: variantGid,
      };
    } else {
      const productGid = productId!.startsWith(
        "gid://shopify/Product/"
      )
        ? productId!
        : `gid://shopify/Product/${productId}`;

      query = `
        query ProductInventory($id: ID!) {
          product(id: $id) {
            id
            title
            variants(first: 1) {
              nodes {
                id
                sku
                title
                inventoryItem {
                  inventoryLevels(first: 50) {
                    nodes {
                      location {
                        id
                        name
                      }
                      quantities(names: ["available"]) {
                        name
                        quantity
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      variables = {
        id: productGid,
      };
    }

    const response = await fetch(
      `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2026-07/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({
          query,
          variables,
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shopify GraphQL request failed: ${text}`);
    }

    const data = await response.json();

    if (data.errors) {
      return NextResponse.json(
        {
          success: false,
          errors: data.errors,
        },
        { status: 500 }
      );
    }

    let variant;

    if (variantId) {
      variant = data.data?.productVariant;
    } else {
      variant = data.data?.product?.variants?.nodes?.[0];
    }

    if (!variant) {
      return NextResponse.json(
        {
          success: false,
          error: "Product variant not found",
        },
        { status: 404 }
      );
    }

    const inventoryLevels =
      variant.inventoryItem?.inventoryLevels?.nodes ?? [];

    function findLocationInventory(locationName: string) {
  const level = inventoryLevels.find(
    (item: any) => item.location?.name === locationName
  );

  if (!level) {
    return null;
  }

  const quantity = getAvailableQuantity(level);

  return {
    location: locationName,
    quantity,
    status: getStockStatus(quantity),
  };
}

   const warehouse = findLocationInventory(
  LOCATION_NAMES.warehouse
);

const portland = findLocationInventory(
  LOCATION_NAMES.portland
);

const scappoose = findLocationInventory(
  LOCATION_NAMES.scappoose
);

const pickupLocations = [portland, scappoose].filter(
  (location) => location !== null
);

return NextResponse.json({
  success: true,
  product: productId
    ? {
        id: data.data?.product?.id ?? null,
        title: data.data?.product?.title ?? null,
      }
    : null,
  variant: {
    id: variant.id,
    sku: variant.sku,
    title: variant.title,
  },
  shipping: warehouse,
  pickup: pickupLocations,
});
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 500 }
    );
  }
}