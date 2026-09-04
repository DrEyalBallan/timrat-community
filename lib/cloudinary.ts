import { v2 as cloudinary } from 'cloudinary';
import { GalleryItem } from './storage';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dp4uagtq9',
  api_key: process.env.CLOUDINARY_API_KEY || '652565257832732',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'SUr7VNDvITDZ796Yx6XW5Itgk-E',
  secure: true,
});

export { cloudinary };

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  options: {
    firstName: string;
    lastName: string;
    greeting: string;
    token?: string;
    resourceType?: 'image' | 'video' | 'auto';
  }
): Promise<GalleryItem> {
  const timestamp = Date.now();
  const uniqueId = Math.random().toString(36).slice(2, 10);
  const publicId = `timrat_${timestamp}_${uniqueId}`;

  const firstNameB64 = Buffer.from(options.firstName || '', 'utf-8').toString('base64');
  const lastNameB64 = Buffer.from(options.lastName || '', 'utf-8').toString('base64');
  const greetingB64 = Buffer.from(options.greeting || '', 'utf-8').toString('base64');
  const fullName = [options.firstName, options.lastName].filter(Boolean).join(' ').trim();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'timrat-community',
        public_id: publicId,
        resource_type: options.resourceType || 'auto',
        tags: ['timrat_new_year'],
        context: {
          first_name_b64: firstNameB64,
          last_name_b64: lastNameB64,
          greeting_b64: greetingB64,
          token: options.token || '',
          time: timestamp.toString(),
        },
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error('Upload to Cloudinary failed'));
        }

        const item: GalleryItem = {
          id: `${timestamp}-${uniqueId}`,
          url: result.secure_url,
          firstName: options.firstName,
          lastName: options.lastName,
          fullName: fullName || 'תושב/ת תמרת',
          greeting: options.greeting,
          time: timestamp,
          token: options.token,
          filename: result.public_id,
        };

        resolve(item);
      }
    );

    stream.end(buffer);
  });
}

export async function fetchAllCloudinaryGalleryItems(): Promise<GalleryItem[]> {
  try {
    const [imageResult, videoResult] = await Promise.all([
      cloudinary.api.resources_by_tag('timrat_new_year', {
        resource_type: 'image',
        max_results: 500,
        context: true,
        tags: true,
        direction: 'desc',
      }).catch((err) => {
        console.warn('Error fetching image resources from Cloudinary:', err);
        return { resources: [] };
      }),
      cloudinary.api.resources_by_tag('timrat_new_year', {
        resource_type: 'video',
        max_results: 500,
        context: true,
        tags: true,
        direction: 'desc',
      }).catch((err) => {
        console.warn('Error fetching video resources from Cloudinary:', err);
        return { resources: [] };
      }),
    ]);

    const allResources = [...(imageResult.resources || []), ...(videoResult.resources || [])]
      .filter((res: any) => !res.placeholder && (res.bytes === undefined || res.bytes > 0));
    const items: GalleryItem[] = allResources.map((res: any) => {
      const ctx = res.context?.custom || {};
      let firstName = '';
      let lastName = '';
      let greeting = '';

      try {
        if (ctx.first_name_b64) firstName = Buffer.from(ctx.first_name_b64, 'base64').toString('utf-8');
        else if (ctx.first_name) firstName = ctx.first_name;
      } catch {}

      try {
        if (ctx.last_name_b64) lastName = Buffer.from(ctx.last_name_b64, 'base64').toString('utf-8');
        else if (ctx.last_name) lastName = ctx.last_name;
      } catch {}

      try {
        if (ctx.greeting_b64) greeting = Buffer.from(ctx.greeting_b64, 'base64').toString('utf-8');
        else if (ctx.greeting) greeting = ctx.greeting;
      } catch {}

      const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || 'תושב/ת תמרת';
      const time = parseInt(ctx.time || '0', 10) || new Date(res.created_at).getTime();

      let aiVideoUrl = ctx.ai_video_url || '';
      if (!aiVideoUrl && ctx.ai_video_b64) {
        try {
          aiVideoUrl = Buffer.from(ctx.ai_video_b64, 'base64').toString('utf-8');
        } catch {}
      }

      return {
        id: res.asset_id || res.public_id,
        url: res.secure_url,
        firstName,
        lastName,
        fullName,
        greeting,
        time,
        token: ctx.token || '',
        filename: res.public_id,
        aiVideoUrl: aiVideoUrl || undefined,
      };
    });

    return items.sort((a, b) => b.time - a.time);
  } catch (err) {
    console.warn('Error fetching items from Cloudinary:', err);
    return [];
  }
}

export async function uploadAiVideoToCloudinary(buffer: Buffer): Promise<string> {
  const timestamp = Date.now();
  const uniqueId = Math.random().toString(36).slice(2, 10);
  const publicId = `ai_video_${timestamp}_${uniqueId}`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'timrat-community/ai-videos',
        public_id: publicId,
        resource_type: 'video',
        tags: ['timrat_ai_video'],
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error('Upload AI video failed'));
        }
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

export async function updateCloudinaryItemAiVideo(publicId: string, aiVideoUrl?: string): Promise<void> {
  try {
    if (aiVideoUrl) {
      const b64 = Buffer.from(aiVideoUrl, 'utf-8').toString('base64');
      await cloudinary.uploader.add_context(`ai_video_b64=${b64}|ai_video_url=${encodeURIComponent(aiVideoUrl)}`, [publicId]);
    } else {
      await cloudinary.uploader.add_context('ai_video_b64=|ai_video_url=', [publicId]);
    }
  } catch (err) {
    console.warn('Could not update Cloudinary context:', err);
  }
}

export async function deleteFromCloudinary(publicIds: string[]): Promise<void> {
  try {
    if (publicIds.length > 0) {
      // 1. Untag immediately so queries by tag never return deleted placeholders
      try {
        await cloudinary.uploader.remove_tag('timrat_new_year', publicIds);
      } catch (e) {
        console.warn('Could not remove tag from Cloudinary items:', e);
      }

      // 2. Delete both image and video resources from Cloudinary
      await cloudinary.api.delete_resources(publicIds, { resource_type: 'image' }).catch(() => null);
      await cloudinary.api.delete_resources(publicIds, { resource_type: 'video' }).catch(() => null);
    }
  } catch (err) {
    console.warn('Error deleting resources from Cloudinary:', err);
  }
}

export function generateUploadSignature(folder: string = 'timrat-community', tags: string = 'timrat_new_year') {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const paramsToSign: Record<string, any> = {
    folder,
    tags,
    timestamp,
  };
  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET || 'SUr7VNDvITDZ796Yx6XW5Itgk-E'
  );
  return {
    signature,
    timestamp,
    apiKey: process.env.CLOUDINARY_API_KEY || '652565257832732',
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'dp4uagtq9',
    folder,
    tags,
  };
}

export async function addCloudinaryMetadata(
  publicId: string,
  data: { firstName?: string; lastName?: string; greeting?: string; token?: string }
): Promise<void> {
  try {
    const firstNameB64 = Buffer.from(data.firstName || '', 'utf-8').toString('base64');
    const lastNameB64 = Buffer.from(data.lastName || '', 'utf-8').toString('base64');
    const greetingB64 = Buffer.from(data.greeting || '', 'utf-8').toString('base64');
    const token = data.token || '';
    const time = Date.now().toString();

    await cloudinary.uploader.add_context(
      `first_name_b64=${firstNameB64}|last_name_b64=${lastNameB64}|greeting_b64=${greetingB64}|token=${token}|time=${time}`,
      [publicId]
    );
  } catch (err) {
    console.warn('Could not add context to Cloudinary asset:', err);
  }
}


