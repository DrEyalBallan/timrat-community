import { NextRequest, NextResponse } from "next/server";
import { generateUploadSignature } from "@/lib/cloudinary";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    let folder = "timrat-community";
    let tags = "timrat_new_year";

    try {
      const body = await request.json();
      if (body?.folder) folder = body.folder;
      if (body?.tags) tags = body.tags;
    } catch {}

    const signData = generateUploadSignature(folder, tags);
    return NextResponse.json(signData);
  } catch (error: any) {
    console.error("Signature generation error:", error);
    return NextResponse.json({ error: "Failed to generate upload signature" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const folder = searchParams.get("folder") || "timrat-community";
    const tags = searchParams.get("tags") || "timrat_new_year";

    const signData = generateUploadSignature(folder, tags);
    return NextResponse.json(signData);
  } catch (error: any) {
    console.error("Signature generation error (GET):", error);
    return NextResponse.json({ error: "Failed to generate upload signature" }, { status: 500 });
  }
}
