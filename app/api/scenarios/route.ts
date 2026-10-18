import { listScenarios } from '@/lib/domain';
export async function GET() {
  return Response.json({ scenarios: listScenarios() }, { headers: { 'Cache-Control': 'public, max-age=60' } });
}
