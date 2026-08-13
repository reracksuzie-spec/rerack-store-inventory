import { NextRequest, NextResponse } from "next/server";

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

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

export async function GET(request: NextRequest) {
  try {
    const token = await getAccessToken();

    return NextResponse.json({
      success: true,
      message: "Connected to Shopify",
      tokenReceived: Boolean(token),
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}