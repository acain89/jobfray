import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const categories = [
  {
    name: "Lawn Care",
    slug: "lawn-care",
    description: "Mowing, edging, trimming, and simple lawn cleanup.",
    sortOrder: 10,
  },
  {
    name: "Junk Removal",
    slug: "junk-removal",
    description: "Small haul-offs, unwanted items, and light cleanup jobs.",
    sortOrder: 20,
  },
  {
    name: "Moving Help",
    slug: "moving-help",
    description: "Loading, unloading, carrying, and small moving help.",
    sortOrder: 30,
  },
  {
    name: "Furniture Assembly",
    slug: "furniture-assembly",
    description: "Basic assembly for furniture, shelves, beds, desks, and similar items.",
    sortOrder: 40,
  },
  {
    name: "Mounting / Install Help",
    slug: "mounting-install-help",
    description: "Simple mounting and non-licensed install help.",
    sortOrder: 50,
  },
  {
    name: "Cleaning Help",
    slug: "cleaning-help",
    description: "Basic home, garage, patio, and move-out cleaning help.",
    sortOrder: 60,
  },
  {
    name: "Yard Cleanup",
    slug: "yard-cleanup",
    description: "Leaves, branches, weeds, debris, and general yard cleanup.",
    sortOrder: 70,
  },
  {
    name: "Hauling",
    slug: "hauling",
    description: "Pickup truck help, small loads, and local hauling.",
    sortOrder: 80,
  },
  {
    name: "Basic Handyman",
    slug: "basic-handyman",
    description: "Simple non-licensed household tasks and light repairs.",
    sortOrder: 90,
  },
];

async function main(): Promise<void> {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        isActive: true,
        sortOrder: category.sortOrder,
      },
      create: {
        name: category.name,
        slug: category.slug,
        description: category.description,
        isActive: true,
        sortOrder: category.sortOrder,
      },
    });
  }

  console.log(`Seeded ${categories.length} JobFray categories.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });