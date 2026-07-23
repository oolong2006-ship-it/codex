/**
 * MASAR 34 seed. Idempotent: safe to run multiple times.
 * Creates RBAC, the demo organization, venue, 8 gates, 12 zones, a flagship
 * event, and the 7 demo users described in the spec (§23).
 *
 * The demo password is DEV-ONLY. See README security note.
 */
import { PrismaClient, VenueType, ZoneType, GateType, GateStatus, EventType, EventStatus, SecurityLevel, PartnerType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  ROLES,
  ROLE_METADATA,
  ROLE_PERMISSIONS,
  PERMISSIONS,
  permissionParts,
  RoleKey,
} from '../src/common/rbac';

const prisma = new PrismaClient();
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Masar34!Demo';

async function seedRbac() {
  // Permissions
  const permKeys = Object.values(PERMISSIONS);
  for (const key of permKeys) {
    const { resource, action } = permissionParts(key);
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, resource, action },
    });
  }

  // Roles + grants
  for (const roleKey of Object.keys(ROLE_PERMISSIONS) as RoleKey[]) {
    const meta = ROLE_METADATA[roleKey];
    const role = await prisma.role.upsert({
      where: { key: roleKey },
      update: { name: meta.name, arabicName: meta.arabicName },
      create: { key: roleKey, name: meta.name, arabicName: meta.arabicName },
    });
    // reset grants to match code definition
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const perms = await prisma.permission.findMany({
      where: { key: { in: ROLE_PERMISSIONS[roleKey] } },
    });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
  console.log('✓ RBAC seeded');
}

async function seedOrganization() {
  const org = await prisma.organization.upsert({
    where: { id: 'org_saudi_events' },
    update: {},
    create: {
      id: 'org_saudi_events',
      name: 'Saudi Events Operations',
      arabicName: 'العمليات السعودية للفعاليات',
      commercialName: 'Saudi Events Operations Co.',
      type: 'GOVERNMENT_OPERATOR',
      country: 'SA',
      city: 'Riyadh',
      contactPerson: 'Operations Director',
      email: 'ops@masar34.sa',
      status: 'ACTIVE',
      subscriptionPlan: 'ENTERPRISE',
    },
  });
  console.log('✓ Organization seeded');
  return org;
}

async function seedVenue(orgId: string) {
  const venue = await prisma.venue.upsert({
    where: { id: 'venue_kingdom_arena' },
    update: {},
    create: {
      id: 'venue_kingdom_arena',
      organizationId: orgId,
      name: 'Kingdom Arena Demo Venue',
      arabicName: 'أرينا المملكة التجريبية',
      type: VenueType.STADIUM,
      address: 'Boulevard City, Riyadh',
      city: 'Riyadh',
      latitude: 24.7743,
      longitude: 46.6031,
      capacity: 65000,
      numGates: 8,
      numZones: 12,
      numParkingAreas: 4,
      emergencyExits: 16,
      status: 'OPERATIONAL',
      contactManager: 'Venue Operations Manager',
    },
  });

  // 8 gates
  const gateDefs = Array.from({ length: 8 }, (_, i) => ({
    code: `G${i + 1}`,
    name: `Gate ${i + 1}`,
    type: i === 0 ? GateType.VIP : GateType.BIDIRECTIONAL,
    maxCapacityPerMinute: 40 + i * 5,
  }));
  for (const g of gateDefs) {
    await prisma.gate.upsert({
      where: { venueId_code: { venueId: venue.id, code: g.code } },
      update: {},
      create: {
        organizationId: orgId,
        venueId: venue.id,
        code: g.code,
        name: g.name,
        type: g.type,
        maxCapacityPerMinute: g.maxCapacityPerMinute,
        status: GateStatus.OPEN,
      },
    });
  }

  // 12 zones (incl. parking x4, food x3, medical, VIP, family, transport)
  const zoneDefs: { id: string; name: string; arabicName: string; type: ZoneType; capacity: number }[] = [
    { id: 'zone_seating_north', name: 'North Seating', arabicName: 'المدرجات الشمالية', type: ZoneType.SEATING, capacity: 16000 },
    { id: 'zone_seating_south', name: 'South Seating', arabicName: 'المدرجات الجنوبية', type: ZoneType.SEATING, capacity: 16000 },
    { id: 'zone_food_east', name: 'East Food Court', arabicName: 'ساحة الطعام الشرقية', type: ZoneType.FOOD, capacity: 1200 },
    { id: 'zone_food_west', name: 'West Food Court', arabicName: 'ساحة الطعام الغربية', type: ZoneType.FOOD, capacity: 1200 },
    { id: 'zone_food_central', name: 'Central Food Court', arabicName: 'ساحة الطعام المركزية', type: ZoneType.FOOD, capacity: 900 },
    { id: 'zone_parking_a', name: 'Parking A', arabicName: 'موقف أ', type: ZoneType.PARKING, capacity: 3000 },
    { id: 'zone_parking_b', name: 'Parking B', arabicName: 'موقف ب', type: ZoneType.PARKING, capacity: 3000 },
    { id: 'zone_parking_c', name: 'Parking C', arabicName: 'موقف ج', type: ZoneType.PARKING, capacity: 2500 },
    { id: 'zone_parking_d', name: 'Parking D', arabicName: 'موقف د', type: ZoneType.PARKING, capacity: 2500 },
    { id: 'zone_medical', name: 'Medical Center', arabicName: 'المركز الطبي', type: ZoneType.MEDICAL, capacity: 120 },
    { id: 'zone_vip', name: 'VIP Lounge', arabicName: 'صالة كبار الشخصيات', type: ZoneType.VIP, capacity: 800 },
    { id: 'zone_family', name: 'Family Area', arabicName: 'منطقة العائلات', type: ZoneType.FAMILY, capacity: 2000 },
    { id: 'zone_transport', name: 'Transport Hub', arabicName: 'مركز النقل', type: ZoneType.TRANSPORTATION, capacity: 5000 },
  ];
  for (const z of zoneDefs) {
    await prisma.zone.upsert({
      where: { id: z.id },
      update: {},
      create: {
        id: z.id,
        organizationId: orgId,
        venueId: venue.id,
        name: z.name,
        arabicName: z.arabicName,
        type: z.type,
        capacity: z.capacity,
        currentOccupancy: Math.round(z.capacity * 0.3),
        entryPoints: 2,
        exitPoints: 2,
      },
    });
  }
  console.log('✓ Venue, 8 gates, 13 zones seeded');
  return venue;
}

async function seedEvent(orgId: string, venueId: string) {
  const start = new Date();
  start.setHours(start.getHours() + 2);
  const end = new Date(start);
  end.setHours(end.getHours() + 4);

  const event = await prisma.event.upsert({
    where: { id: 'event_intl_football_2034' },
    update: {},
    create: {
      id: 'event_intl_football_2034',
      organizationId: orgId,
      venueId,
      name: 'International Football Event 2034 Simulation',
      arabicName: 'محاكاة فعالية كرة القدم الدولية 2034',
      type: EventType.FOOTBALL,
      status: EventStatus.ACTIVE,
      startDate: start,
      endDate: end,
      doorsOpenTime: new Date(start.getTime() - 90 * 60_000),
      expectedAttendance: 65000,
      organizer: 'Saudi Events Operations',
      securityLevel: SecurityLevel.HIGH,
      weatherConditions: 'Clear, 32°C',
      transportationPlan: 'Metro + shuttle from park-and-ride',
      emergencyPlan: 'Standard stadium evacuation protocol v3',
    },
  });
  console.log('✓ Flagship event seeded');
  return event;
}

async function seedUsers(orgId: string) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, Number(process.env.BCRYPT_ROUNDS ?? 12));
  const demoUsers: { email: string; fullName: string; arabicName: string; role: RoleKey; org: string | null }[] = [
    { email: 'superadmin@masar34.sa', fullName: 'Super Admin', arabicName: 'مدير النظام', role: ROLES.SUPER_ADMIN, org: null },
    { email: 'admin@masar34.sa', fullName: 'Organization Admin', arabicName: 'مدير الجهة', role: ROLES.ORG_ADMIN, org: orgId },
    { email: 'operations@masar34.sa', fullName: 'Operations Manager', arabicName: 'مدير العمليات', role: ROLES.OPERATIONS_MANAGER, org: orgId },
    { email: 'operator@masar34.sa', fullName: 'Control Room Operator', arabicName: 'مشغل غرفة العمليات', role: ROLES.CONTROL_ROOM_OPERATOR, org: orgId },
    { email: 'supervisor@masar34.sa', fullName: 'Field Supervisor', arabicName: 'مشرف ميداني', role: ROLES.FIELD_SUPERVISOR, org: orgId },
    { email: 'analyst@masar34.sa', fullName: 'Analyst', arabicName: 'محلل', role: ROLES.ANALYST, org: orgId },
    { email: 'partner@masar34.sa', fullName: 'Partner User', arabicName: 'مستخدم شريك', role: ROLES.PARTNER_USER, org: orgId },
  ];

  for (const u of demoUsers) {
    const role = await prisma.role.findUnique({ where: { key: u.role } });
    if (!role) continue;
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { organizationId: u.org ?? undefined, fullName: u.fullName, arabicName: u.arabicName },
      create: {
        email: u.email,
        passwordHash,
        fullName: u.fullName,
        arabicName: u.arabicName,
        organizationId: u.org,
        emailVerified: true,
        status: 'ACTIVE',
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }
  console.log('✓ 7 demo users seeded');
}

async function seedPartner(orgId: string, venueId: string) {
  const partner = await prisma.partner.upsert({
    where: { id: 'partner_demo_restaurant' },
    update: {},
    create: {
      id: 'partner_demo_restaurant',
      organizationId: orgId,
      name: 'Al Nakheel Restaurant',
      arabicName: 'مطعم النخيل',
      type: PartnerType.RESTAURANT,
      contactEmail: 'partner@masar34.sa',
    },
  });
  await prisma.partnerLocation.upsert({
    where: { id: 'partner_loc_food_east' },
    update: {},
    create: {
      id: 'partner_loc_food_east',
      partnerId: partner.id,
      venueId,
      zoneId: 'zone_food_east',
      name: 'East Food Court Kiosk',
      latitude: 24.7745,
      longitude: 46.6035,
    },
  });
  console.log('✓ Demo partner seeded');
}

async function main() {
  console.log('Seeding MASAR 34...');
  await seedRbac();
  const org = await seedOrganization();
  const venue = await seedVenue(org.id);
  await seedEvent(org.id, venue.id);
  await seedUsers(org.id);
  await seedPartner(org.id, venue.id);
  console.log(`\nDone. Demo password (DEV ONLY): ${DEMO_PASSWORD}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
