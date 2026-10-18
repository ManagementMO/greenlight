import { getPublicArtifacts } from '@/lib/artifacts';
export async function GET() {
  return Response.json(getPublicArtifacts(), { headers: { 'Cache-Control': 'public, max-age=60' } });
}
