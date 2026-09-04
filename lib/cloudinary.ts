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
    const result = await cloudinary.api.resources_by_tag('timrat_new_year', {
      max_results: 500,
      context: true,
      tags: true,
      direction: 'desc',
    });

    const items: GalleryItem[] = (result.resources || []).map((res: any) => {
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
      };
    });

    return items.sort((a, b) => b.time - a.time);
  } catch (err) {
    console.warn('Error fetching items from Cloudinary:', err);
    return [];
  }
}

export async function deleteFromCloudinary(publicIds: string[]): Promise<void> {
  try {
    if (publicIds.length > 0) {
      await cloudinary.api.delete_resources(publicIds);
    }
  } catch (err) {
    console.warn('Error deleting resources from Cloudinary:', err);
  }
}
