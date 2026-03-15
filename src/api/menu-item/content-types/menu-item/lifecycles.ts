/**
 * Lifecycle hooks for Menu Item
 * Validates:
 * 1. Slug uniqueness within a menu
 * 2. Prevent circular parent-child relations
 */

export default {
  async beforeCreate(event: any) {
    await validateMenuItem(event.params.data);
  },

  async beforeUpdate(event: any) {
    const currentId = event.params.where?.id || event.params.data.id;
    await validateMenuItem(event.params.data, currentId);
  },
};

async function validateMenuItem(data: any, currentId?: number) {
  const slug = data.slug;

  console.log("=== LIFECYCLE DEBUG ===");
  console.log("Data received:", JSON.stringify(data, null, 2));
  console.log("data.menu:", data.menu, typeof data.menu);
  console.log("currentId:", currentId);

  /* -------------------------
     Extract menu ID safely
  ------------------------- */
  let menuId: number | null = null;

  // Schema defines 'menu' as oneToOne relation (singular)
  if (data.menu) {
    if (typeof data.menu === 'number') {
      // Direct ID format
      menuId = data.menu;
      console.log("✓ Menu detected as number:", menuId);
    } else if (data.menu.connect?.id) {
      // Connect format: { connect: { id: 1 } }
      menuId = data.menu.connect.id;
      console.log("✓ Menu detected via connect:", menuId);
    } else if (data.menu.set?.[0]?.id) {
      // Set format from POST/PUT: { set: [{ id: 1 }] }
      menuId = data.menu.set[0].id;
      console.log("✓ Menu detected via set:", menuId);
    } else if (data.menu.id) {
      // Direct object format: { id: 1 }
      menuId = data.menu.id;
      console.log("✓ Menu detected via id:", menuId);
    }
  } else if (currentId) {
    console.log("Menu not in payload, fetching existing item...");
    // On update, if menu isn't in the payload, fetch the existing item to get its menu
    const existingItem: any = await strapi.entityService.findOne(
      "api::menu-item.menu-item",
      currentId,
      { populate: { menu: true } }
    );

    if (existingItem?.menu?.id) {
      menuId = existingItem.menu.id;
      console.log("✓ Menu fetched from existing item:", menuId);
    }
  }

  console.log("Final menuId:", menuId);
  console.log("======================");

  /* -------------------------
     Slug uniqueness check
  ------------------------- */
  if (slug && menuId) {
    console.log(`Checking slug "${slug}" uniqueness for menu ${menuId}...`);
    // Fetch all menu items under this menu
    const menuItems: any[] = await strapi.entityService.findMany(
      "api::menu-item.menu-item",
      {
        filters: { menu: { id: menuId } },
      }
    );

    console.log(`Found ${menuItems.length} items in menu ${menuId}:`, menuItems.map(m => m.slug));

    // Get set of existing slugs (excluding current item if updating)
    const existingSlugs = menuItems
      .filter((item: any) => item.id !== currentId)
      .map((item: any) => item.slug);

    console.log("Existing slugs (excluding current):", existingSlugs);
    console.log("New slug to save:", slug);

    // Check if slug already exists
    if (existingSlugs.includes(slug)) {
      throw new Error(`Slug "${slug}" already exists in this menu.`);
    }

    console.log("✓ Slug is unique!");
  } else {
    console.log("⚠ Slug or menuId missing - validation skipped");
  }

  /* ------------------------------
     Prevent circular nesting
  ------------------------------ */
  let parentId: number | null = null;

  if (data.parent) {
    if (typeof data.parent === 'number') {
      parentId = data.parent;
    } else if (data.parent.connect?.id) {
      parentId = data.parent.connect.id;
    } else if (data.parent.id) {
      parentId = data.parent.id;
    }
  }

  if (parentId) {
    let currentParentId: number | null = parentId;

    while (currentParentId) {
      if (currentParentId === currentId) {
        throw new Error("Circular parent-child relation detected.");
      }

      const parentItem: any = await strapi.entityService.findOne(
        "api::menu-item.menu-item",
        currentParentId,
        {
          populate: { parent: true },
        }
      );

      if (!parentItem?.parent?.id) break;

      currentParentId = parentItem.parent.id;
    }
  }
}