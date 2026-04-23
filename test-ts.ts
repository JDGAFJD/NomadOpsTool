import { ThingSpaceService } from './src/lib/services/ThingSpaceService';

async function test() {
  const tsService = new ThingSpaceService();
  const d = new Date(); d.setDate(d.getDate() - 60);
  const earliestIso = new Date(d.toISOString().split('T')[0] + "T00:00:00Z").toISOString();
  const latestIso = new Date(new Date().toISOString().split('T')[0] + "T23:59:59Z").toISOString();

  console.log("Fetching for:", "89148000011152375893", earliestIso, latestIso);
  const res = await tsService.getDeviceUsageData("89148000011152375893", earliestIso, latestIso);
  console.log(JSON.stringify(res, null, 2));
}

test();
