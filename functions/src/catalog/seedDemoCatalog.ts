import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

const VENUES: {
  id: string;
  name: string;
  types: string[];
  pricePerDay: number;
  maxCapacity: number;
  description: string;
  amenities: string[];
}[] = [
  {
    id: "v-grand-ballroom",
    name: "The Grand Ocean Ballroom",
    types: ["Wedding", "Conference", "Party"],
    pricePerDay: 25000,
    maxCapacity: 400,
    description: "Flagship venue featuring crystal chandeliers, panoramic ocean views, and a massive mahogany dance floor.",
    amenities: ["AV System", "Mahogany Dance Floor", "Private Bar", "Stage", "Backstage VIP Area"],
  },
  {
    id: "v-ashanti-estate",
    name: "Ashanti Estate",
    types: ["Wedding", "Party", "Social"],
    pricePerDay: 32000,
    maxCapacity: 300,
    description: "An exclusive, secluded estate offering ultimate privacy - sprawling lawns and an elegant arrival courtyard.",
    amenities: ["Private Courtyard", "Bridal Suite", "Fountain Feature", "Exclusive Entrance"],
  },
  {
    id: "v-klein-vineyards",
    name: "Klein Parys Vineyards",
    types: ["Wedding", "Party", "Social"],
    pricePerDay: 18000,
    maxCapacity: 120,
    description: "Rustic charm meets luxury. Nestled against the resort vineyards - a breathtaking intimate backdrop.",
    amenities: ["Wine Cellar Access", "Rustic Decor", "Fairy Lighting", "Outdoor Fire Pits"],
  },
  {
    id: "v-beach-pavilion",
    name: "Sunset Beach Pavilion",
    types: ["Wedding", "Party", "Social"],
    pricePerDay: 15000,
    maxCapacity: 150,
    description: "An elegant open-air structure directly on the sand with crashing waves as the backdrop.",
    amenities: ["Open Air Architecture", "Direct Beach Access", "Tiki Torches", "Ambient Lighting"],
  },
  {
    id: "v-garden-terrace",
    name: "Botanical Garden Terrace",
    types: ["Party", "Social", "Wedding"],
    pricePerDay: 9000,
    maxCapacity: 80,
    description: "A lush, manicured garden space surrounded by indigenous flora - ideal for intimate events.",
    amenities: ["Marquee Available", "Floral Arches", "Outdoor Seating", "Water Features"],
  },
];

const CATERING_PACKAGES: {
  id: string;
  name: string;
  pricePerPerson: number;
  minPeople: number;
  images: string[];
  description: string;
  menuDetails: string[];
}[] = [
  {
    id: "spit-braai-trad",
    name: "Traditional Spit Braai",
    pricePerPerson: 200,
    minPeople: 25,
    images: [
      "highlands_braai_combo_1.jpg",
      "highlands_braai_combo_2.jpg",
      "highlands_braai_combo_3.jpg",
      "highlands_braai_combo_4.jpg",
    ],
    description: "Traditional Lamb on the Spit - basted in our secret marinade.",
    menuDetails: [
      "Served with Home Made Mint Sauce",
      "Choice of One: Spit Braai baby Potatoes, Lemon & Rosemary Potato Wedges, Garlic & Parsley Baby Potatoes",
      "Choice of Two: Greek, Pasta, Curried Pasta, Curried Rice, Coleslaw, 3 Bean, Potato with Egg",
      "Choice of One Bread: Knotted Cocktail Rolls & Butter, Crispy Round Roll, Garlic Bread",
    ],
  },
  {
    id: "spit-braai-chicken",
    name: "Chicken & Spit Braai",
    pricePerPerson: 220,
    minPeople: 25,
    images: [
      "william_wallace_combo_1.jpg",
      "william_wallace_combo_2.jpg",
      "william_wallace_combo_3.jpg",
    ],
    description: "Traditional Lamb & Lemon & Herb Chicken Pieces.",
    menuDetails: [
      "Traditional Lamb on the Spit",
      "Lemon & Herb Chicken Pieces",
      "Choice of one potato or pap side",
      "Choice of two salads",
    ],
  },
  {
    id: "wedding-canapes",
    name: "Wedding Bells Canapes",
    pricePerPerson: 150,
    minPeople: 20,
    images: [
      "wedding_bells_canapes_1.jpg",
      "wedding_bells_canapes_2.jpg",
      "wedding_bells_canapes_3.jpg",
    ],
    description: "Elegant bite-sized starters to welcome your guests.",
    menuDetails: [
      "Chef's selection of premium hot and cold canapes",
      "Includes vegetarian, beef and seafood options",
      "Served on arrival as a welcome snack",
    ],
  },
  {
    id: "wedding-package",
    name: "Wedding Bells Three Package",
    pricePerPerson: 350,
    minPeople: 20,
    images: [
      "wedding_bells_three_package_2.jpg",
      "wedding_bells_three_package_3.jpg",
      "wedding_bells_three_package_4.jpg",
      "wedding_bells_three_package_5.jpg",
    ],
    description: "A comprehensive premium dining experience for your special day.",
    menuDetails: [
      "Plated starter: soup or fresh seasonal salad",
      "Main course: choice of two premium meats",
      "Served with seasonal roasted vegetables and rice",
      "Vegetarian alternative available on request",
    ],
  },
  {
    id: "two-desserts",
    name: "Two Dessert Selection",
    pricePerPerson: 85,
    minPeople: 20,
    images: ["two_desserts_selection_1.jpg", "two_desserts_selection_2.jpg", "two_desserts_selection_3.jpg"],
    description: "A sweet conclusion to your event with traditional favorites.",
    menuDetails: [
      "Traditional South African Malva Pudding with warm custard",
      "Decadent Peppermint Crisp Tart",
      "Accompanied by seasonal fruit skewers",
    ],
  },
  {
    id: "mixed-beverages",
    name: "Mixed Beverages & Soft Drinks",
    pricePerPerson: 65,
    minPeople: 10,
    images: ["mixed_beverages_soft_drinks_1.jpg", "mixed_beverages_soft_drinks_2.jpg", "mixed_beverages_soft_drinks_3.jpg"],
    description: "Refreshing assorted beverages served on ice.",
    menuDetails: [
      "Assorted 300ml sodas (Coke, Sprite, Fanta)",
      "100% fruit juice selections",
      "Still and sparkling mineral water",
      "Self-service iced beverage station",
    ],
  },
];

/**
 * Seeds the demo venue + catering catalog into Firestore.
 *
 * The venue/catering data is required demo content for the development
 * environment; once seeded, the mobile app reads ONLY from Firestore
 * (no hardcoded arrays). Admin-only and idempotent.
 */
export const seedDemoCatalog = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }
  const userRef = db.collection("users").doc(context.auth.uid);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data()! : null;
  if (!userData || userData.role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Admin role required to seed catalogs");
  }

  await db.collection("seed_meta").doc("catalog").set(
    {
      seededAt: admin.firestore.FieldValue.serverTimestamp(),
      seededBy: context.auth.uid,
      venueCount: VENUES.length,
      packageCount: CATERING_PACKAGES.length,
    },
    { merge: true }
  );

  const batch = db.batch();
  for (const venue of VENUES) {
    batch.set(
      db.collection("venues").doc(venue.id),
      {
        name: venue.name,
        types: venue.types,
        pricePerDay: venue.pricePerDay,
        maxCapacity: venue.maxCapacity,
        description: venue.description,
        amenities: venue.amenities,
        active: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  for (const pkg of CATERING_PACKAGES) {
    batch.set(
      db.collection("catering_packages").doc(pkg.id),
      {
        name: pkg.name,
        pricePerPerson: pkg.pricePerPerson,
        minPeople: pkg.minPeople,
        images: pkg.images,
        description: pkg.description,
        menuDetails: pkg.menuDetails,
        active: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  await batch.commit();

  return { seated: true, venues: VENUES.length, cateringPackages: CATERING_PACKAGES.length };
});