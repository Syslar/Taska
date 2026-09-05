// supabase/functions/delete-cloudinary-media/index.ts
// POST https://<project>.supabase.co/functions/v1/delete-cloudinary-media
//
// Authoritative Cloudinary Media Destroyer:
//   1. Extracts Cloudinary public_id and resource_type from URL or payload
//   2. Generates authenticated SHA-1 signature using Cloudinary API Secret
//   3. Calls Cloudinary REST API to permanently delete the asset
//   4. Returns deletion status to client

const CLOUDINARY_CLOUD_NAME = Deno.env.get('CLOUDINARY_CLOUD_NAME') || 'syslar-taska';
const CLOUDINARY_API_KEY = Deno.env.get('CLOUDINARY_API_KEY') || '544336893486539';
const CLOUDINARY_SECRET_KEY = Deno.env.get('CLOUDINARY_SECRET_KEY') || 'j7pwjNybbdadty-eCuJXBmhE5Xs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function sha1Hex(str: string): Promise<string> {
  const buffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseCloudinaryUrl(mediaUrl: string): { publicId: string; resourceType: string } | null {
  try {
    if (!mediaUrl || typeof mediaUrl !== 'string') return null;
    if (!mediaUrl.includes('cloudinary.com')) return null;

    const resourceType = /\.(mp4|webm|mov)(\?.*)?$/i.test(mediaUrl) || mediaUrl.includes('/video/')
      ? 'video'
      : 'image';

    const uploadIdx = mediaUrl.indexOf('/upload/');
    if (uploadIdx === -1) return null;

    let pathAfterUpload = mediaUrl.substring(uploadIdx + '/upload/'.length);

    // Strip transformation parameters if present (e.g. w_500,c_fill/)
    // Transformations don't start with v\d+/
    const parts = pathAfterUpload.split('/');
    if (parts.length > 1 && /^v\d+$/.test(parts[0])) {
      parts.shift(); // remove version prefix
    } else if (parts.length > 2 && !/^v\d+$/.test(parts[0]) && /^v\d+$/.test(parts[1])) {
      parts.shift(); // remove transformation
      parts.shift(); // remove version
    }

    pathAfterUpload = parts.join('/');

    // Remove query params if any
    const queryIdx = pathAfterUpload.indexOf('?');
    if (queryIdx !== -1) {
      pathAfterUpload = pathAfterUpload.substring(0, queryIdx);
    }

    // Remove file extension
    const lastDotIdx = pathAfterUpload.lastIndexOf('.');
    if (lastDotIdx !== -1) {
      pathAfterUpload = pathAfterUpload.substring(0, lastDotIdx);
    }

    return { publicId: decodeURIComponent(pathAfterUpload), resourceType };
  } catch (_) {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    let publicId = body.publicId;
    let resourceType = body.resourceType || 'image';

    if (body.mediaUrl) {
      const parsed = parseCloudinaryUrl(body.mediaUrl);
      if (parsed) {
        publicId = parsed.publicId;
        resourceType = parsed.resourceType;
      }
    }

    if (!publicId) {
      return new Response(
        JSON.stringify({ error: 'Missing or unparseable publicId/mediaUrl', skipped: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    // Cloudinary signature formula: sorted params string + secret
    const toSign = `public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_SECRET_KEY}`;
    const signature = await sha1Hex(toSign);

    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('timestamp', timestamp.toString());
    formData.append('api_key', CLOUDINARY_API_KEY);
    formData.append('signature', signature);

    const destroyUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`;
    const res = await fetch(destroyUrl, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json().catch(() => ({}));

    return new Response(
      JSON.stringify({ success: res.ok, result: data.result, publicId, data }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    console.error('[Cloudinary Destroy] Error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
