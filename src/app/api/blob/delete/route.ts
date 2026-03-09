/**
 * Delete Blob Image API
 *
 * DELETE /api/blob/delete?url=<image_url>
 *
 * Deletes an image from Vercel Blob storage.
 * Used for cleanup when user cancels/abandons AI analysis.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { deleteFoodImage, listUserImages } from '@/lib/blob';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * DELETE /api/blob/delete
 *
 * Deletes a blob image by URL.
 * Only allows deletion of images owned by the authenticated user.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const searchParams = request.nextUrl.searchParams;
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    // Verify the image belongs to this user
    const userImages = await listUserImages(userId);
    const isOwnedByUser = userImages.some(
      (blob) => blob.url === imageUrl
    );

    if (!isOwnedByUser) {
      return NextResponse.json(
        { error: 'Image not found or not owned by user' },
        { status: 404 }
      );
    }

    // Check if image is attached to any food log
    // Extract filename from URL to check against food_logs if needed
    // For now, we allow deletion since images are only stored if user saves

    // Delete the image
    await deleteFoodImage(imageUrl);

    return NextResponse.json({
      success: true,
      message: 'Image deleted successfully',
    });
  } catch (error) {
    console.error('Blob delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete image' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/blob/delete
 *
 * Alternative POST method for deletion (for clients that don't support DELETE).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { imageUrl } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    // Verify the image belongs to this user
    const userImages = await listUserImages(userId);
    const isOwnedByUser = userImages.some(
      (blob) => blob.url === imageUrl
    );

    if (!isOwnedByUser) {
      return NextResponse.json(
        { error: 'Image not found or not owned by user' },
        { status: 404 }
      );
    }

    // Delete the image
    await deleteFoodImage(imageUrl);

    return NextResponse.json({
      success: true,
      message: 'Image deleted successfully',
    });
  } catch (error) {
    console.error('Blob delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete image' },
      { status: 500 }
    );
  }
}
